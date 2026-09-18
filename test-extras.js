// EXTRAS-Test: Kurven-Reaktion auf Q3 + Bibelverse-Toggle — headless
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
      const dId = /data-id="([^"]*)"/.exec(m[1]);
      const b = { dataset: { answer: dm ? dm[1] : undefined, id: dId ? dId[1] : undefined }, listeners: {},
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
const window = { __TEST: true };
const sandbox = { document, window, console, localStorage, confirm: () => true };
vm.createContext(sandbox);

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };

try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
} catch (e) { fails++; console.error("main.js warf:", e.message); }
const { appState, CURVE_FEEDBACK, bibleVerseFor } = window.__PS;

check("0a) HTML: curveFeedback-Container vorhanden", ids.includes("curveFeedback"));
check("0b) HTML: bibleToggle vorhanden", ids.includes("bibleToggle"));

// ─── 1) Kurven-Reaktion: 4 Patterns ────────────────────────────
els.startBtn.click();
els.q1Text.value = "Mein Boss stresst mich auf der Arbeit total."; els.q1Text.fire("input"); els.nextBtn.click();
els.q2Body.querySelectorAll(".q2-btn").find(b => b.dataset.answer === "Nein").click(); // → Q3

check("1a) Q3 betreten: curveFeedback sichtbar", !els.curveFeedback._classes.has("hidden"));
check("1b) Initial 5/5/5 → flat-Text", els.curveFeedback.textContent.includes("gleich bleibt"));

els.sliderYear.value = "1"; els.sliderYear.fire("input");   // today5 year1: decline=4 → gradual
check("1c) 5/5/1 → gradual_decline-Text", els.curveFeedback.textContent.includes("langsam weniger"));
els.sliderToday.value = "8"; els.sliderToday.fire("input"); // today8 year1: decline=7 → steep
check("1d) 8/5/1 → steep_decline-Text", els.curveFeedback.textContent.includes("vorbeigeht"));
els.sliderToday.value = "1"; els.sliderToday.fire("input");
els.sliderMonth.value = "5"; els.sliderMonth.fire("input");
els.sliderYear.value = "9"; els.sliderYear.fire("input");
check("1e) 1/5/9 → worsening-Text", els.curveFeedback.textContent.includes("schlimmer wird"));
check("1f) feedback.className enthält Pattern-Farbe", els.curveFeedback.className.includes("border-red-400"));

// ─── 2) Bibelverse-Toggle ──────────────────────────────────────
els.nextBtn.click(); // → Q4
els.sliderReadiness.value = "7"; els.sliderReadiness.fire("input");

// 2a) Toggle AUS → kein Bibelvers in Ergebnis + gespeichertem Objekt
els.nextBtn.click(); // → Results
check("2a) Toggle AUS: keine Bibel-Box im Ergebnis", !els.resultsContainer.innerHTML.includes("Biblische Weisheit"));
check("2b) Toggle AUS: bible=false im LocalStorage", window.__PS.loadStoredResults()[0].bible === false);

// 2b) Toggle AN + career-Typ → Vers im Ergebnis + Persistenz
els.newProblemBtn.click();
els.bibleToggle.checked = true;
els.q1Text.value = "Mein Boss und die Arbeit machen mich fertig."; els.q1Text.fire("input"); els.nextBtn.click();
els.q2Body.querySelectorAll(".q2-btn").find(b => b.dataset.answer === "Ja").click();
els.sliderToday.value = "8"; els.sliderToday.fire("input");
els.sliderMonth.value = "5"; els.sliderMonth.fire("input");
els.sliderYear.value = "2"; els.sliderYear.fire("input");
els.nextBtn.click(); els.sliderReadiness.value = "6"; els.sliderReadiness.fire("input");
els.nextBtn.click(); // → Results
check("2c) Toggle AN: Bibel-Box mit career-Vers (Kolosser)", els.resultsContainer.innerHTML.includes("Biblische Weisheit") && els.resultsContainer.innerHTML.includes("Kolosser"));
check("2d) bible=true im LocalStorage gespeichert", window.__PS.loadStoredResults()[0].bible === true);

// ─── 3) Vers-Auswahl je Typ ────────────────────────────────────
check("3a) career→Kolosser · mental→Jesaja · relationship→Korinther",
  bibleVerseFor("career").includes("Kolosser") && bibleVerseFor("mental").includes("Jesaja") && bibleVerseFor("relationship").includes("Korinther"));
check("3b) unbekannter Typ → other (Sprüche)", bibleVerseFor("xyz").includes("Sprüche"));

// ─── 4) History-Detail zeigt Bibelvers bei gespeichertem Eintrag ─
const entry = window.__PS.loadStoredResults()[0];
window.__PS.viewResultDetail(entry.id);
check("4) Detail-Ansicht alte Ergebnis mit Bible=true zeigt Vers", els.resultsContainer.innerHTML.includes("Kolosser"));

console.log("\n" + (fails === 0 ? "✅ EXTRAS-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
process.exit(fails ? 1 : 0);
