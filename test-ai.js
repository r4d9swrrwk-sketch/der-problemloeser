// KI-INTEGRATIONS-Test: ai.js + enhanceWithAI headless mit Transformer-Mock
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function mkEl(id, initial) {
  const el = { id, _classes: new Set(initial && initial.classes || []), attrs: {}, listeners: {}, value: (initial && initial.value) || "", checked: false, textContent: "", innerHTML: "", style: {}, disabled: false, _qsa: null };
  el.classList = {
    toggle(c, force) { if (force === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else { force ? el._classes.add(c) : el._classes.delete(c); } },
    add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); }, contains(c) { return el._classes.has(c); },
  };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.addEventListener = (ev, fn) => { (el.listeners[ev] = el.listeners[ev] || []).push(fn); };
  el.fire = (ev) => (el.listeners[ev] || []).forEach(fn => fn({ target: el }));
  el.click = () => el.fire("click");
  el.querySelectorAll = (sel) => {
    const cls = sel.replace(/^\./, "");
    if (el._qsa && el._qsa.html === el.innerHTML && el._qsa.sel === sel) return el._qsa.res;
    const res = [];
    const re = /<button([^>]*)>/g; let m;
    while ((m = re.exec(el.innerHTML))) {
      const cm = /class="([^"]*)"/.exec(m[1]);
      if (!cm || !cm[1].split(/\s+/).includes(cls)) continue;
      const dm = /data-answer="([^"]*)"/.exec(m[1]);
      const b = { dataset: { answer: dm ? dm[1] : undefined }, listeners: {},
        addEventListener(ev, fn) { (b.listeners[ev] = b.listeners[ev] || []).push(fn); },
        click() { (b.listeners.click || []).forEach(fn => fn({ target: b })); } };
      res.push(b);
    }
    el._qsa = { html: el.innerHTML, sel, res };
    return res;
  };
  return el;
}

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]))];
const els = {};
ids.forEach(i => {
  const seed = {};
  if (["screen-questions","screen-results","screen-history","q2","q3","q4","q1Error","q2Error","curveFeedback"].includes(i)) seed.classes = ["hidden"];
  if (i === "backBtn") seed.classes = ["invisible"];
  if (["sliderToday","sliderMonth","sliderYear","sliderReadiness"].includes(i)) seed.value = "5";
  els[i] = mkEl(i, seed);
});

const document = { getElementById: (i) => els[i] || null };
const storageMap = new Map();
const localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
};

// ─── Transformer-Mock: simulierte zero-shot pipeline ───────────
let mockScores = { top: "Beziehung & Partnerschaft", topScore: 0.82 };
let mockThrows = false;
let callCount = 0;
const mockPipeline = async () => async (text, labels, opts) => {
  if (mockThrows) throw new Error("mock-netzwerkfehler");
  const c = callCount++ % 3; // 0=Typ, 1=Emotion, 2=Konzepte (Aufrufreihenfolge in Promise.all)
  let pairs;
  if (c === 0) {
    const scores = labels.map((l) => l === mockScores.top ? mockScores.topScore : (1 - mockScores.topScore) / (labels.length - 1));
    pairs = labels.map((l, i) => [l, scores[i]]).sort((a, b) => b[1] - a[1]);
  } else {
    pairs = labels.map((l, i) => [l, i === 0 ? 0.75 : 0.02]).sort((a, b) => b[1] - a[1]); // Erster Label stark
  }
  return { labels: pairs.map(p => p[0]), scores: pairs.map(p => p[1]) };
};
const mockTransformers = { env: {}, pipeline: async () => mockPipeline() };

const window = { __TEST: true, __PS_TEST_transformers: mockTransformers };
const sandbox = { document, window, console, localStorage, confirm: () => true, setTimeout, clearTimeout };
vm.createContext(sandbox);

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };
const settle = () => new Promise(r => setTimeout(r, 60));

(async () => {
try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "ai.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
} catch (e) { fails++; console.error("warf:", e.message); return finish(); }

check("0) window.PS_AI exportiert + HTML: aiToggle/ai.js vorhanden",
  !!window.PS_AI && ids.includes("aiToggle") && html.includes('src="ai.js"'));

const { appState } = window.__PS;

// ─── 1) Toggle AN → Warmup + KI-Typ gewinnt ───────────────────
els.startBtn.click();
els.bibleToggle.checked = false;
els.aiToggle.checked = true;
els.q1Text.value = "Ich bin depressiv und habe keine Kraft mehr.";
els.q1Text.fire("input"); els.nextBtn.click(); // Q1→Q2 (syncAiToggle→warmup)
check("1a) syncAiToggle: PS_AI-Status nicht 'off'", window.PS_AI.status() !== "off");
els.q2Body.querySelectorAll(".q2-btn")[0].click(); // → Q3
els.sliderToday.value = "8"; els.sliderToday.fire("input");
els.sliderMonth.value = "5"; els.sliderMonth.fire("input");
els.sliderYear.value = "2"; els.sliderYear.fire("input");
els.nextBtn.click(); // → Q4
els.sliderReadiness.value = "7"; els.sliderReadiness.fire("input");
els.nextBtn.click(); // Analysieren → Results sofort (keyword), dann KI-Upgrade

check("1b) Results sofort keyword-basiert gerendert (mental via Keywords)", els.resultsContainer.innerHTML.includes("Mentale Gesundheit"));
await settle();
check("1c) KI-Upgrade: Typ → relationship (Mock 0.82 > 0.45)", els.resultsContainer.innerHTML.includes("Beziehung"));
check("1d) KI-Badge sichtbar mit '82%'", els.resultsContainer.innerHTML.includes("82%") && els.resultsContainer.innerHTML.includes("KI-Analyse"));
check("1e) Emotion + Konzepte im Badge", els.resultsContainer.innerHTML.includes("Emotion:"));
const stored = window.__PS.loadStoredResults()[0];
check("1f) LocalStorage-Eintrag upgedated: problemType=relationship + ai.source=ai",
  stored.problemType === "relationship" && stored.ai && stored.ai.source === "ai");

// ─── 2) Score < 0.45 → keyword-Fallback ────────────────────────
mockScores = { top: "Finanzen & Schulden", topScore: 0.30 };
els.newProblemBtn.click();
els.aiToggle.checked = true;
els.q1Text.value = "Mein Partner und ich finden einfach keinen Zugang zueinander.";
els.q1Text.fire("input"); els.nextBtn.click();
els.q2Body.querySelectorAll(".q2-btn")[0].click();
els.nextBtn.click(); els.sliderReadiness.value = "5"; els.sliderReadiness.fire("input");
els.nextBtn.click();
await settle();
check("2) Score<0.45: Keyword-Typ bleibt (relationship), Badge sagt 'nicht verfügbar'",
  els.resultsContainer.innerHTML.includes("Beziehung") && els.resultsContainer.innerHTML.includes("Keyword-Erkennung"));

// ─── 3) Pipeline wirft Fehler → App läuft weiter ───────────────
mockThrows = true;
els.newProblemBtn.click();
els.aiToggle.checked = true;
els.q1Text.value = "Ich ertrage die Anfeindungen auf der Arbeit nicht mehr.";
els.q1Text.fire("input"); els.nextBtn.click();
els.q2Body.querySelectorAll(".q2-btn")[0].click();
els.nextBtn.click(); els.sliderReadiness.value = "5"; els.sliderReadiness.fire("input");
els.nextBtn.click();
await settle();
check("3) KI-Fehler: kein Crash, career bleibt (Keywords), Hinweis-Badge", els.resultsContainer.innerHTML.includes("Beruf / Arbeit") && els.resultsContainer.innerHTML.includes("nicht verf\u00fcgbar"));
mockThrows = false;

// ─── 4) Toggle AUS → PS_AI disabled, niemals laden ─────────────
els.newProblemBtn.click();
els.aiToggle.checked = false;
els.q1Text.value = "Mein Mann ignoriert mich, unsere Beziehung ist kaputt.";
els.q1Text.fire("input"); els.nextBtn.click();
check("4a) PS_AI.status==='off' nach Toggle-aus-Besuch", window.PS_AI.status() === "off");
els.q2Body.querySelectorAll(".q2-btn")[0].click();
els.nextBtn.click(); els.sliderReadiness.value = "5"; els.sliderReadiness.fire("input");
els.nextBtn.click();
await settle();
check("4b) Toggle AUS: kein KI-Badge, relationship durch Keywords", els.resultsContainer.innerHTML.includes("Beziehung") && !els.resultsContainer.innerHTML.includes("KI-Analyse"));

finish();

function finish() {
  console.log("\n" + (fails === 0 ? "✅ KI-INTEGRATIONS-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
  process.exit(fails ? 1 : 0);
}
})();
