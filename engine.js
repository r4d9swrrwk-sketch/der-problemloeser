/* Der Problemlöser — app.js part 1: data, steps, state, branching, Ollama, rule-based analyzer */
"use strict";

// ─── STATE ───────────────────────────────────────────────────
const S = {
  step: 0,
  answers: {},          // keyed by step id
  path: [],             // sequence of step ids actually visited
  ollama: false,
  model: "llama3.2",
  ollamaUrl: "http://localhost:11434/api/chat",
};

// ─── STORAGE ─────────────────────────────────────────────────
const STORE_KEY = "problemloeserResults";
function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } }
function saveStore(arr) { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }

// ─── CRISIS DETECTION ─────────────────────────────────────────
const CRISIS_RX = /\b(suizid|selbstmord|selbsttöt|sich umbringen|leben nicht mehr|tot sein|sterben wollen|schluss machen|kein grund mehr zu leben|end it all|kill myself|suicide|nicht mehr leben)\b/i;
function isCrisis(text) { return CRISIS_RX.test(text || ""); }

// ─── PROBLEM TYPE DETECTION (rule-based) ──────────────────────
function detectType(text) {
  const t = (text || "").toLowerCase();
  if (/\b(beruf|job|chef|boss|arbeit|karr?iere|gehalt|beförderung|kündigung|firma|unternehmen|colleague|kolleg)\b/.test(t)) return "career";
  if (/\b(partner|beziehung|liebe|ehe|frau|mann|freundin|freund|freund|ex|trennung|scheiding|familie|eltern|mutter|vater|kind|kinder|schwanger|verheirat)\b/.test(t)) return "relationship";
  if (/\b(depress|angst|panic|trauma|stress|burnout|müde|erschöpft|hopeless|hoffnungslos|selbstwert|mental|psyche|therapie|medikament|schlaf|schlaflos|niedergeschlagen|traurig)\w*\b/.test(t)) return "mental";
  if (/\b(geld|schulden|finanz|sparen|kredit|miete|rechnung|bank|insolvenz|pleite|teuer|budget)\b/.test(t)) return "financial";
  if (/\b(identität|wer bin ich|selbstfindung|gender|sexuell|religion|sinns?|zugehörigkeit|herkunft|kultur|wandel)\b/.test(t)) return "identity";
  return "other";
}

function detectEmotion(text) {
  const t = (text || "").toLowerCase();
  let score = 0;
  if (/[!]{2,}|SCHREI|verzweifelt|panik|hass|wut|ausrast/i.test(t)) score += 2;
  if (/\b(traurig|niedergeschlagen|hopeless|hass|furcht|schreck|furchtbar|entsetzt|wein)\b/i.test(t)) score += 1;
  if (t.length > 300) score += 1;
  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
}

// ─── STEP DEFINITIONS ─────────────────────────────────────────
// Each step: { id, phase, title, help, type, options?, placeholder?, minLen?, crisisCheck? }
const STEPS = [
  {
    id: "problem",
    phase: 1, label: "Problemerfassung",
    title: "Was ist dein Problem? Beschreib es so konkret wie möglich in 2–3 Sätzen.",
    help: "Je genauer du formulierst, desto besser können die nachfolgenden Fragen zielen.",
    type: "textarea", minLen: 10, crisisCheck: true,
    chip: "Schritt 1 · Problem",
  },
  {
    id: "canSolve",
    phase: 2, label: "Kontrolle & Handlungsmacht",
    title: "Hast du die Fähigkeit oder Macht, dieses Problem direkt zu beeinflussen?",
    help: "Ehrliche Antwort — niemand wertet dich.",
    type: "yesno",
    chip: "Schritt 2 · Locus of Control",
  },
  // Branch A: JA → "Warum tust du es nicht?"
  {
    id: "whyNot",
    phase: 2, label: "Kontrolle & Handlungsmacht",
    title: "Wenn du dieses Problem lösen KANNST … wieso tust du es dann NICHT?",
    help: "Wähle, was am ehesten auf dich zutrifft — oder schreib frei.",
    type: "choice-or-text",
    options: [
      "Ich habe Angst vor der Veränderung",
      "Mir fehlt die Motivation / Energie",
      "Ich kenne nicht den ersten Schritt",
      "Es gibt mir unbewusst auch etwas, es zu haben",
      "Ich bin nicht sicher, ob meine Lösung funktioniert",
    ],
    chip: "Schritt 2a · Warum nicht?",
    showIf: (a) => a.canSolve === "yes",
  },
  // Branch B: NEIN → external locus
  {
    id: "whyExternal",
    phase: 2, label: "Kontrolle & Handlungsmacht",
    title: "Warum glaubst du, dass du es nicht lösen kannst? Was hindert dich?",
    help: "Beschreib das Hindernis so konkret du kannst.",
    type: "textarea", minLen: 5,
    chip: "Schritt 2b · Externes Hindernis",
    showIf: (a) => a.canSolve === "no",
  },
  {
    id: "externalReframe",
    phase: 2, label: "Kontrolle & Handlungsmacht",
    title: "Ist dieses Hindernis wirklich EXTERN (andere Person / Umstand)? Oder gibt es einen Teil, den du DOCH kontrollierst?",
    help: "Oft gibt es einen kleinen Hebel, den man selbst in der Hand hat.",
    type: "textarea", minLen: 5,
    chip: "Schritt 2b · Anteil selbst?",
    showIf: (a) => a.canSolve === "no",
  },
  // Readiness (only if external path)
  {
    id: "readiness",
    phase: 3, label: "Motivation & Bereitschaft",
    title: "Bist du BEREIT, etwas dafür zu tun, um es selbst zu lösen?",
    help: "Auf einer Skala von 1 (gar nicht) bis 10 (absolut bereit).",
    type: "slider",
    chip: "Schritt 3 · Bereitschaft",
    showIf: (a) => a.canSolve === "no",
  },
  {
    id: "readinessLow",
    phase: 3, label: "Motivation & Bereitschaft",
    title: "Wenn du nicht bereit bist, etwas zu tun … warum kümmert es dich dann?",
    help: "Ist das echte Besorgnis oder einfach ein Gedanke, den du hegst?",
    type: "textarea", minLen: 5,
    chip: "Schritt 3a · Warum kümmert's dich?",
    showIf: (a) => a.canSolve === "no" && a.readiness !== undefined && a.readiness <= 3,
  },
  // Affected people (all paths merge here)
  {
    id: "affected",
    phase: 4, label: "Einflussbereich",
    title: "Wer wird von diesem Problem negativ beeinflusst?",
    help: "Mehrfachnennung möglich.",
    type: "checkboxes",
    options: [
      "Nur ich",
      "Meine Familie / Partner",
      "Meine Arbeit / Karriere",
      "Meine Freunde / Soziales Netzwerk",
      "Die Gesellschaft / Andere Menschen",
    ],
    chip: "Schritt 4 · Betroffene",
  },
  // Temporal perspective
  {
    id: "time1w",
    phase: 5, label: "Zeitliche Relevanz",
    title: "Wird dieses Problem in EINER WOCHE noch relevant sein?",
    help: "Ehrlich geschätzt.",
    type: "yesno",
    chip: "Schritt 5 · 1 Woche",
  },
  {
    id: "time1m",
    phase: 5, label: "Zeitliche Relevanz",
    title: "Wird es in EINEM MONAT noch relevant sein?",
    type: "yesno",
    chip: "Schritt 5 · 1 Monat",
  },
  {
    id: "time1y",
    phase: 5, label: "Zeitliche Relevanz",
    title: "Wird es in EINEM JAHR noch relevant sein?",
    type: "yesno",
    chip: "Schritt 5 · 1 Jahr",
  },
  // Counterfactual
  {
    id: "counterfactual",
    phase: 6, label: "Rückblick & Lernen",
    title: "Wenn du die Zeit zurückdrehen könntest und dieses Szenario NOCHMAL erleben würdest — wie würdest du es ANDERS machen? Was würdest du FRÜHER erkannt haben?",
    help: "Freitext, so lang du magst.",
    type: "textarea", minLen: 5,
    chip: "Schritt 6 · Rückblick",
  },
  // Smallest step
  {
    id: "smallestStep",
    phase: 7, label: "Handlungs-Klarheit",
    title: "Was ist der KLEINSTE, erste Schritt, den du MORGEN tun könntest?",
    help: "So konkret und klein wie möglich — z. B. „Eine E-Mail schreiben“ statt „Karriere ändern“.",
    type: "textarea", minLen: 3,
    chip: "Schritt 7 · Erster Schritt",
  },
];

// ─── BRANCHING ENGINE ─────────────────────────────────────────
function visibleSteps() {
  const out = [];
  for (const s of STEPS) {
    if (s.showIf && !s.showIf(S.answers)) continue;
    out.push(s);
  }
  return out;
}

function currentStep() {
  const vis = visibleSteps();
  return vis[S.step] || null;
}

function nextStep() {
  S.step++;
  // skip steps whose showIf returns false
  while (currentStep() && currentStep().showIf && !currentStep().showIf(S.answers)) {
    S.step++;
  }
}

function prevStep() {
  if (S.step > 0) S.step--;
  while (currentStep() && currentStep().showIf && !currentStep().showIf(S.answers)) {
    S.step--;
  }
}

// ─── OLLAMA INTEGRATION ───────────────────────────────────────
async function checkOllama() {
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const d = await r.json();
    return (d.models || []).length > 0;
  } catch { return false; }
}

async function ollamaAnalyze(promptText) {
  const r = await fetch(S.ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: S.model,
      stream: false,
      format: "json",
      messages: [{ role: "user", content: promptText }],
    }),
  });
  if (!r.ok) throw new Error("Ollama HTTP " + r.status);
  const d = await r.json();
  return JSON.parse(d.message?.content || "{}");
}

// ─── RULE-BASED ANALYZER (fallback when no Ollama) ───────────
function ruleBasedAnalyze() {
  const a = S.answers;
  const problem = a.problem || "";
  const type = detectType(problem);
  const emotion = detectEmotion(problem);
  const concepts = [];

  // Locus of control
  if (a.canSolve === "no") {
    concepts.push("External Locus of Control");
    if (/ohnmach|machtlos|nichts ändern|kann nicht/.test((a.whyExternal || "").toLowerCase()))
      concepts.push("Learned Helplessness");
  } else {
    if (a.whyNot) {
      const wn = a.whyNot.toLowerCase();
      if (/angst|veränderung/.test(wn)) concepts.push("Fear-Based Avoidance");
      if (/motivation|energie/.test(wn)) concepts.push("Procrastination");
      if (/erster schritt|kenne nicht/.test(wn)) concepts.push("Knowledge Gap");
      if (/unbewusst|nutz|benefit/.test(wn)) concepts.push("Secondary Gain");
      if (/sicher|funktioniert/.test(wn)) concepts.push("Uncertainty Paralysis");
    }
  }

  // Readiness
  if (a.readiness !== undefined && a.readiness <= 3) {
    concepts.push("Low Readiness");
    if (a.readinessLow) concepts.push("Rumination");
  }

  // Temporal
  const t1w = a.time1w === "yes", t1m = a.time1m === "yes", t1y = a.time1y === "yes";
  let sig, sigReason;
  if (t1w && t1m && t1y) { sig = "high"; sigReason = "Langfristig signifikant — echtes, andauerndes Problem."; }
  else if (!t1w && !t1m && !t1y) { sig = "low"; sigReason = "Temporär — kurzfristige Belastung, die verfliegt. Möglichweise Catastrophizing."; concepts.push("Catastrophizing"); }
  else { sig = "medium"; sigReason = "Kontextabhängig — kann sich mit Zeit und Aktion verbessern."; }

  // Counterfactual → growth mindset
  if (a.counterfactual) {
    const cf = a.counterfactual.toLowerCase();
    if (/anders|früher|gelernt|erkannt|nächst/.test(cf)) concepts.push("Growth Mindset");
    else concepts.push("Reflection");
  }

  // Solution = smallest step
  const solution = a.smallestStep || a.counterfactual || "(nicht formuliert)";

  // Psychological explanation
  const explanations = {
    "Fear-Based Avoidance": "Du vermeidest die Handlung aus Angst vor den Konsequenzen — aber die Angst ist meist größer als die Realität.",
    "Procrastination": "Die Energie fehlt, weil das Problem überwältigend wirkt. Ein winziger erster Schritt bricht den Block.",
    "Knowledge Gap": "Du weißt nicht wo du anfangen sollst — das ist ein Informationsproblem, kein Charakterfehler.",
    "Secondary Gain": "Ein Teil von dir profitiert unbewusst vom Problem. Das zu erkennen ist der Schlüssel.",
    "Uncertainty Paralysis": "Du kannst das Ergebnis nicht garantieren — aber warten garantiert gar nichts.",
    "External Locus of Control": "Du siehst die Kontrolle außerhalb dir — aber gibt es einen Hebel, der doch deiner ist?",
    "Learned Helplessness": "Wiederholte Ohnmacht hat dich gelehrt, dass nichts funktioniert. Das ist gelernt — und kann verlernt werden.",
    "Low Readiness": "Du bist noch nicht bereit zu handeln — das ist okay. Aber dann ist es vielleicht eher ein Gedanke als ein Problem.",
    "Rumination": "Du grübelst, ohne zu handeln. Das ist ein Kreislauf, den Fragen allein nicht durchbrechen.",
    "Catastrophizing": "Du überschätzt die kurzfristige Bedeutung. In einer Woche wird es viel kleiner wirken.",
    "Growth Mindset": "Du kannst aus Erfahrung lernen — das ist die Grundlage jeder Veränderung.",
    "Reflection": "Du bist bereit, zurückzublicken — das ist mehr als die meisten tun.",
  };
  const psychExpl = concepts.map(c => explanations[c] || c).join(" ");

  // Next steps
  const nextSteps = [
    a.smallestStep ? "Morgen: " + a.smallestStep : "Morgen: Den ersten Schritt definieren",
    "Diese Woche: Eine Person um Unterstützung oder Feedback bitten",
    "Dieser Monat: Fortschritt überprüfen und nachjustieren",
  ];

  // Pitfalls
  const pitfalls = [];
  if (concepts.includes("Perfectionism Paralysis")) pitfalls.push("Perfektionismus könnte dich blockieren — 80 % fertig ist besser als 100 % nie.");
  if (concepts.includes("Fear-Based Avoidance")) pitfalls.push("Die Angst wird nicht kleiner durch Warten — sie wird größer.");
  if (concepts.includes("Procrastination")) pitfalls.push('Achte auf den Moment, in dem du „erst morgen" sagst. Das ist der Punkt zum Handeln.');
  if (concepts.includes("Rumination")) pitfalls.push("Grübeln fühlt sich produktiv an, ist es aber nicht. Setze ein Zeitlimit.");
  if (concepts.includes("Learned Helplessness")) pitfalls.push("Jeder kleine Erfolg zählt. Feier ihn, auch wenn er winzig scheint.");
  pitfalls.push("Sei geduldig mit dir selbst — Veränderung braucht Zeit.");
  pitfalls.push("Achte auf deine innere Stimme vs. äußeren Druck.");

  // Quote
  const quotes = [
    { q: "Whether you think you can, or you think you can't — you're right.", a: "Henry Ford" },
    { q: "Der erste Schritt ist der schwerste. Alle anderen folgen von selbst.", a: "Unbekannt" },
    { q: "Man kann nicht zurück in die Vergangenheit und einen neuen Anfang machen, aber man kann heute beginnen und ein neues Ende machen.", a: "Maria Robinson" },
    { q: "Wahrliche Veränderung beginnt nicht mit Tun, sondern mit Sehen.", a: "Unbekannt" },
    { q: "Der einzige Mensch, dem du jemals entkommen kannst, bist du selbst.", a: "Unbekannt" },
    { q: "Mut ist nicht die Abwesenheit von Angst, sondern die Entscheidung, dass etwas anderes wichtiger ist.", a: "Ambrose Redmoon" },
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  return {
    problemType: type,
    emotionalIntensity: emotion,
    psychologicalConcepts: [...new Set(concepts)],
    significance: sig,
    significanceReason: sigReason,
    recognizedSolution: solution,
    psychologicalExplanation: psychExpl,
    nextSteps,
    pitfalls,
    inspirationalQuote: quote.q,
    quoteAuthor: quote.a,
  };
}

// ─── BUILD OLLAMA PROMPT ──────────────────────────────────────
function buildOllamaPrompt() {
  const a = S.answers;
  return `Du bist ein erfahrener Psychologe, Therapeut und Soziologe.
Du analysierst ein Problem basierend auf den Antworten des Users.

ANTWORTEN DES USERS:
- Problem: ${a.problem || ""}
- Kann selbst lösen: ${a.canSolve || "??"}
- Warum nicht (ja): ${a.whyNot || "—"}
- Warum extern (nein): ${a.whyExternal || "—"}
- Anteil selbst kontrollierbar: ${a.externalReframe || "—"}
- Bereitschaft (1-10): ${a.readiness ?? "—"}
- Warum kümmert's dich: ${a.readinessLow || "—"}
- Betroffen: ${(a.affected || []).join(", ") || "—"}
- In 1 Woche relevant: ${a.time1w || "?"}
- In 1 Monat relevant: ${a.time1m || "?"}
- In 1 Jahr relevant: ${a.time1y || "?"}
- Rückblick: ${a.counterfactual || "—"}
- Kleinster Schritt morgen: ${a.smallestStep || "—"}

ANALYSIERE in folgende Kategorien:
1. Psychologische Konzepte (Procrastination, Fear-Based Avoidance, Catastrophizing, Learned Helplessness, Locus of Control, Status Quo Bias, Cognitive Dissonance, Rumination, Secondary Gain, Perfectionism, Attribution Error, Impostor Syndrome, Burnout, etc.)
2. Signifikanz (HIGH/MEDIUM/LOW) basierend auf 1Woche/1Monat/1Jahr
3. Erkannte Lösung (die der USER selbst formuliert hat)
4. Psychologische Erklärung warum die Lösung funktioniert
5. Nächste Schritte (3 konkrete SMART Schritte: morgen, diese Woche, dieser Monat)
6. Fallstricke (3 Dinge auf die achten)
7. Inspirierendes Zitat (echtes Zitat, nicht erfunden)

ANTWORTE NUR als JSON:
{
  "problemType": "career|relationship|mental|financial|identity|other",
  "emotionalIntensity": "high|medium|low",
  "psychologicalConcepts": ["Konzept1"],
  "significance": "HIGH|MEDIUM|LOW",
  "significanceReason": "...",
  "recognizedSolution": "...",
  "psychologicalExplanation": "...",
  "nextSteps": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "pitfalls": ["Fallstrick 1", "Fallstrick 2", "Fallstrick 3"],
  "inspirationalQuote": "...",
  "quoteAuthor": "..."
}`;
}

// ─── ANALYZE (dispatch) ──────────────────────────────────────
async function analyze() {
  if (S.ollama) {
    try {
      const result = await ollamaAnalyze(buildOllamaPrompt());
      // fill gaps with rule-based
      const rb = ruleBasedAnalyze();
      return { ...rb, ...result, _source: "ollama" };
    } catch (e) {
      console.warn("Ollama failed, falling back:", e);
    }
  }
  return { ...ruleBasedAnalyze(), _source: "rules" };
}

// expose
if (typeof window !== "undefined") {
  window.__PS = { S, STEPS, visibleSteps, currentStep, nextStep, prevStep, analyze, checkOllama, detectType, isCrisis, loadStore, saveStore, STORE_KEY };
}
