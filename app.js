/* Der Problemlöser — app.js: UI rendering, step display, result, history */
"use strict";
(function() {
// Access engine exports — wrapped in IIFE to avoid redeclaring globals from engine.js
const PS = window.__PS;
const S = PS.S;
const STEPS = PS.STEPS;
const visibleSteps = PS.visibleSteps;
const currentStep = PS.currentStep;
const nextStep = PS.nextStep;
const prevStep = PS.prevStep;
const analyze = PS.analyze;
const checkOllama = PS.checkOllama;
const detectType = PS.detectType;
const isCrisis = PS.isCrisis;
const loadStore = PS.loadStore;
const saveStore = PS.saveStore;

const $ = (id) => document.getElementById(id);
const screens = {
  welcome: $("screenWelcome"),
  quiz: $("screenQuiz"),
  analyzing: $("screenAnalyzing"),
  result: $("screenResult"),
  history: $("screenHistory"),
};
function show(name) { Object.entries(screens).forEach(([k, el]) => el.classList.toggle("is-active", k === name)); }

// ─── WELCOME / OLLAMA CHECK ───────────────────────────────────
async function initOllama() {
  const ok = await checkOllama();
  const st = $("aiStatus");
  if (ok) {
    S.ollama = true;
    $("ollamaToggle").checked = true;
    st.textContent = "✓ Ollama erkannt";
    st.className = "ai-status ok";
  } else {
    st.textContent = "nicht erreichbar — regelbasierte Analyse wird verwendet";
    st.className = "ai-status bad";
  }
}

$("ollamaToggle").addEventListener("change", (e) => {
  S.ollama = e.target.checked;
  if (S.ollama) S.model = $("modelInput").value || "llama3.2";
});
$("modelInput").addEventListener("change", (e) => { S.model = e.target.value || "llama3.2"; });

// ─── RENDER STEP ──────────────────────────────────────────────
function renderStep() {
  const vis = visibleSteps();
  const step = vis[S.step];
  if (!step) { finish(); return; }

  $("stepLabel").textContent = step.chip || `Schritt ${S.step + 1}`;
  $("progressFill").style.width = ((S.step) / vis.length * 100) + "%";
  $("backBtn").style.visibility = S.step === 0 ? "hidden" : "visible";
  $("nextBtn").textContent = S.step === vis.length - 1 ? "Analyse starten →" : "Weiter →";
  $("nextBtn").disabled = false;
  $("errHint")?.classList.remove("show");

  // crisis check on problem text
  const a = S.answers;
  let crisisHtml = "";
  if (step.crisisCheck && a.problem && isCrisis(a.problem)) {
    crisisHtml = `<div class="crisis-box"><strong>⚠️ Achtung:</strong> Du schreibst über Gedanken, die auf Selbstschaden hindeuten.
      Das ist ernst. Bitte kontaktiere SOFORT:
      <ul style="margin:8px 0 0 18px"><li>Telefonseelsorge: <strong>0800 111 0 111</strong> (kostenlos, 24/7)</li>
      <li>Nächste Notfallklinik</li><li>Vertrauensperson (Familie/Freund)</li></ul>
      Dieses Tool kann einen Therapeuten NICHT ersetzen. ❤️</div>`;
  }

  let inputHtml = "";
  switch (step.type) {
    case "textarea":
      inputHtml = `<textarea class="ta${step.minLen && step.minLen <= 5 ? " sm" : ""}" id="inputField" placeholder="${step.placeholder || "Schreib hier…"}" data-step="${step.id}">${a[step.id] ? escapeHtml(a[step.id]) : ""}</textarea>`;
      break;
    case "yesno":
      inputHtml = `<div class="yesno-row">
        <button class="btn btn--ghost btn--min44 choice--yesno ${a[step.id]==="yes"?"is-selected":""}" data-val="yes" data-step="${step.id}" type="button">Ja</button>
        <button class="btn btn--ghost btn--min44 choice--yesno ${a[step.id]==="no"?"is-selected":""}" data-val="no" data-step="${step.id}" type="button">Nein</button>
      </div>`;
      break;
    case "choice-or-text":
      inputHtml = `<div class="choice-grid">` + step.options.map((o, i) =>
        `<button class="choice ${a[step.id]===o?"is-selected":""}" data-val="${escapeAttr(o)}" data-step="${step.id}" type="button">${o}</button>`
      ).join("") + `</div>
      <p class="step-help">Oder schreib frei:</p>
      <textarea class="ta sm" id="inputFieldFree" placeholder="Eigene Antwort…">${a[step.id] && !step.options.includes(a[step.id]) ? escapeHtml(a[step.id]) : ""}</textarea>`;
      break;
    case "checkboxes":
      const sel = a[step.id] || [];
      inputHtml = `<div class="check-list">` + step.options.map(o =>
        `<label class="check-item"><input type="checkbox" data-val="${escapeAttr(o)}" data-step="${step.id}" ${sel.includes(o)?"checked":""} /> ${o}</label>`
      ).join("") + `</div>`;
      break;
    case "slider":
      inputHtml = `<div class="slider-wrap">
        <input type="range" min="1" max="10" value="${a[step.id] || 5}" data-step="${step.id}" id="sliderInput" class="btn--min44" />
        <span class="slider-val" id="sliderVal">${a[step.id] || 5}</span>
      </div>
      <div class="slider-scale"><span>1 — gar nicht bereit</span><span>10 — absolut bereit</span></div>
      <div id="sliderFollowUp" style="${a[step.id] && a[step.id] <= 3 ? "" : "display:none"};margin-top:18px">
        <p class="step-help">Was würde dich auf 9–10 bringen?</p>
        <textarea class="ta sm" id="inputField" placeholder="Beschreib, was dich bereit machen würde…">${a[step.id+"_followUp"] ? escapeHtml(a[step.id+"_followUp"]) : ""}</textarea>
      </div>`;
      break;
  }

  $("stepCard").innerHTML = `
    <span class="step-chip">${step.chip || step.label}</span>
    <h2 class="step-q">${step.title}</h2>
    ${step.help ? `<p class="step-help">${step.help}</p>` : ""}
    ${crisisHtml}
    ${inputHtml}
    <p class="err-hint" id="errHint">Bitte gib eine Antwort ein.</p>
  `;

  // wire up inputs
  wireStepInputs(step);
}

function wireStepInputs(step) {
  if (step.type === "textarea") {
    const f = $("inputField");
    if (f) f.addEventListener("input", () => { S.answers[step.id] = f.value; });
  }
  if (step.type === "yesno") {
    document.querySelectorAll(`[data-step="${step.id}"]`).forEach(btn => {
      btn.addEventListener("click", () => {
        S.answers[step.id] = btn.dataset.val;
        document.querySelectorAll(`[data-step="${step.id}"]`).forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
    });
  }
  if (step.type === "choice-or-text") {
    document.querySelectorAll(`.choice[data-step="${step.id}"]`).forEach(btn => {
      btn.addEventListener("click", () => {
        S.answers[step.id] = btn.dataset.val;
        document.querySelectorAll(`.choice[data-step="${step.id}"]`).forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        const free = $("inputFieldFree"); if (free) free.value = "";
      });
    });
    const free = $("inputFieldFree");
    if (free) free.addEventListener("input", () => {
      S.answers[step.id] = free.value;
      document.querySelectorAll(`.choice[data-step="${step.id}"]`).forEach(b => b.classList.remove("is-selected"));
    });
  }
  if (step.type === "checkboxes") {
    document.querySelectorAll(`input[type="checkbox"][data-step="${step.id}"]`).forEach(cb => {
      cb.addEventListener("change", () => {
        const vals = Array.from(document.querySelectorAll(`input[type="checkbox"][data-step="${step.id}"]:checked`)).map(c => c.dataset.val);
        S.answers[step.id] = vals;
      });
    });
  }
  if (step.type === "slider") {
    const sl = $("sliderInput");
    const sv = $("sliderVal");
    const fu = $("sliderFollowUp");
    if (sl) sl.addEventListener("input", () => {
      const v = parseInt(sl.value);
      S.answers[step.id] = v;
      sv.textContent = v;
      if (v <= 3) { fu.style.display = ""; const fi = $("inputField"); if (fi) fi.addEventListener("input", () => { S.answers[step.id+"_followUp"] = fi.value; }); }
      else { fu.style.display = "none"; }
    });
  }
}

// ─── VALIDATION ───────────────────────────────────────────────
function validateStep() {
  const step = currentStep();
  if (!step) return true;
  const v = S.answers[step.id];
  if (step.type === "textarea") return v && v.trim().length >= (step.minLen || 1);
  if (step.type === "yesno") return v === "yes" || v === "no";
  if (step.type === "choice-or-text") return v && (v.trim().length > 0);
  if (step.type === "checkboxes") return Array.isArray(v) && v.length > 0;
  if (step.type === "slider") return true; // always has default
  return true;
}

// ─── NAVIGATION ───────────────────────────────────────────────
$("startBtn").addEventListener("click", () => {
  S.step = 0; S.answers = {};
  show("quiz");
  renderStep();
});
$("nextBtn").addEventListener("click", () => {
  if (!validateStep()) { $("errHint").classList.add("show"); return; }
  const vis = visibleSteps();
  if (S.step >= vis.length - 1) { finish(); return; }
  nextStep();
  renderStep();
});
$("backBtn").addEventListener("click", () => { prevStep(); renderStep(); });
$("navHome").addEventListener("click", () => show("welcome"));
$("navHistory").addEventListener("click", () => renderHistory());

// ─── FINISH / ANALYZE ─────────────────────────────────────────
async function finish() {
  show("analyzing");
  const msgs = ["Ich denke über deine Antworten nach …", "Ordne psychologische Konzepte zu …", "Bewerte zeitliche Signifikanz …", "Formuliere deine erkannte Lösung …"];
  let m = 0;
  $("analyzingText").textContent = msgs[0];
  $("analyzingSub").textContent = S.ollama ? "(KI-Analyse via Ollama läuft …)" : "(regelbasierte Analyse läuft …)";
  const t = setInterval(() => { $("analyzingText").textContent = msgs[m++ % msgs.length]; }, 1800);
  try {
    const result = await analyze();
    clearInterval(t);
    renderResult(result);
  } catch (e) {
    clearInterval(t);
    console.error(e);
    $("analyzingText").textContent = "Analyse-Fehler. Bitte erneut versuchen.";
    $("analyzingSub").textContent = e.message;
  }
}

// ─── RENDER RESULT ────────────────────────────────────────────
function renderResult(r) {
  const typeLabels = { career: "Beruf", relationship: "Beziehung", mental: "Mentale Gesundheit", financial: "Finanzen", identity: "Identität", other: "Allgemein" };
  const sigClass = { high: "pill--high", medium: "pill--medium", low: "pill--low" };
  const sigLabel = { HIGH: "Signifikant", MEDIUM: "Kontextabhängig", LOW: "Temporär" };
  const sig = (r.significance || "medium").toLowerCase();
  const concepts = (r.psychologicalConcepts || []).map(c => `<span class="pill pill--concept">${escapeHtml(c)}</span>`).join("");

  $("screenResult").innerHTML = `
  <div class="result-wrap">
    <div class="res-card res-card--head">
      <p class="res-title">🔍 <b>Problem-Identifikation</b></p>
      <div class="kv">
        <dt>Typ</dt><dd>${typeLabels[r.problemType] || "Allgemein"}</dd>
        <dt>Emotionale Ladung</dt><dd>${r.emotionalIntensity === "high" ? "Hoch" : r.emotionalIntensity === "medium" ? "Mittel" : "Niedrig"}</dd>
        <dt>Psychologische Phänomene</dt><dd>${concepts || "—"}</dd>
      </div>
    </div>

    <div class="res-card res-card--sig">
      <p class="res-title">📊 <b>Signifikanz-Analyse</b></p>
      <div class="sig-grid">
        <div class="sig-cell"><span class="lab">1 Woche</span><div class="val ${S.answers.time1w==="yes"?"yes":"no"}">${S.answers.time1w === "yes" ? "Relevant" : "Nicht relevant"}</div></div>
        <div class="sig-cell"><span class="lab">1 Monat</span><div class="val ${S.answers.time1m==="yes"?"yes":"no"}">${S.answers.time1m === "yes" ? "Relevant" : "Nicht relevant"}</div></div>
        <div class="sig-cell"><span class="lab">1 Jahr</span><div class="val ${S.answers.time1y==="yes"?"yes":"no"}">${S.answers.time1y === "yes" ? "Relevant" : "Nicht relevant"}</div></div>
      </div>
      <div><span class="pill ${sigClass[sig]||"pill--medium"}">${sigLabel[(r.significance||"MEDIUM").toUpperCase()] || sigLabel.MEDIUM}</span></div>
      <p style="margin-top:8px;color:var(--muted);font-size:14.5px">${escapeHtml(r.significanceReason || "")}</p>
    </div>

    <div class="res-card res-card--solution">
      <p class="res-title">💡 <b>Deine erkannte Lösung</b></p>
      <dl class="kv">
        <dt>Problem</dt><dd>${escapeHtml(S.answers.problem || "")}</dd>
        <dt>Lösung (die DU erkannt hast)</dt><dd>${escapeHtml(r.recognizedSolution || "")}</dd>
        <dt>Psychologischer Schlüssel</dt><dd>${escapeHtml(r.psychologicalExplanation || "")}</dd>
      </dl>
    </div>

    <div class="res-card res-card--steps">
      <p class="res-title">🚀 <b>Nächste Schritte</b></p>
      <ol style="padding-left:20px;line-height:1.8">${(r.nextSteps||[]).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
    </div>

    <div class="res-card res-card--pitfalls">
      <p class="res-title">⚠️ <b>Fallstricke — worauf du achten solltest</b></p>
      <ul style="padding-left:20px;line-height:1.8">${(r.pitfalls||[]).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    </div>

    <div class="res-card res-card--quote">
      <p class="res-title">📖 <b>Inspirierendes Zitat</b></p>
      <p class="quote-text">„${escapeHtml(r.inspirationalQuote || "")}"</p>
      <p class="quote-author">— ${escapeHtml(r.quoteAuthor || "Unbekannt")}</p>
    </div>

    <div class="final-reflection">
      <p>Erkennst du jetzt, dass die Lösung schon in <em>dir</em> war?</p>
      <p>Der Prozess war nur, sie an die Oberfläche zu bringen.</p>
      <p class="small">Die einzige verbleibende Frage ist nicht „Was soll ich tun?" sondern „Werde ich es wirklich tun?" — Das liegt ganz bei dir. 🎯</p>
    </div>

    <div class="res-actions">
      <button class="btn btn--primary" id="saveBtn" type="button">📝 Ergebnis speichern</button>
      <button class="btn btn--ghost" id="newBtn" type="button">🔄 Neues Problem</button>
      <button class="btn btn--ghost" id="histBtn" type="button">📋 Meine Ergebnisse</button>
    </div>
    <p class="ai-note">Analyse: ${r._source === "ollama" ? "KI (Ollama)" : "regelbasiert"}</p>
  </div>`;

  show("result");

  $("saveBtn").addEventListener("click", () => {
    const store = loadStore();
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      timestamp: new Date().toISOString(),
      problemType: r.problemType,
      userAnswers: { ...S.answers },
      analysis: r,
    };
    store.unshift(entry);
    saveStore(store);
    $("saveBtn").textContent = "✓ Gespeichert";
    $("saveBtn").disabled = true;
  });
  $("newBtn").addEventListener("click", () => { S.step = 0; S.answers = {}; show("welcome"); });
  $("histBtn").addEventListener("click", () => renderHistory());
}

// ─── HISTORY ──────────────────────────────────────────────────
function renderHistory() {
  show("history");
  const store = loadStore();
  const filter = $("filterType").value;
  const filtered = filter ? store.filter(e => e.problemType === filter) : store;
  const list = $("historyList");

  if (!filtered.length) {
    list.innerHTML = `<div class="hist-empty">Noch keine Ergebnisse gespeichert.<br>Führe erst eine Analyse durch.</div>`;
    return;
  }

  list.innerHTML = filtered.map((e, idx) => {
    const d = new Date(e.timestamp);
    const typeLabels = { career: "Beruf", relationship: "Beziehung", mental: "Mental", financial: "Finanzen", identity: "Identität", other: "Allgemein" };
    const sig = (e.analysis?.significance || "medium").toLowerCase();
    const sigClass = { high: "pill--high", medium: "pill--medium", low: "pill--low" };
    return `
    <div class="hist-item" data-idx="${idx}">
      <div class="hist-top">
        <span class="hist-prob">${escapeHtml((e.userAnswers.problem || "").slice(0, 80))}${(e.userAnswers.problem||"").length > 80 ? "…" : ""}</span>
        <span class="hist-date">${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"})}</span>
      </div>
      <div class="hist-meta">
        <span class="pill pill--concept">${typeLabels[e.problemType] || "Allgemein"}</span>
        <span class="pill ${sigClass[sig]||"pill--medium"}">${(e.analysis?.significance||"medium").toUpperCase()}</span>
      </div>
      <div class="hist-detail">
        <p><strong>Lösung:</strong> ${escapeHtml(e.analysis?.recognizedSolution || "—")}</p>
        <p><strong>Schritte:</strong></p>
        <ol style="padding-left:20px">${(e.analysis?.nextSteps||[]).map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        <p><strong>Zitat:</strong> „${escapeHtml(e.analysis?.inspirationalQuote || "")}" — ${escapeHtml(e.analysis?.quoteAuthor || "")}</p>
        <div class="hist-actions">
          <button class="btn btn--danger btn--sm" data-del="${idx}" type="button">Löschen</button>
        </div>
      </div>
    </div>`;
  }).join("");

  // toggle detail
  list.querySelectorAll(".hist-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.dataset.del !== undefined) return;
      item.classList.toggle("is-open");
    });
  });
  list.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.del);
      const store = loadStore();
      store.splice(idx, 1);
      saveStore(store);
      renderHistory();
    });
  });
}

$("filterType").addEventListener("change", renderHistory);
$("exportBtn").addEventListener("click", () => {
  const store = loadStore();
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "problemlöser-export.json"; a.click();
  URL.revokeObjectURL(url);
});

// ─── HELPERS ──────────────────────────────────────────────────
function escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escapeAttr(s) { return escapeHtml(s); }

// ─── INIT ─────────────────────────────────────────────────────
initOllama();

})(); // end IIFE
