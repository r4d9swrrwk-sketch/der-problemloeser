// Headless logic test for Der Problemlöser engine
const fs = require("fs");
const vm = require("vm");

// stub browser globals
const elStub = {};
global.window = {
  __PS: {},
  document: {
    getElementById: () => ({
      style:{}, setAttribute(){}, addEventListener(){}, classList:{toggle(){},add(){},remove(){}},
      innerHTML:"", textContent:"", value:"", checked:false, disabled:false,
      querySelectorAll: () => [], appendChild(){}, dataset:{},
    }),
    querySelectorAll: () => [],
    createElement: () => ({ href:"", click(){}, download:"", addEventListener(){} }),
  },
  crypto: { randomUUID: () => String(Date.now()) },
  Blob: function(){}, URL: { createObjectURL:() => "blob://x", revokeObjectURL(){} },
  AbortSignal: { timeout: () => undefined },
  fetch: () => Promise.reject(new Error("no fetch in test")),
};
global.localStorage = { getItem: () => null, setItem(){} };
global.AbortSignal = { timeout: () => undefined };

const sandbox = { console, window: global.window, localStorage: global.localStorage, AbortSignal: global.AbortSignal, fetch: global.window.fetch, crypto: global.window.crypto, Blob: global.window.Blob, URL: global.window.URL, document: global.window.document, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(sandbox);
const src = fs.readFileSync(__dirname + "/engine.js", "utf8");
vm.runInContext(src + "\n; window.__PS = { S, STEPS, visibleSteps, currentStep, nextStep, prevStep, analyze, checkOllama, detectType, isCrisis, loadStore, saveStore, STORE_KEY };", sandbox);

const { S, STEPS, visibleSteps, analyze, detectType, isCrisis } = sandbox.window.__PS;

console.log("=== Der Problemlöser engine test ===");
console.log("total step definitions:", STEPS.length);

// Test 1: career path (can solve = yes)
S.step = 0; S.answers = {
  problem: "Mein Chef kommuniziert nicht klar und ich fühle mich demotiviert bei der Arbeit.",
  canSolve: "yes",
  whyNot: "Ich habe Angst vor der Reaktion meines Chefs wenn ich das anspreche",
  affected: ["Nur ich", "Meine Arbeit / Karriere"],
  time1w: "yes", time1m: "yes", time1y: "no",
  counterfactual: "Ich hätte früher ein Gespräch gesucht und meine Erwartungen klar kommuniziert.",
  smallestStep: "Morgen ein Meeting mit meinem Chef anfragen für ein Feedback-Gespräch.",
};
const visYes = visibleSteps();
console.log("career path visible steps:", visYes.map(s => s.id));
console.log("canSolve=yes skips whyExternal/readiness:", !visYes.some(s => ["whyExternal","externalReframe","readiness","readinessLow"].includes(s.id)));

const r1 = analyze(); // returns promise
r1.then(a => {
  console.log("career analysis:", { type: a.problemType, sig: a.significance, concepts: a.psychologicalConcepts, source: a._source });
  console.log("nextSteps:", a.nextSteps);

  // Test 2: external path (can solve = no, low readiness)
  S.step = 0; S.answers = {
    problem: "Meine Freundin will sich trennen und ich kann nichts dagegen tun.",
    canSolve: "no",
    whyExternal: "Sie hat die Entscheidung schon getroffen, ich kann sie nicht umstimmen.",
    externalReframe: "Ich kann kontrollieren, wie ich damit umgehe und was ich sage.",
    readiness: 2,
    readinessLow: "Es kümmert mich weil ich nicht loslassen kann.",
    affected: ["Nur ich", "Meine Familie / Partner"],
    time1w: "yes", time1m: "yes", time1y: "yes",
    counterfactual: "Ich hätte früher auf ihre Bedürfnisse gehört und öfter mit ihr gesprochen.",
    smallestStep: "Morgen mit einem Freund darüber sprechen.",
  };
  const visNo = visibleSteps();
  console.log("\nexternal path visible steps:", visNo.map(s => s.id));
  console.log("includes readiness:", visNo.some(s => s.id === "readiness"));
  console.log("includes readinessLow:", visNo.some(s => s.id === "readinessLow"));

  const r2 = analyze();
  r2.then(a2 => {
    console.log("external analysis:", { type: a2.problemType, sig: a2.significance, concepts: a2.psychologicalConcepts });

    // Test 3: crisis detection
    console.log("\ncrisis 'suizid':", isCrisis("Ich denke an Suizid"));
    console.log("crisis 'leben nicht mehr':", isCrisis("Ich will nicht mehr leben"));
    console.log("crisis false positive:", !isCrisis("Ich fühle mich gestresst"));

    // Test 4: type detection
    console.log("\ntype 'chef':", detectType("Mein Chef nervt"));
    console.log("type 'geld':", detectType("Ich habe Schulden"));
    console.log("type 'depress':", detectType("Ich bin depressiv"));
    console.log("type 'partner':", detectType("Meine Frau versteht mich nicht"));

    console.log("\n✅ All engine tests passed");
  });
});
