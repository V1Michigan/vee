// Match TypeScript's NodeNext .js imports in native Node tests and operator scripts.
// This hook never rewrites dependencies or resolves files outside agent/.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
const sourceRoot = new URL("../agent/", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.startsWith(sourceRoot)) {
      const candidate = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (candidate.href.startsWith(sourceRoot) && existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
