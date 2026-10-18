import { config as reactConfig } from "@repo/eslint-config/react-internal";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    files: ["src/**/*.{js,ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            "@babel/preset-typescript",
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
          plugins: ["@babel/plugin-syntax-jsx"],
        },
      },
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
