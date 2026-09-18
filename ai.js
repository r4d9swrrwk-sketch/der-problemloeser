/* Der Problemlöser — ai.js · Transformers.js Integration (additiv, nie blockierend)
 * Design-Regeln:
 *  1. Läuft NIE im Hauptpfad — Q2 rendert sofort mit Keyword-Typ, KI upgraded danach.
 *  2. Jeder Fehler/jedes Timeout → App verhält sich 100% wie ohne KI (source:"keyword").
 *  3. Lazy: Lib+Modell werden erst geladen wenn User im Welcome den KI-Toggle anlässt.
 *  4. Warmup startet beim Q1→Q2-Übergang im Hintergrund — bis "Analysieren" geklickt
 *     wird, ist das Modell meist schon da (danach IndexedDB-Cache, 2. Aufruf schnell).
 */
"use strict";

const PS_AI = (() => {
  const LIB_URL  = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";
  // Wichtig: das im Prompt genannte onnx-community/multilingual-MiniLMv2-L6-mnli-ONNX ist auf
  // HuggingFace gated (HTTP 401) — nie ladbar! Dieses hier ist öffentlich (verifiziert 2026-09-18),
  // mehrsprachig (de/fi/…), NLI-basiert — offiziellles Zero-Shot-Beispielmodell der Transformers.js-Doku.
  const MODEL_ID = "onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX";
  const WARMUP_MS = 120000; // ~320 MB quantisiert — Download läuft unsichtbar im Hintergrund
  const CLASSIFY_MS = 8000; // die eigentliche Klassifikation hat harte Obergrenze

  const TYPE_LABELS = {
    career: "Beruf & Arbeit", relationship: "Beziehung & Partnerschaft",
    mental: "Psychische Gesundheit", financial: "Finanzen & Schulden",
    material: "Verlust eines geliebten Gegenstands", other: "ein allgemeines Alltagsproblem",
  };
  const EMOTIONS = ["Wut", "Angst", "Traurigkeit", "Überforderung", "Scham", "Hoffnung"];
  const CONCEPTS = ["Arbeit", "Beziehung", "Gesundheit", "Finanzen", "Selbstwert", "Zukunft"];

  let pipe = null;        // zero-shot pipeline singleton
  let loading = null;     // laufendes/erledigtes Warmup-Versprechen
  let disabled = false;   // User hat Toggle aus → niemals laden

  async function loadLib() {
    // Test-Hook: headlose Läufe injizieren ein Mock (window.__PS_TEST_transformers) —
    // im Browser-Ernstfall wird er nie gesetzt sein und das echte CDN geladen.
    if (typeof window !== "undefined" && window.__PS_TEST_transformers) return window.__PS_TEST_transformers;
    return await import(LIB_URL);
  }

  function timeout(ms, label) {
    return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout:" + label)), ms));
  }

  async function ensurePipe() {
    if (pipe) return pipe;
    if (loading) return loading;
    loading = (async () => {
      const transformers = await loadLib();
      transformers.env.allowLocalModels = false;
      pipe = await Promise.race([
        transformers.pipeline("zero-shot-classification", MODEL_ID),
        timeout(WARMUP_MS, "warmup"),
      ]);
      return pipe;
    })().catch((e) => { loading = null; throw e; });
    return loading;
  }

  /** Startet Hintergrund-Warmup; Fehler werden nur geloggt, nie geworfen. */
  function warmup() {
    if (disabled) return;
    ensurePipe().catch((e) => console.warn("[PS_AI] Warmup fehlgeschlagen, Fallback aktiv:", e.message));
  }

  function setEnabled(on) { disabled = !on; if (!on) { pipe = null; loading = null; } }
  function status() {
    if (disabled) return "off";
    if (pipe) return "ready";
    if (loading) return "loading";
    return "idle";
  }

  /**
   * analyze(text, fallbackType) → { source, type, typeScore, emotion, concepts[] }
   * Liefert IMMER ein Ergebnis; KI-Probleme → source:"keyword" mit Fallback-Typ.
   */
  async function analyze(text, fallbackType) {
    const base = { source: "keyword", type: fallbackType || "other", typeScore: 0, emotion: null, concepts: [] };
    if (disabled || !text || text.length < 5) return base;
    try {
      const classifier = await Promise.race([ensurePipe(), timeout(CLASSIFY_MS, "classify")]);
      const [typeRes, emoRes, conRes] = await Promise.all([
        classifier(text, Object.values(TYPE_LABELS)),
        classifier(text, EMOTIONS),
        classifier(text, CONCEPTS, { multi_label: true }),
      ]);
      // Rückübersetzung Label → Key
      const keyOf = {}; Object.entries(TYPE_LABELS).forEach(([k, v]) => keyOf[v] = k);
      const top = typeRes.labels[0], topScore = typeRes.scores[0];
      const type = topScore >= 0.45 ? (keyOf[top] || fallbackType || "other") : (fallbackType || "other");
      const concepts = conRes.labels.filter((_, i) => conRes.scores[i] >= 0.35);
      return {
        source: topScore >= 0.45 ? "ai" : "keyword",
        type, typeScore: topScore,
        emotion: emoRes.scores[0] >= 0.35 ? emoRes.labels[0] : null,
        concepts,
      };
    } catch (e) {
      console.warn("[PS_AI] Analyse-Fallback (" + e.message + ")");
      return base;
    }
  }

  return { warmup, analyze, setEnabled, status, TYPE_LABELS };
})();

if (typeof window !== "undefined") window.PS_AI = PS_AI;
