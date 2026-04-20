import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: "readonly",
        process: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      // TypeScript checks these at higher fidelity than ESLint.
      "no-unused-vars": "off",
      "no-undef": "off",
      // Underscore-prefixed names are ignored (matches tsconfig conventions
      // and compile-time type assertion patterns).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "dist/**",
      "convex/_generated/**",
      "node_modules/**",
      "coverage/**",
      "src/routeTree.gen.ts",
      "prototype-archive/**",
    ],
  },
];
