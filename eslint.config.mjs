// eslint-config-next v16 ships native flat config, so it is imported directly
// rather than bridged through FlatCompat (which trips a circular reference on
// this version).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default eslintConfig;
