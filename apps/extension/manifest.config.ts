import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json";

/** Sole DEGIRO surface this extension binds to. */
const TRADER_MATCH = "https://trader.degiro.nl/*";

export default defineManifest({
  manifest_version: 3,
  name: "Degiroid",
  description:
    "Companion for the DEGIRO web trader at https://trader.degiro.nl",
  version: packageJson.version,
  icons: {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Degiroid",
    default_icon: {
      "16": "public/icons/icon-16.png",
      "32": "public/icons/icon-32.png",
      "48": "public/icons/icon-48.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: [TRADER_MATCH],
      js: ["src/content/index.ts"],
      css: ["src/content/panel.css"],
      run_at: "document_idle",
    },
  ],
  host_permissions: [TRADER_MATCH],
  permissions: ["storage", "tabs", "alarms"],
  externally_connectable: {
    matches: [TRADER_MATCH],
  },
});
