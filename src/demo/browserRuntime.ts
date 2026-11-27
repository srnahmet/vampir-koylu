// Explicit asset URLs also work with Vite's dev dependency optimizer, where
// PGlite's default import-relative URLs otherwise point at an HTML fallback.
import bundleUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.data?url";
import wasmUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url";

let runtime: Promise<{ fsBundle: Blob; wasmModule: WebAssembly.Module }> | null = null;
export function loadDemoRuntime() {
  runtime ||= Promise.all([fetch(bundleUrl), fetch(wasmUrl)]).then(async ([bundle, wasm]) => {
    if (!bundle.ok || !wasm.ok) throw new Error("Demo dosyaları yüklenemedi. Yeniden deneyebilirsin.");
    const [fsBundle, wasmModule] = await Promise.all([bundle.blob(), wasm.arrayBuffer().then(bytes => WebAssembly.compile(bytes))]);
    return { fsBundle, wasmModule };
  }).catch(e => { runtime = null; throw e; });
  return runtime;
}
