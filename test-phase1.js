// PHASE-1-Test (aktualisiert auf Phase-4-API): Screen-Navigation headless
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function mkEl(id) {
  const el = { id, _classes: new Set(), attrs: {}, listeners: {}, value: "", textContent: "", innerHTML: "", style: {}, disabled: false };
  el.classList = {
    toggle(c, force) { if (force === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else { force ? el._classes.add(c) : el._classes.delete(c); } },
    add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); }, contains(c) { return el._classes.has(c); },
  };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.addEventListener = (ev, fn) => { (el.listeners[ev] = el.listeners[ev] || []).push(fn); };
  el.fire = (ev) => (el.listeners[ev] || []).forEach(fn => fn({ target: el }));
  el.click = () => el.fire("click");
  el.querySelectorAll = () => [];
  return el;
}

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]))];
const els = {};
ids.forEach(i => { els[i] = mkEl(i); });
["screen-questions", "screen-results", "screen-history"].forEach(i => els[i]._classes.add("hidden"));

const document = { getElementById: (i) => els[i] || null };
const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const window = {};
const sandbox = { document, window, console, localStorage };
vm.createContext(sandbox);

let errors = [];
try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), sandbox);
} catch (e) { errors.push("main.js warf: " + e.message); }

let fails = 0;
const check = (name, cond) => { console.log((cond ? "✓ " : "✗ FEHLER: ") + name); if (!cond) fails++; };

check("1) Welcome sichtbar nach Init (kein .hidden, aria-hidden=false)",
  !!els["screen-welcome"] && !els["screen-welcome"]._classes.has("hidden") && els["screen-welcome"].attrs["aria-hidden"] === "false");
check("2) startBtn existiert im HTML", ids.includes("startBtn"));

els.startBtn.click();
check("3) Klick auf 'Los geht's' zeigt Question-Screen (Welcome versteckt)",
  !els["screen-questions"]._classes.has("hidden") && els["screen-welcome"]._classes.has("hidden"));

els.navHistory.click();
check("   navHistory -> History sichtbar", !els["screen-history"]._classes.has("hidden"));

els.newProblemBtn.click();
check("   newProblemBtn -> Questions sichtbar, History versteckt",
  !els["screen-questions"]._classes.has("hidden") && els["screen-history"]._classes.has("hidden"));

els.navHome.click();
check("   navHome -> Welcome sichtbar", !els["screen-welcome"]._classes.has("hidden"));

check("4) Genau EIN Screen aktiv pro Zustand",
  Object.values(els).filter(e => e.id.startsWith("screen-") && !e._classes.has("hidden")).length === 1);

if (errors.length) { errors.forEach(e => console.log("✗ " + e)); fails += errors.length; }

console.log("\n" + (fails === 0 ? "✅ PHASE-1-TEST BESTANDEN" : "❌ " + fails + " Check(s) fehlgeschlagen"));
process.exit(fails ? 1 : 0);
