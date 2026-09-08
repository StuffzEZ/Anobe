import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DocsApp from "./docs/DocsApp";
import { getWindowLabel, isTauri } from "./lib/tauri";
import "./styles.css";

async function attachLogs() {
  if (!isTauri()) return;
  try {
    const { attachConsole } = await import("@tauri-apps/plugin-log");
    await attachConsole();
  } catch {
    /* logging must never break boot */
  }
  // Forward boot/render crashes to the log FILE so Docs/main window
  // failures are diagnosable without devtools.
  try {
    const { error } = await import("@tauri-apps/plugin-log");
    window.addEventListener("error", (e) => {
      void error(`window.onerror [${window.location.href}]: ${e.message}`).catch(() => undefined);
    });
    window.addEventListener("unhandledrejection", (e) => {
      void error(
        `unhandledrejection [${window.location.href}]: ${String((e as PromiseRejectionEvent).reason)}`
      ).catch(() => undefined);
    });
  } catch {
    /* ignore */
  }
}

/** Main window: reveal it and dismiss the splashscreen once React is up. */
async function splashDance() {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().show();
  } catch {
    /* watchdog in Rust covers failures */
  }
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const splash = await Window.getByLabel("splashscreen");
    await splash?.close();
  } catch {
    /* watchdog in Rust covers failures */
  }
}

async function boot() {
  const label = await getWindowLabel();
  try {
    if (isTauri()) {
      const { debug } = await import("@tauri-apps/plugin-log");
      await debug(`boot window label=${label} url=${window.location.href}`);
    }
  } catch {
    /* ignore */
  }
  void attachLogs();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{label === "docs" ? <DocsApp /> : <App />}</React.StrictMode>
  );
  if (label === "main") void splashDance();
}

boot();
