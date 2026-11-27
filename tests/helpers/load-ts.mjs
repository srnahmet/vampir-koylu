import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Load client components without a DOM or a second test bundler.
export function loadTs(url, cache = new Map()) {
  const path = url.href;
  if (cache.has(path)) return cache.get(path).exports;
  const mod = { exports: {} };
  cache.set(path, mod);
  const require = createRequire(url);
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = spec => {
    if (spec.endsWith(".css")) return {};
    if (!spec.startsWith(".")) return require(spec);
    const base = new URL(spec, url);
    for (const ext of ["", ".ts", ".tsx"]) {
      const candidate = new URL(base.href + ext);
      try { readFileSync(candidate); } catch { continue; }
      return loadTs(candidate, cache);
    }
    return require(spec);
  };
  new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
  return mod.exports;
}
