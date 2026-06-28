import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "eslint-plugin-vitest";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // TypeScript — stricter than next/typescript defaults
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Zod — schemas should always be exported as const, types inferred via z.infer
      "@typescript-eslint/no-unsafe-assignment": "off", // zod .parse() returns unknown in strict mode

      // General quality
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React Hooks — exhaustive-deps as error prevents stale closures
      "react-hooks/exhaustive-deps": "error",

      // Import ordering: react/next → external → internal (@/) → relative
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^react", "^next"],
            ["^@?\\w"],
            ["^@/"],
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    plugins: {
      "testing-library": testingLibrary,
      vitest,
    },
    rules: {
      ...testingLibrary.configs.react.rules,
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-focused-tests": "error",
    },
  },
]);

export default eslintConfig;
