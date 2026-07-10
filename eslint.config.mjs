import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        structuredClone: "readonly"
      }
    }
  },
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**", ".repo.git/**", ".next/**"]
  }
];
