import { config as baseConfig } from "@repo/eslint-config/base";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ["src/**/*.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        chrome: "readonly",
      },
    },
    rules: {
      // Shared Babel parser does not understand TypeScript type positions.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
