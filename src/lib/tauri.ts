// Tauri wrappers with graceful browser fallback (so `npm run dev` works too).

import { APPS, type AltApp } from "../data/apps";

export interface DocFile {
  name: string;
  path: string;
  ext: string;
  size: number;
  modified: number;
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function listDocuments(extensions?: string[], extraRoots?: string[]): Promise<DocFile[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<DocFile[]>("list_documents", {
      extensions: extensions ?? null,
      extraRoots: extraRoots ?? null,
    });
  } catch {
    return [];
  }
}

/**
 * File extensions actually linked to catalog apps (from each app's `handles`),
 * minus generic clutter (random photos, videos, music) that no project needs.
 */
const GENERIC_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff",
  "mp4", "mov", "mkv", "avi", "mp3",
]);

export function appLinkedExtensions(): string[] {
  const set = new Set<string>();
  for (const a of APPS) {
    for (const h of a.handles) set.add(h.replace(/^\./, "").toLowerCase());
  }
  return [...set].filter((e) => !GENERIC_EXTS.has(e));
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_path", { path });
}

/** Attempt to launch an installed desktop app. Throws "not-found" if missing. */
export async function openApp(executables: string[]): Promise<string> {
  if (!isTauri()) throw new Error("not-tauri");
  return invoke<string>("open_app", { executables });
}

// ---------------------------------------------------------------------------
// Child windows: Anobe App Installer / Anobe Webapp / Anobe Docs.
// ---------------------------------------------------------------------------

export type ChildKind = "installer" | "webapp" | "docssite";

export interface ChildRef {
  id: string;
  title: string;
  adobe?: string;
  icon?: string;
  adobeIcon?: string;
}

export async function openChildWindow(kind: ChildKind, ref: ChildRef, url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_child_window", { kind, appId: ref.id, title: ref.title, adobe: ref.adobe ?? null, adobeIcon: ref.adobeIcon ?? null, icon: ref.icon ?? null, url });
}

/** "Anobe App Installer - {app}": webview of the official install page. Never silent. */
export const openInstaller = (app: AltApp): Promise<void> =>
  openChildWindow("installer", { id: app.id, title: app.alt, adobe: app.adobe, icon: app.icon, adobeIcon: (app as any).adobeIcon }, app.installUrl);

/** "Anobe Webapp - {app}": the web app integrated into its own window. */
export const openWebApp = (app: AltApp): Promise<void> =>
  openChildWindow("webapp", { id: app.id, title: app.alt, adobe: app.adobe, icon: app.icon, adobeIcon: (app as any).adobeIcon }, app.website);

/** "Anobe Docs - {app}": official docs site in its own webview. */
export const openDocsSite = (app: AltApp): Promise<void> =>
  openChildWindow("docssite", { id: app.id, title: app.alt, adobe: app.adobe, icon: app.icon, adobeIcon: (app as any).adobeIcon }, app.docsUrl);

export type DocsTab = "guide" | "docs";

export async function openDocsWindow(appId?: string, tab: DocsTab = "guide"): Promise<void> {
  if (!isTauri()) {
    window.dispatchEvent(new CustomEvent("anobe:preview-docs", { detail: { appId, tab } }));
    return;
  }
  await invoke("open_docs_window", { appId: appId ?? null, tab });
}

export interface PendingDoc {
  app_id: string;
  tab: string;
}

export async function takePendingDoc(): Promise<PendingDoc | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<PendingDoc | null>("take_pending_doc");
  } catch {
    return null;
  }
}

export async function listenDocEvent(cb: (p: PendingDoc) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<PendingDoc>("anobe:open-doc", (e) => cb(e.payload));
    return unlisten;
  } catch {
    return () => undefined;
  }
}

export async function getWindowLabel(): Promise<string> {
  if (typeof window !== "undefined" && window.location.search.includes("window=docs")) {
    return "docs"; // browser preview of the Docs window
  }
  if (!isTauri()) return "main";
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

// ---------------------------------------------------------------------------
// digiKam (Bridge replacement) powers the Documents tab.
// ---------------------------------------------------------------------------

export interface DigikamStatus {
  installed: boolean;
  path: string | null;
}

export async function digikamStatus(): Promise<DigikamStatus> {
  if (!isTauri()) return { installed: false, path: null };
  try {
    return await invoke<DigikamStatus>("digikam_status");
  } catch {
    return { installed: false, path: null };
  }
}

export async function openDigikam(): Promise<void> {
  await invoke("open_digikam");
}

/** Debug logging to the Tauri log file + terminal (log plugin, debug level). */
export async function logDebug(msg: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { debug } = await import("@tauri-apps/plugin-log");
    await debug(msg);
  } catch {
    /* logging must never break the app */
  }
}

export async function logWarn(msg: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { warn } = await import("@tauri-apps/plugin-log");
    await warn(msg);
  } catch {
    /* logging must never break the app */
  }
}

export interface DriveStatus {
  installed: boolean;
  folder: string | null;
}

/** Google Drive for Desktop: client present? local "My Drive" folder mounted? */
export async function driveStatus(): Promise<DriveStatus> {
  if (!isTauri()) return { installed: false, folder: null };
  try {
    return await invoke<DriveStatus>("drive_status");
  } catch {
    return { installed: false, folder: null };
  }
}

export type ShortcutLocation = "desktop" | "startmenu";

/**
 * Create a Start Menu / Desktop shortcut for an installed app.
 * Throws "not-found" when the app isn't installed yet.
 */
export async function createShortcut(
  name: string,
  executables: string[],
  location: ShortcutLocation
): Promise<string> {
  if (!isTauri()) throw new Error("not-tauri");
  return invoke<string>("create_shortcut", { name, executables, location });
}

export function formatBytes(n: number): string {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(secs: number): string {
  if (!secs) return "—";
  return new Date(secs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Images tab: raster + RAW + paint project formats (digiKam's home turf).
// ---------------------------------------------------------------------------

export const IMAGE_EXTS = [
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff",
  "heic", "heif", "dng", "nef", "cr2", "cr3", "arw", "orf", "rw2",
  "kra", "psd", "psb", "afphoto", "ora", "svg",
];

/** Thumbnail URL for a local image (asset protocol). Falls back gracefully. */
export async function thumbnailSrc(absPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return convertFileSrc(absPath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Open With: owner app, capable PC apps, Windows dialog, show in folder.
// ---------------------------------------------------------------------------

export interface OpenerCandidate {
  label: string;
  path: string;
}

export interface FileOpeners {
  owner_found: boolean;
  candidates: OpenerCandidate[];
}

export async function fileOpeners(ext: string, ownerExes: string[]): Promise<FileOpeners> {
  if (!isTauri()) return { owner_found: false, candidates: [] };
  try {
    return await invoke<FileOpeners>("file_openers", { ext, ownerExes });
  } catch {
    return { owner_found: false, candidates: [] };
  }
}

export async function openWithExe(path: string, exe: string): Promise<void> {
  await invoke("open_with_exe", { path, exe });
}

export async function openWithDialog(path: string): Promise<void> {
  await invoke("open_with_dialog", { path });
}

export async function revealInDir(path: string): Promise<void> {
  if (!isTauri()) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export interface DetectRequest {
  id: string;
  executables: string[];
  alt: string;
}

export interface DetectResult {
  id: string;
  installed: boolean;
  path: string | null;
}

export async function detectInstalled(requests: DetectRequest[]): Promise<DetectResult[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<DetectResult[]>("detect_installed", { requests });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deep links: anobe://open/<id> | install/<id> | docs[/<id>] | apps | documents
// ---------------------------------------------------------------------------

export interface PendingLink {
  action: string;
  id: string | null;
}

export async function takePendingLink(): Promise<PendingLink | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<PendingLink | null>("take_pending_link");
  } catch {
    return null;
  }
}

export async function listenDeepLink(cb: (p: PendingLink) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<PendingLink>("anobe:deeplink", (e) => cb(e.payload));
    return unlisten;
  } catch {
    return () => undefined;
  }
}

export async function listenGoto(cb: (route: string) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<string>("anobe:goto", (e) => cb(e.payload));
    return unlisten;
  } catch {
    return () => undefined;
  }
}

// ---------------------------------------------------------------------------
// System suitability (os-info plugin + browser hardware hints).
// ---------------------------------------------------------------------------

export interface SystemInfo {
  cores: number | null;
  ramGB: number | null;
  osLabel: string;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  const ramGB = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  let osLabel = nav.userAgentData?.platform ?? navigator.platform ?? "Unknown OS";
  if (isTauri()) {
    try {
      const os = await import("@tauri-apps/plugin-os");
      const [platform, version, arch] = await Promise.all([os.platform(), os.version(), os.arch()]);
      let displayVersion = version;
      // Windows 11 still reports as 10.0.x with build >= 22000 — fix the label
      if (platform === "windows") {
        const m = version.match(/^10\.0\.(\d+)/);
        if (m) {
          const build = parseInt(m[1], 10);
          if (build >= 22000) displayVersion = version.replace(/^10\.0\./, "11.");
          // 26100+ is 24H2, but still 11
        }
      }
      osLabel = `${platform} ${displayVersion} (${arch})`;
    } catch {
      /* keep browser fallback */
    }
  }
  return { cores, ramGB, osLabel };
}

export async function appLogDir(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { appLogDir } = await import("@tauri-apps/api/path");
    return await appLogDir();
  } catch {
    return null;
  }
}
