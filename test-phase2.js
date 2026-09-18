// PHASE-2-Test (aktualisiert auf Phase-4-API): Fragen-Flow Q1–Q4 headless
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function mkEl(id, initial) {
  const el = { id, _classes: new Set(initial && initial.classes || []), attrs: {}, listeners: {}, value: (initial && initial.value) || "", textContent: "", innerHTML: "", style: {}, disabled: false, _qsa: null };
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
  if (["screen-questions","screen-results","screen-history","q2","q3","q4","q1Error","q2Error"].includes(i)) seed.classes = ["hidden"];
  if (i === "backBtn") seed.classes = ["invisible"];
  if (["sliderToday","sliderMonth","sliderYear","sliderReadiness"].includes(i)) seed.value = "5";
  els[i] = mkEl(i, seed);
});
const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const document = { getElementById: (i) => els[i] || null };
const window = { __TEST: true };
const sandbox = { document, window, console, localStorage };
vm.createContext(sandbox);

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };

try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
} catch (e) { fails++; console.error("main.js warf:", e.message); }

const { appState } = window.__PS;

check("1a) Q1 sichtbar, Q2-Q4 versteckt; State exportiert", !!window.__PS && !els.q1._classes.has("hidden") && els.q2._classes.has("hidden"));

els.q1Text.value = "kurz"; els.q1Text.fire("input"); els.nextBtn.click();
check("1b) Q1-Validierung: Text <10 Zeichen blockiert Weiter + zeigt Fehler",
  appState.currentQuestion === 1 && !els.q1Error._classes.has("hidden"));

els.q1Text.value = "Mein Chef kritisiert mich ständig vor dem ganzen Team."; els.q1Text.fire("input");
check("1c) Q1 input speichert live in userAnswers[1]", appState.userAnswers[1] === "Mein Chef kritisiert mich ständig vor dem ganzen Team.");
check("1d) gültiger Text versteckt Fehler wieder", els.q1Error._classes.has("hidden"));

els.nextBtn.click();
check("2a) Weiter -> Q2 sichtbar, Q1 versteckt", !els.q2._classes.has("hidden") && els.q1._classes.has("hidden"));
check("2b) Progress nach Q2: 50%, Label 'Schritt 2 von 4'", els.progressFill.style.width === "50%" && els.stepLabel.textContent === "Schritt 2 von 4");

const q2btns = els.q2Body.querySelectorAll(".q2-btn");
check("3a-alt) Q2 rendert Buttons (other-Typ: 'Nicht sehr/Mittelmäßig/Sehr')", q2btns.length === 3);
q2btns[0].click();
check("3a) Q2-Auswahl speichert userAnswers[2] und zeigt Q3",
  appState.userAnswers[2] === q2btns[0].dataset.answer && !els.q3._classes.has("hidden"));

els.sliderToday.value = "8"; els.sliderToday.fire("input");
els.sliderMonth.value = "5"; els.sliderMonth.fire("input");
els.sliderYear.value = "2"; els.sliderYear.fire("input");
check("3b) Timeline-Werte live in userAnswers.timeline", JSON.stringify(appState.userAnswers.timeline) === JSON.stringify({ today: 8, month: 5, year: 2 }));
check("3c) Live-Anzeigen upgedatet (8/5/2)", els.valToday.textContent === "8" && els.valMonth.textContent === "5" && els.valYear.textContent === "2");

els.nextBtn.click();
check("4a) Q3-Weiter -> Q4 (Readiness) sichtbar", !els.q4._classes.has("hidden"));
check("4b) Button heißt auf Q4 '✅ Analysieren'", els.nextBtn.textContent.includes("Analysieren"));
els.sliderReadiness.value = "9"; els.sliderReadiness.fire("input");
check("4c) Readiness-Slider live (Anzeige 9)", els.valReadiness.textContent === "9");

els.nextBtn.click();
check("5a) Submit -> Results-Screen sichtbar, Questions versteckt",
  !els["screen-results"]._classes.has("hidden") && els["screen-questions"]._classes.has("hidden"));
check("5b) userAnswers.readiness === 9 gespeichert", appState.userAnswers.readiness === 9);

check("6a) Progress bei Q4 war 100%", els.progressFill.style.width === "100%");

els.newProblemBtn.click();
check("7a) newProblemBtn -> Questions wieder sichtbar, bei Q1",
  !els["screen-questions"]._classes.has("hidden") && !els.q1._classes.has("hidden") && appState.currentQuestion === 1);
check("7b) Back-Button auf Q1 versteckt", els.backBtn._classes.has("invisible"));
els.backBtn.click();
check("   Back auf Q1 tut nichts (kein Crash, bleibt Q1)", appState.currentQuestion === 1);

console.log("\n" + (fails === 0 ? "✅ PHASE-2-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
process.exit(fails ? 1 : 0);
