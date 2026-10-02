import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules", "concept", "spec", "profile", ".claude", "editor/dist"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "suite", "describe", "it"] },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      // A `!` states an invariant the code guarantees (AGENTS.md).
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "@getpaseo/*/**",
                "@getpaseo/client",
                "@getpaseo/protocol",
                "../server/*",
                "../../server/*",
                "react",
                "react-native",
              ],
              message:
                "shared/ runs in the daemon and the app: pure code only; of Paseo, only @getpaseo/plugin's settings definitions.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["client/**/*.{ts,tsx}", "index.client.tsx"],
    languageOptions: {
      parserOptions: { projectService: false, project: "./tsconfig.client.json", tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["editor/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: false, project: "./editor/tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["eslint.config.js"], extends: [tseslint.configs.disableTypeChecked] },
);
