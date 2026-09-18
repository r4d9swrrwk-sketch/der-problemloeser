/* Der Problemlöser — main.js · PHASE 3: Fragen-Flow + Smart Branching Q2 (renderDynamicQuestion) */
"use strict";

// ─── PROBLEM-TYP-ERKENNUNG (Keyword-Matching) ─────────────────
function detectProblemType(text) {
  const lower = (text || "").toLowerCase();
  if (lower.includes('boss') || lower.includes('arbeit') || lower.includes('job')) return 'career';
  if (lower.includes('partner') || lower.includes('beziehung') || lower.includes('freund')) return 'relationship';
  if (lower.includes('depressiv') || lower.includes('angst') || lower.includes('stress')) return 'mental';
  if (lower.includes('geld') || lower.includes('schulden')) return 'financial';
  if (lower.includes('verloren') || lower.includes('weg') || lower.includes('kaputt')) return 'material';
  return 'other';
}

// ─── Q2 FRAGEN JE PROBLEMTYP ─────────────────────────────────────
const q2Questions = {
  career: { question: 'Hast du bereits versucht, mit deinem Boss zu reden?', buttons: ['Ja', 'Nein', 'Irgendwie'] },
  relationship: { question: 'Haben du und diese Person schon darüber geredet?', buttons: ['Ja', 'Nein', 'Nicht direkt'] },
  mental: { question: 'Wie lange dauert das schon?', buttons: ['Heute', '1 Woche', '1 Monat', '6 Monate', '1+ Jahr'] },
  financial: { question: 'Schulden oder zu wenig Einkommen?', buttons: ['Schulden', 'Einkommen', 'Beides'] },
  material: { question: 'Wie emotional belastet dich das?', buttons: ['Nicht sehr', 'Ein bisschen', 'Sehr'] },
  other: { question: 'Verstanden. Wie belastet dich das?', buttons: ['Nicht sehr', 'Mittelmäßig', 'Sehr'] }
};

// ─── STATE ─────────────────────────────────────────────────────
const appState = {
  currentQuestion: 1,
  userAnswers: {},   // [1]=problem text · [2]=q2 placeholder · timeline={today,month,year} · readiness=n
};

// ─── SCREENS ───────────────────────────────────────────────────
const screens = {
  welcome:    document.getElementById("screen-welcome"),
  questions:  document.getElementById("screen-questions"),
  results:    document.getElementById("screen-results"),
  history:    document.getElementById("screen-history"),
};

/**
 * showScreen(name) — blendet genau einen Screen ein, alle anderen aus.
 * @param {"welcome"|"questions"|"results"|"history"} name
 */
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) { console.warn("Screen fehlt:", key); return; }
    const active = key === name;
    el.classList.toggle("hidden", !active);
    el.setAttribute("aria-hidden", String(!active));
  });
}

// ─── FRAGEN-FLOW ───────────────────────────────────────────────
const TOTAL_QUESTIONS = 4;
const qEls = {
  1: document.getElementById("q1"),
  2: document.getElementById("q2"),
  3: document.getElementById("q3"),
  4: document.getElementById("q4"),
};
const stepLabel   = document.getElementById("stepLabel");
const progressFill = document.getElementById("progressFill");
const backBtn     = document.getElementById("backBtn");
const nextBtn     = document.getElementById("nextBtn");
const q1Text      = document.getElementById("q1Text");
const q1Error     = document.getElementById("q1Error");

function updateProgress() {
  const n = appState.currentQuestion;
  stepLabel.textContent = "Schritt " + n + " von " + TOTAL_QUESTIONS;
  progressFill.style.width = (n / TOTAL_QUESTIONS * 100) + "%";
  backBtn.classList.toggle("invisible", n === 1);
  nextBtn.textContent = n === TOTAL_QUESTIONS ? "✅ Analysieren" : "Weiter →";
}

function goToQuestion(n) {
  if (n < 1 || n > TOTAL_QUESTIONS) return;
  appState.currentQuestion = n;
  if (n === 2) {
    const body = document.getElementById("q2Body");
    if (body) renderDynamicQuestion(2, body);
  }
  Object.entries(qEls).forEach(([key, el]) => {
    if (el) el.classList.toggle("hidden", Number(key) !== n);
  });
  updateProgress();
}

/**
 * renderDynamicQuestion(q, container) — baut die Q2-Frage je erkanntem Problemtyp.
 * Button-Klick speichert die Antwort und springt direkt zu Q3.
 */
function renderDynamicQuestion(q, container) {
  const problemText = appState.userAnswers[1] || "";
  const problemType = detectProblemType(problemText);
  appState.userAnswers.problemType = problemType;

  const q2 = q2Questions[problemType];
  // gespeicherte Antwort verwerfen, wenn sie nicht zum aktuellen Typ passt
  if (appState.userAnswers[2] && !q2.buttons.includes(appState.userAnswers[2])) {
    appState.userAnswers[2] = null;
  }

  let buttonsHTML = '';
  q2.buttons.forEach((btn) => {
    const sel = appState.userAnswers[2] === btn ? ' ring-4 ring-blue-300' : '';
    buttonsHTML += `<button class="q2-btn w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg mb-2${sel}" data-answer="${btn}">${btn}</button>`;
  });

  const html = `<div><h3 class="text-xl font-bold mb-4">${q2.question}</h3><div class="space-y-2">${buttonsHTML}</div></div>`;
  container.innerHTML = html;

  const err = document.getElementById("q2Error");
  if (err) err.classList.add("hidden");

  if (container.querySelectorAll) {
    container.querySelectorAll('.q2-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectQ2Answer(e.target.dataset.answer);
      });
    });
  }
}

/** selectQ2Answer(answer) — dasselbe wie ein Button-Klick: speichern + zu Q3 */
function selectQ2Answer(answer) {
  appState.userAnswers[2] = answer;
  goToQuestion(3);
}

// Q3-Slider: live-Werte anzeigen + in state.timeline speichern
const timelineSliders = [
  { id: "sliderToday",  out: "valToday",  key: "today" },
  { id: "sliderMonth",  out: "valMonth",  key: "month" },
  { id: "sliderYear",   out: "valYear",   key: "year"  },
];
function syncTimelineSlider(cfg) {
  const slider = document.getElementById(cfg.id);
  const output = document.getElementById(cfg.out);
  if (!slider || !output) return;
  const apply = () => {
    const v = parseInt(slider.value, 10);
    output.textContent = String(v);
    if (!appState.userAnswers.timeline) {
      appState.userAnswers.timeline = { today: 5, month: 5, year: 5 };
    }
    appState.userAnswers.timeline[cfg.key] = v;
  };
  slider.addEventListener("input", apply);
  apply(); // Initialwerte in state spiegeln
}
timelineSliders.forEach(syncTimelineSlider);

// Q4-Readiness-Slider: live-Anzeige
(function syncReadinessSlider() {
  const slider = document.getElementById("sliderReadiness");
  const output = document.getElementById("valReadiness");
  if (!slider || !output) return;
  const apply = () => { output.textContent = slider.value; };
  slider.addEventListener("input", apply);
  apply();
})();

// Q1: Text bei Eingabe sofort speichern (auch fürs Zurück-Navigieren)
if (q1Text) q1Text.addEventListener("input", () => {
  appState.userAnswers[1] = q1Text.value.trim();
  if (q1Error && appState.userAnswers[1].length >= 10) q1Error.classList.add("hidden");
});

function nextQuestion() {
  const n = appState.currentQuestion;
  if (n === 1) {
    const t = q1Text.value.trim();
    if (t.length < 10) { q1Error.classList.remove("hidden"); return; }
    appState.userAnswers[1] = t;
  } else if (n === 2) {
    if (!appState.userAnswers[2]) {
      const err = document.getElementById("q2Error");
      if (err) err.classList.remove("hidden");
      return;
    }
  } else if (n === 3) {
    // timeline wird live über die input-Listener gepflegt — nichts zu tun
  } else if (n === TOTAL_QUESTIONS) {
    appState.userAnswers.readiness = parseInt(document.getElementById("sliderReadiness").value, 10);
    appState.autoSaved = false; // frisch berechnet → beim Rendern automatisch speichern
    renderResults(); // Karten anzeigen + Auto-Save (Phase 4)
    return;
  }
  goToQuestion(n + 1);
}

function prevQuestion() {
  if (appState.currentQuestion > 1) goToQuestion(appState.currentQuestion - 1);
}

// ─── NAVIGATION ────────────────────────────────────────────────
document.getElementById("startBtn").addEventListener("click", () => {
  showScreen("questions");
  goToQuestion(1);
});

document.getElementById("navHome").addEventListener("click", () => showScreen("welcome"));
document.getElementById("navHistory").addEventListener("click", renderHistoryPage);
document.getElementById("newProblemBtn").addEventListener("click", () => {
  // Neues Problem: State komplett zurücksetzen
  appState.userAnswers = {};
  appState.lastResult = null;
  appState.autoSaved = false;
  if (q1Text) q1Text.value = "";
  showScreen("questions");
  goToQuestion(1);
});

if (nextBtn) nextBtn.addEventListener("click", nextQuestion);
if (backBtn) backBtn.addEventListener("click", prevQuestion);

// ─── PHASE 4: ERGEBNIS-ANZEIGE, LOCALSTORAGE & HISTORY ─────────
const TYPE_LABELS = { career: "Beruf / Arbeit", relationship: "Beziehung", mental: "Mentale Gesundheit", financial: "Finanzen", material: "Verlust / Materiell", other: "Allgemein" };
const TREND_LABELS = { steep_decline: "📉 Steil fallend — geht schnell vorbei", flat: "➡️ Flach — bleibt gleich", worsening: "📈 Verschlechternd — wird wohl schlimmer", gradual_decline: "🔃 Sanft fallend — wird langsam besser" };

/** analyzeTimeline → steep_decline | flat | worsening | gradual_decline */
function analyzeTimeline(today, month, year) {
  const decline = today - year;
  if (decline > 5) return "steep_decline";
  if (decline <= 1 && decline >= -1) return "flat";
  if (decline < -3) return "worsening";
  return "gradual_decline";
}

/** generateUUID() — eindeutige ID für jedes Ergebnis */
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const STORAGE_KEY = "problemloe…sults";
function loadStoredResults() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

/** saveResultToLocalStorage(result) — neuestes Ergebnis zuerst */
function saveResultToLocalStorage(result) {
  const all = loadStoredResults();
  all.unshift(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function buildResultObject() {
  const ua = appState.userAnswers;
  const tl = ua.timeline || { today: 5, month: 5, year: 5 };
  return {
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    problem: ua[1] || "",
    problemType: ua.problemType || "other",
    q2Answer: ua[2] || "",
    timeline: { today: tl.today, month: tl.month, year: tl.year },
    trend: analyzeTimeline(tl.today, tl.month, tl.year),
    readiness: ua.readiness || 5,
  };
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Farb-Boxen für ein Ergebnis (neu oder aus History) */
function resultCardsHTML(r) {
  const typeLabel = TYPE_LABELS[r.problemType] || "Allgemein";
  const trendLabel = TREND_LABELS[r.trend] || r.trend;
  return `
    <div class="grid gap-4">
      <div class="rounded-xl border-l-4 border-primary bg-blue-50 px-5 py-4">
        <p class="text-[11px] font-bold uppercase tracking-[.14em] text-primary-deep mb-1">Dein Problem</p>
        <p class="text-[15px]">${escapeHtml(r.problem)}</p>
      </div>
      <div class="rounded-xl border-l-4 border-secondary bg-emerald-50 px-5 py-4">
        <p class="text-[11px] font-bold uppercase tracking-[.14em] text-secondary-deep mb-1">Erkannter Typ</p>
        <p class="text-[15px] font-semibold">${typeLabel}</p>
        ${r.q2Answer ? `<p class="text-sm text-soft mt-1">Deine Antwort: ${escapeHtml(r.q2Answer)}</p>` : ""}
      </div>
      <div class="rounded-xl border-l-4 border-accent bg-amber-50 px-5 py-4">
        <p class="text-[11px] font-bold uppercase tracking-[.14em] text-accent-deep mb-1">Timeline &amp; Trend</p>
        <div class="flex gap-5 text-[15px] font-semibold flex-wrap">
          <span>Heute: ${r.timeline.today}</span><span>1 Monat: ${r.timeline.month}</span><span>1 Jahr: ${r.timeline.year}</span>
        </div>
        <p class="text-sm mt-1">${trendLabel}</p>
      </div>
      <div class="rounded-xl border-l-4 border-primary bg-indigo-50 px-5 py-4">
        <p class="text-[11px] font-bold uppercase tracking-[.14em] text-primary-deep mb-1">Bereitschaft</p>
        <p class="text-[15px] font-semibold">${r.readiness} / 10</p>
      </div>
    </div>`;
}

function updateSaveBtn() {
  const btn = document.getElementById("saveBtn");
  if (!btn || !btn.classList || !appState.lastResult) return;
  const exists = loadStoredResults().some(e => e.id === appState.lastResult.id);
  btn.textContent = exists ? "✓ Gespeichert" : "💾 Speichern";
  btn.disabled = exists;
}

/** renderResults() — schöne Ergebnis-Karten + automatisches Speichern */
function renderResults() {
  const box = document.getElementById("resultsContainer");
  if (!box) return;
  const r = buildResultObject();
  appState.lastResult = r;
  if (!appState.autoSaved) { saveResultToLocalStorage(r); appState.autoSaved = true; }
  box.innerHTML = `<h2 class="text-2xl font-bold mb-4">🎯 Dein Ergebnis</h2>` + resultCardsHTML(r);
  updateSaveBtn();
  showScreen("results");
}

/** renderHistoryPage() — alle Ergebnisse, neueste zuerst */
function renderHistoryPage() {
  const list = document.getElementById("historyList");
  if (!list) { showScreen("history"); return; }
  const all = loadStoredResults();
  if (!all.length) {
    list.innerHTML = `<p class="text-soft text-center py-14 text-[15px]">Noch keine Ergebnisse. Führe zuerst eine Analyse durch.</p>`;
  } else {
    list.innerHTML = all.map(e => {
      const d = new Date(e.timestamp);
      const when = d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      return `
      <div class="bg-white border border-gray-200 rounded-2xl shadow-card px-5 py-4 mb-3">
        <div class="flex justify-between items-baseline gap-3 flex-wrap">
          <p class="font-semibold text-[15px]">${escapeHtml((e.problem || "").slice(0, 70))}${(e.problem || "").length > 70 ? "…" : ""}</p>
          <span class="text-soft text-xs whitespace-nowrap">${when}</span>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" class="hist-view rounded-full bg-primary text-white text-sm font-semibold px-4 py-2" data-id="${e.id}">👁️ Ansehen</button>
          <button type="button" class="hist-del rounded-full bg-white border border-red-300 text-red-600 text-sm font-semibold px-4 py-2 hover:bg-red-50" data-id="${e.id}">🗑️ Löschen</button>
        </div>
      </div>`;
    }).join("");
    if (list.querySelectorAll) {
      list.querySelectorAll(".hist-view").forEach(b => b.addEventListener("click", () => viewResultDetail(b.dataset.id)));
      list.querySelectorAll(".hist-del").forEach(b => b.addEventListener("click", () => deleteResult(b.dataset.id)));
    }
  }
  showScreen("history");
}

/** viewResultDetail(id) — altes Ergebnis in Detail-Ansicht */
function viewResultDetail(id) {
  const entry = loadStoredResults().find(e => e.id === id);
  const box = document.getElementById("resultsContainer");
  if (!box) return;
  if (!entry) { renderHistoryPage(); return; }
  box.innerHTML = `
    <p class="text-[11px] font-bold uppercase tracking-[.14em] text-soft mb-1">Gespeichertes Ergebnis</p>
    <h2 class="text-2xl font-bold mb-4">🎯 Analyse vom ${new Date(entry.timestamp).toLocaleDateString("de-DE")}</h2>
    ${resultCardsHTML(entry)}
    <button id="backToHistoryBtn" type="button" class="mt-5 rounded-full bg-white border border-gray-300 text-soft px-5 py-2.5 text-sm font-semibold hover:border-primary hover:text-ink transition">← Zurück zur Liste</button>`;
  const back = document.getElementById("backToHistoryBtn");
  if (back && back.addEventListener) back.addEventListener("click", renderHistoryPage);
  showScreen("results");
}

/** deleteResult(id) — bestätigen, dann aus LocalStorage entfernen */
function deleteResult(id) {
  if (typeof confirm === "function" && !confirm("Dieses Ergebnis wirklich löschen?")) return;
  const rest = loadStoredResults().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  renderHistoryPage();
}

document.getElementById("saveBtn").addEventListener("click", () => {
  if (!appState.lastResult) return;
  saveResultToLocalStorage(appState.lastResult);
  updateSaveBtn();
});
document.getElementById("viewHistoryBtn").addEventListener("click", renderHistoryPage);

// ─── EXPORT FÜR HEADLESS-TESTS ─────────────────────────────────
if (typeof window !== "undefined" && window.__TEST) {
  window.__PS = { appState, showScreen, goToQuestion, nextQuestion, prevQuestion, updateProgress,
                  detectProblemType, q2Questions, renderDynamicQuestion, selectQ2Answer,
                  generateUUID, saveResultToLocalStorage, loadStoredResults, analyzeTimeline,
                  renderResults, renderHistoryPage, viewResultDetail, deleteResult, STORAGE_KEY };
}

// ─── INIT ──────────────────────────────────────────────────────
showScreen("welcome");
goToQuestion(1);
