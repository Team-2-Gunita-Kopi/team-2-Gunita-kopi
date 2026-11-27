// Global stylesheet imports (import "./x.css"). Newer TypeScript checks side-effect imports
// (noUncheckedSideEffectImports) and has no types for plain .css files without this.
declare module "*.css";
