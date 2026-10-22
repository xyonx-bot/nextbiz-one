import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

// Flat config: the installed @next/eslint-plugin-next ships a legacy
// `configs.recommended` (plain rules map, no flat shape) — mount it manually
// on top of typescript-eslint so TS/JSX actually parses.
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // repo-wide pattern (prod Docker image included) — not a real issue here
      "@next/next/no-html-link-for-pages": "off",
    },
  },
);
