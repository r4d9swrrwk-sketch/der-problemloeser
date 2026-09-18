// PHASE-3-Test: detectProblemType + Q2 Smart Branching (Button-Flow) headless
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function mkEl(id, initial) {
  const el = { id, _classes: new Set(initial && initial.classes || []), attrs: {}, listeners: {}, value: (initial && initial.value) || "", textContent: "", innerHTML: "", style: {}, _qsa: null };
  el.classList = {
    toggle(c, force) { if (force === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else { force ? el._classes.add(c) : el._classes.delete(c); } },
    add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); }, contains(c) { return el._classes.has(c); },
  };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.addEventListener = (ev, fn) => { (el.listeners[ev] = el.listeners[ev] || []).push(fn); };
  el.fire = (ev) => (el.listeners[ev] || []).forEach(fn => fn({ target: el }));
  el.click = () => el.fire("click");
  // querySelectorAll: parst data-answer-Buttons aus innerHTML; gecachet pro HTML-Stand,
  // damit main.js und Test dieselben Stub-Objekte (mit denselben Listenern) sehen
  el.querySelectorAll = (sel) => {
    if (sel === ".q2-btn") {
      if (el._qsa && el._qsa.html === el.innerHTML) return el._qsa.res;
      const res = [...el.innerHTML.matchAll(/data-answer="([^"]+)"/g)].map(m => {
        const b = { dataset: { answer: m[1] }, listeners: {},
          addEventListener(ev, fn) { (b.listeners[ev] = b.listeners[ev] || []).push(fn); },
          click() { (b.listeners.click || []).forEach(fn => fn({ target: b })); } };
        return b;
      });
      el._qsa = { html: el.innerHTML, res };
      return res;
    }
    return [];
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

const document = { getElementById: (i) => els[i] || null };
const window = { __TEST: true };
const sandbox = { document, window, console };
vm.createContext(sandbox);

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };

try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
} catch (e) { fails++; console.error("main.js warf:", e.message); }

const { appState, detectProblemType, selectQ2Answer } = window.__PS;

// ─── 1) detectProblemType — alle 6 Typen ───────────────────────
check("1a) 'Mein Boss...' → career:", detectProblemType("Mein Boss nervt mich täglich auf der Arbeit") === "career");
check("1b) 'Mein Partner...' → relationship:", detectProblemType("Mein Partner redet nicht mit mir") === "relationship");
check("1c) 'Ich bin depressiv' → mental:", detectProblemType("Ich bin depressiv") === "mental");
check("1d) 'Schulden' → financial:", detectProblemType("Ich habe zu viele Schulden") === "financial");
check("1e) 'Pullover weg' → material:", detectProblemType("Mein Pullover ist weg") === "material");
check("1f) nichts → other:", detectProblemType("Der Drucker im Büro spinnt") === "other");

// ─── 2) Q2 Branching im UI: career ─────────────────────────────
els.startBtn.click();
els.q1Text.value = "Mein Boss ignoriert mich ständig bei der Arbeit.";
els.q1Text.fire("input");
els.nextBtn.click(); // Q1 → Q2
check("2a) Q2 career-Frage gerendert ('Boss zu reden'):", els.q2Body.innerHTML.includes("Boss zu reden"));
check("2b) 3 Buttons Ja/Nein/Irgendwie:", /Ja/.test(els.q2Body.innerHTML) && /Nein/.test(els.q2Body.innerHTML) && /Irgendwie/.test(els.q2Body.innerHTML));
check("2c) problemType in appState gespeichert:", appState.userAnswers.problemType === "career");

// ohne Auswahl blockiert Weiter
els.nextBtn.click();
check("2d) Ohne Auswahl: bleibt Q2 + Fehler sichtbar", appState.currentQuestion === 2 && !els.q2Error._classes.has("hidden"));

// Button-Klick → direkt Q3
els.q2Body.querySelectorAll(".q2-btn").find(b => b.dataset.answer === "Nein").click();
check("2e) Button-Klick speichert userAnswers[2]='Nein' und zeigt Q3",
  appState.userAnswers[2] === "Nein" && !els.q3._classes.has("hidden") && els.q2._classes.has("hidden"));

// ─── 3) relationship-Branch ────────────────────────────────────
appState.userAnswers = {}; goTo(1);
els.q1Text.value = "Mein Partner und ich streiten permanent in unserer Beziehung.";
els.q1Text.fire("input");
els.nextBtn.click();
check("3a) relationship-Frage ('darüber geredet'):", els.q2Body.innerHTML.includes("darüber geredet"));

// ─── 4) mental-Branch ──────────────────────────────────────────
appState.userAnswers = {}; goTo(1);
els.q1Text.value = "Ich bin depressiv und habe jede Woche Angstattacken, dazu Stress.";
els.q1Text.fire("input");
els.nextBtn.click();
check("4a) mental-Frage ('Wie lange dauert das schon'):", els.q2Body.innerHTML.includes("Wie lange dauert das schon"));
check("4b) 5 Buttons (Heute…1+ Jahr):", els.q2Body.querySelectorAll(".q2-btn").length === 5);

// ─── 5) material + financial + other ───────────────────────────
appState.userAnswers = {}; goTo(1);
els.q1Text.value = "Mein Handy ist verloren gegangen."; els.q1Text.fire("input"); els.nextBtn.click();
check("5a) material-Frage ('emotional belastet'):", els.q2Body.innerHTML.includes("emotion"));
appState.userAnswers = {}; goTo(1);
els.q1Text.value = "Das Geld reicht nicht, ich habe Schulden beim Kredit."; els.q1Text.fire("input"); els.nextBtn.click();
check("5b) financial-Frage ('Schulden oder zu wenig'):", els.q2Body.innerHTML.includes("Schulden oder zu wenig"));
appState.userAnswers = {}; goTo(1);
els.q1Text.value = "Meine Pflanze ist eingegangen, das traurig mich."; els.q1Text.fire("input"); els.nextBtn.click();
check("5c) other-Frage ('Verstanden. Wie belastet'):", els.q2Body.innerHTML.includes("Verstanden"));

function goTo(n) { window.__PS.goToQuestion(n); }
els.startBtn.click();

console.log("\n" + (fails === 0 ? "✅ PHASE-3-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
process.exit(fails ? 1 : 0);
