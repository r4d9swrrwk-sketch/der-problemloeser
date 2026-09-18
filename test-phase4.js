// PHASE-4-Test: Ergebnis-Karten, LocalStorage, Auto-Save, History, Detail, Delete — headless
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// ─── DOM-STUB ──────────────────────────────────────────────────
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
    const btnRe = /<button([^>]*)>/g; let m;
    while ((m = btnRe.exec(el.innerHTML))) {
      const attrs = m[1];
      const cm = /class="([^"]*)"/.exec(attrs);
      if (!cm || !cm[1].split(/\s+/).includes(cls)) continue;
      const dId = /data-id="([^"]*)"/.exec(attrs);
      const dAns = /data-answer="([^"]*)"/.exec(attrs);
      const b = {
        dataset: { id: dId ? dId[1] : undefined, answer: dAns ? dAns[1] : undefined },
        listeners: {},
        addEventListener(ev, fn) { (b.listeners[ev] = b.listeners[ev] || []).push(fn); },
        click() { (b.listeners.click || []).forEach(fn => fn({ target: b })); },
      };
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
const document = { getElementById: (i) => els[i] || null };

// ─── localStorage (persistiert über "Reload" hinweg) ──────────
function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}
const localStorage = makeLocalStorage();

function runMain(win) {
  const sandbox = { document, window: win, console, localStorage, confirm: () => true };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
  return win.__PS;
}

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };

const window1 = { __TEST: true };
let PS;
try { PS = runMain(window1); } catch (e) { fails++; console.error("main.js warf:", e.message); }

// ─── 1) UUID ───────────────────────────────────────────────────
const u1 = PS.generateUUID(), u2 = PS.generateUUID();
check("1a) generateUUID: gültiges Format", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u1));
check("1b) generateUUID: eindeutig", u1 !== u2);

// ─── 2) analyzeTimeline ────────────────────────────────────────
check("2) analyzeTimeline 4 Patterns:",
  PS.analyzeTimeline(8, 4, 1) === "steep_decline" && PS.analyzeTimeline(5, 5, 5) === "flat" &&
  PS.analyzeTimeline(3, 5, 8) === "worsening" && PS.analyzeTimeline(7, 5, 4) === "gradual_decline");

// ─── 3) LocalStorage Round-Trip ────────────────────────────────
PS.saveResultToLocalStorage({ id: "test-1", timestamp: new Date().toISOString(), problem: "Test", problemType: "other", timeline: { today: 1, month: 1, year: 1 }, trend: "flat", readiness: 1 });
check("3a) saveResultToLocalStorage schreibt in Storage", localStorage._map.has(PS.STORAGE_KEY));
check("3b) loadStoredResults findet den Eintrag", PS.loadStoredResults()[0].id === "test-1");

// ─── 4) Volle Pipeline → Ergebnis-Karten + Auto-Save ──────────
els.startBtn.click();
els.q1Text.value = "Mein Chef und die Arbeit machen mich fertig, der Boss schreit.";
els.q1Text.fire("input"); els.nextBtn.click();
els.q2Body.querySelectorAll(".q2-btn").find(b => b.dataset.answer === "Nein").click(); // → Q3
els.sliderToday.value = "8"; els.sliderToday.fire("input");
els.sliderMonth.value = "5"; els.sliderMonth.fire("input");
els.sliderYear.value = "2"; els.sliderYear.fire("input");
els.nextBtn.click(); // → Q4
els.sliderReadiness.value = "9"; els.sliderReadiness.fire("input");
els.nextBtn.click(); // Analysieren → Results

check("4a) Results-Screen sichtbar", !els["screen-results"]._classes.has("hidden"));
const rc = els.resultsContainer.innerHTML;
check("4b) Problem-Box mit Text", rc.includes("Dein Problem") && rc.includes("Boss schreit"));
check("4c) Typ-Box 'Beruf / Arbeit'", rc.includes("Beruf / Arbeit"));
check("4d) Timeline-Werte + Trend", rc.includes("Heute: 8") && rc.includes("1 Monat: 5") && rc.includes("1 Jahr: 2") && rc.includes("Steil fallend"));
check("4e) Bereitschaft 9/10", rc.includes("9 / 10"));
const afterSubmit = PS.loadStoredResults();
check("4f) Auto-Save: Eintrag nr.2 vorhanden (neueste zuerst)", afterSubmit.length === 2 && afterSubmit[0].id !== "test-1" && afterSubmit[0].readiness === 9);
check("4g) Speichern-Button auf '✓ Gespeichert' + disabled", els.saveBtn.textContent.includes("Gespeichert") && els.saveBtn.disabled === true);

// ─── 5) Refresh-Persistenz (neuer VM-Kontext, gleicher Storage) ─
const window2 = { __TEST: true };
const PS2 = runMain(window2);
check("5) Nach 'Browser-Refresh': alle Ergebnisse noch im LocalStorage", PS2.loadStoredResults().length === 2);

// ─── 6) History-Seite ──────────────────────────────────────────
els.navHistory.click();
check("6a) History-Screen sichtbar", !els["screen-history"]._classes.has("hidden"));
const hl = els.historyList.innerHTML;
check("6b) Liste zeigt Ergebnisse (neueste zuerst)", hl.indexOf("Boss schreit") !== -1 && hl.indexOf("Boss schreit") < hl.indexOf("Test"));
check("6c) Buttons 👁️ Ansehen + 🗑️ Löschen vorhanden", hl.includes("Ansehen") && hl.includes("Löschen"));

// ─── 7) Detail-Ansicht ─────────────────────────────────────────
const newId = PS2.loadStoredResults()[0].id;
PS2.viewResultDetail(newId);
check("7) viewResultDetail zeigt 'Gespeichertes Ergebnis'", !els["screen-results"]._classes.has("hidden") && els.resultsContainer.innerHTML.includes("Gespeichertes Ergebnis"));

// ─── 8) Löschen ────────────────────────────────────────────────
PS2.deleteResult("test-1");
check("8a) deleteResult entfernt Eintrag", PS2.loadStoredResults().length === 1);
PS2.deleteResult(PS2.loadStoredResults()[0].id);
check("8b) Alles gelöscht → leerer Zustand", PS2.loadStoredResults().length === 0);
check("8c) Leere-History-Hinweis 'Noch keine Ergebnisse'", els.historyList.innerHTML.includes("Noch keine Ergebnisse"));

// ─── 9) Neues Problem setzt State zurück ───────────────────────
els.newProblemBtn.click();
check("9) newProblemBtn: Q1 wieder leer & Fragen-Start", appStateResetOk());
function appStateResetOk() {
  return Object.keys(window2.__PS.appState.userAnswers).length === 0 && window2.__PS.appState.currentQuestion === 1;
}

console.log("\n" + (fails === 0 ? "✅ PHASE-4-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
process.exit(fails ? 1 : 0);
