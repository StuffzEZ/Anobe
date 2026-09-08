import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPS,
  CATEGORIES,
  POPULAR_IDS,
  getDisplayApps,
  matchesDisplayQuery,
  sysReqFor,
  type AltApp,
  type DisplayApp,
} from "./data/apps";
import {
  BookIcon,
  ChevronIcon,
  CloseIcon,
  CloudIcon,
  DocIcon,
  DotsIcon,
  DownloadIcon,
  FolderIcon,
  GearIcon,
  HomeIcon,
  ImagesIcon,
  AppsIcon,
  PinIcon,
  SearchIcon,
} from "./components/icons";
import {
  IMAGE_EXTS,
  appLinkedExtensions,
  appLogDir,
  createShortcut,
  digikamStatus,
  driveStatus,
  fileOpeners,
  formatBytes,
  getSystemInfo,
  isTauri,
  listDocuments,
  listenDeepLink,
  logDebug,
  logWarn,
  openApp,
  openChildWindow,
  openDigikam,
  openDocsWindow,
  openExternal,
  openInstaller,
  openPath,
  openWebApp,
  openWithDialog,
  openWithExe,
  revealInDir,
  takePendingLink,
  thumbnailSrc,
  type DigikamStatus,
  type DocFile,
  type DriveStatus,
  type FileOpeners,
  type PendingLink,
  type ShortcutLocation,
  type SystemInfo,
} from "./lib/tauri";

type Route = "home" | "apps" | "docs" | "images" | "settings";

const NAV: { id: Route | "docslink"; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "apps", label: "Apps", Icon: AppsIcon },
  { id: "docs", label: "Documents", Icon: FolderIcon },
  { id: "images", label: "Images", Icon: ImagesIcon },
  { id: "docslink", label: "Docs", Icon: BookIcon },
];

const CREATE_NEW: { label: string; appId: string; action: string }[] = [
  { label: "Photo project", appId: "photoshop", action: "Edit" },
  { label: "Vector logo", appId: "illustrator", action: "Draw" },
  { label: "Video cut", appId: "premiere-pro", action: "Cut" },
  { label: "Painting", appId: "fresco", action: "Paint" },
  { label: "3D scene", appId: "dimension", action: "Model" },
  { label: "Document", appId: "incopy", action: "Write" },
];

interface PinnedFile {
  name: string;
  path: string;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Real brand icon with a graceful fallback tile. */
export function AppIcon({ app, size = 36 }: { app: AltApp; size?: number }) {
  const [err, setErr] = useState(false);
  if (!err) {
    return (
      <img
        src={app.icon}
        width={size}
        height={size}
        alt=""
        onError={() => setErr(true)}
        style={{ borderRadius: size * 0.22, display: "block", flexShrink: 0 }}
      />
    );
  }
  const words = app.alt.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const text = words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: app.altColor,
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {text}
    </div>
  );
}

/** Adobe-style letter tile, used only in Adobify mode. */
function AdobeTile({ app, size = 36 }: { app: AltApp; size?: number }) {
  return (
    <div
      title={app.adobe}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: "#1b1a19",
        border: `${Math.max(2, size * 0.06)}px solid ${app.adobeColor}`,
        color: app.adobeColor,
        fontWeight: 700,
        fontSize: size * 0.32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {app.adobeCode}
    </div>
  );
}

function BrandIcon({ app, size, adobify }: { app: AltApp; size?: number; adobify: boolean }) {
  return adobify ? <AdobeTile app={app} size={size} /> : <AppIcon app={app} size={size} />;
}

function formatWhen(secs: number): string {
  if (!secs) return "—";
  const d = new Date(secs * 1000);
  const now = new Date();
  const startOfDay = (a: Date) => new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const MOCK_DOCS: DocFile[] = [
  { name: "hero-poster.afphoto", path: "Documents/hero-poster.afphoto", ext: "afphoto", size: 48234512, modified: Date.now() / 1000 - 86400 },
  { name: "wedding-042.nef", path: "Pictures/wedding-042.nef", ext: "nef", size: 28930111, modified: Date.now() / 1000 - 172800 },
  { name: "launch-cut_v3.drp", path: "Videos/launch-cut_v3.drp", ext: "drp", size: 812345, modified: Date.now() / 1000 - 259200 },
  { name: "brand-guidelines.afpub", path: "Documents/brand-guidelines.afpub", ext: "afpub", size: 12401002, modified: Date.now() / 1000 - 345600 },
  { name: "logo-pack.svg", path: "Documents/logo-pack.svg", ext: "svg", size: 48210, modified: Date.now() / 1000 - 432000 },
];

function appForExt(ext: string): AltApp | undefined {
  return APPS.find((a) => a.handles.includes(`.${ext}`));
}

interface FileMenuProps {
  file: DocFile;
  docsLive: boolean;
  notify: (msg: string) => void;
  markInstalled: (id: string) => void;
  installApp: (app: AltApp) => void;
  openOwnerWeb: (app: AltApp) => void;
}

/** Per-file "..." menu: default open, owner app, capable PC apps, Windows dialog. */
function FileMenu({ file, docsLive, notify, markInstalled, installApp, openOwnerWeb }: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const [probe, setProbe] = useState<FileOpeners | null>(null);
  const owner = appForExt(file.ext);
  const ownerDesktop =
    owner && owner.installType === "desktop" && owner.executables.length > 0 ? owner : null;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && !probe) {
      fileOpeners(file.ext, owner?.executables ?? [])
        .then(setProbe)
        .catch(() => setProbe({ owner_found: false, candidates: [] }));
    }
  }

  async function fail(p: Promise<unknown>, msg: string) {
    try {
      await p;
    } catch {
      notify(msg);
    }
  }

  function copyFilePath() {
    const done = () => notify("Path copied to clipboard.");
    try {
      const clip = navigator.clipboard;
      if (clip) clip.writeText(file.path).then(done).catch(() => notify("Couldn't copy the path."));
      else notify("Clipboard unavailable.");
    } catch {
      notify("Clipboard unavailable.");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn" title={`More actions for ${file.name}`} aria-label="More actions" onClick={toggle}>
        <DotsIcon size={16} />
      </button>
      {open && (
        <>
          <div className="menu-overlay" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="menu-pop" onClick={(e) => e.stopPropagation()}>
            <div className="menu-head" title={file.path}>{file.name}</div>
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                if (docsLive) void fail(openPath(file.path), "Couldn't open the file.");
                else notify("Sample file - run the Tauri app to open real files.");
              }}
            >
              Open
            </button>
            <div className="menu-sep">Open with</div>
            {owner && ownerDesktop && (
              probe === null ? (
                <div className="menu-item dim">Checking...</div>
              ) : probe.owner_found ? (
                <button
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    openApp(ownerDesktop.executables)
                      .then(() => markInstalled(ownerDesktop.id))
                      .catch(() => notify(`${ownerDesktop.alt} isn't installed yet.`));
                  }}
                >
                  Open with {ownerDesktop.alt}
                </button>
              ) : (
                <button
                  className="menu-item accent"
                  onClick={() => {
                    setOpen(false);
                    notify(`${ownerDesktop.alt} opens this format natively - grab it below.`);
                    void installApp(ownerDesktop);
                  }}
                >
                  Get {ownerDesktop.alt} (recommended)
                </button>
              )
            )}
            {owner && !ownerDesktop && (
              <button
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  void openOwnerWeb(owner);
                }}
              >
                Open in {owner.alt}
              </button>
            )}
            {probe?.candidates.map((c) => (
              <button
                key={c.path}
                className="menu-item"
                title={c.path}
                onClick={() => {
                  setOpen(false);
                  void fail(openWithExe(file.path, c.path), `Couldn't launch ${c.label}.`);
                }}
              >
                Open with {c.label}
              </button>
            ))}
            {isTauri() && (
              <button
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  void fail(openWithDialog(file.path), "Couldn't open the Windows dialog.");
                }}
              >
                Choose another app... (Windows)
              </button>
            )}
            <div className="menu-sep" />
            {isTauri() && (
              <button
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  revealInDir(file.path).catch(() => notify("Couldn't reveal the file."));
                }}
              >
                Show in folder
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                copyFilePath();
              }}
            >
              Copy path
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface ImageTileProps extends FileMenuProps {}

function ImageTile(props: ImageTileProps) {
  const { file, docsLive } = props;
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbOk, setThumbOk] = useState(true);
  const owner = appForExt(file.ext);
  useEffect(() => {
    let alive = true;
    if (docsLive) {
      thumbnailSrc(file.path)
        .then((t) => {
          if (alive) setThumb(t);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [file.path, docsLive]);
  return (
    <div
      className="img-tile"
      onClick={() => docsLive && openPath(file.path)}
      title={docsLive ? `Open ${file.name}` : file.name}
    >
      <div className="img-art">
        {thumb && thumbOk ? (
          <img src={thumb} alt="" loading="lazy" onError={() => setThumbOk(false)} />
        ) : owner ? (
          <AppIcon app={owner} size={40} />
        ) : (
          <DocIcon size={36} />
        )}
        <span className="img-menu" onClick={(e) => e.stopPropagation()}>
          <FileMenu {...props} />
        </span>
      </div>
      <div className="img-name">{file.name}</div>
      <div className="img-sub">
        .{file.ext} - {formatBytes(file.size)}
      </div>
    </div>
  );
}


export default function App() {
  const [route, setRoute] = useState<Route>("home");
  const [query, setQuery] = useState("");
  const [adobify, setAdobify] = useState<boolean>(() => load("anobe.adobify", false));
  const [category, setCategory] = useState<string>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Real files only in the Tauri app; mocks exist purely for browser preview.
  const [docs, setDocs] = useState<DocFile[]>(() => (isTauri() ? [] : MOCK_DOCS));
  const [docsLive, setDocsLive] = useState(false);
  const [imageDocs, setImageDocs] = useState<DocFile[]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imgFilter, setImgFilter] = useState("");
  const [sysinfo, setSysinfo] = useState<SystemInfo | null>(null);
  const [logDir, setLogDir] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>(() => load("anobe.installed", [] as string[]));
  const [pinnedFiles, setPinnedFiles] = useState<PinnedFile[]>(() => load("anobe.pinnedFiles", [] as PinnedFile[]));
  const [fileTab, setFileTab] = useState<"recent" | "pinned">("recent");
  const [showIntro, setShowIntro] = useState<boolean>(() => load("anobe.showIntro", true));
  const [digikam, setDigikam] = useState<DigikamStatus | null>(null);
  const [checkingDigi, setCheckingDigi] = useState(false);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [checkingDrive, setCheckingDrive] = useState(false);
  const [probed, setProbed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => localStorage.setItem("anobe.adobify", JSON.stringify(adobify)), [adobify]);
  useEffect(() => localStorage.setItem("anobe.installed", JSON.stringify(installed)), [installed]);
  useEffect(() => localStorage.setItem("anobe.pinnedFiles", JSON.stringify(pinnedFiles)), [pinnedFiles]);
  useEffect(() => localStorage.setItem("anobe.showIntro", JSON.stringify(showIntro)), [showIntro]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshDocs = async (extraRoots?: string[]) => {
    const live = await listDocuments(appLinkedExtensions(), extraRoots);
    if (!isTauri()) return; // browser preview keeps sample files
    setDocs(live);
    setDocsLive(true);
    void logDebug(`documents scan: ${live.length} files`);
  };

  const refreshImages = async () => {
    const live = await listDocuments(IMAGE_EXTS);
    if (!isTauri()) return;
    setImageDocs(live);
    setImagesLoaded(true);
    void logDebug(`images scan: ${live.length} files`);
  };

  /** anobe:// deep links + in-app goto events (ids are canonical, never adobified). */
  async function dispatchDeepLink(link: PendingLink) {
    void logDebug(`deeplink: ${link.action} ${link.id ?? ""}`);
    const { action, id } = link;
    if (action === "apps") return setRoute("apps");
    if (action === "documents") return setRoute("docs");
    if (action === "docs") {
      if (!id) return openDocsWindow().catch(() => setToast("Couldn't open Anobe Docs."));
      const target = APPS.find((a) => a.id === id);
      if (!target) return setToast(`Unknown app in link: ${id}`);
      return openDocs(target);
    }
    if (!id) return setToast("That link needs an app, e.g. anobe://open/blender.");
    const target = APPS.find((a) => a.id === id);
    if (!target) return setToast(`Unknown app in link: ${id}`);
    if (action === "open") return handleOpen(target);
    if (action === "install") return handleInstall(target);
    setToast(`Unknown link action: ${action}`);
  }

  useEffect(() => {
    refreshDocs();
    getSystemInfo().then(setSysinfo).catch(() => undefined);
    appLogDir().then(setLogDir).catch(() => undefined);
    takePendingLink().then((p) => {
      if (p) void dispatchDeepLink(p);
    });
    let unlistenDeep: (() => void) | undefined;
    listenDeepLink((p) => void dispatchDeepLink(p))
      .then((u) => (unlistenDeep = u))
      .catch(() => undefined);
    const onPreviewDocs = (e: Event) => {
      const d = (e as CustomEvent).detail as { appId?: string };
      if (d?.appId) setSelectedId(d.appId);
    };
    window.addEventListener("anobe:preview-docs", onPreviewDocs);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("anobe:preview-docs", onPreviewDocs);
      window.removeEventListener("keydown", onKey);
      unlistenDeep?.();
    };
  }, []);

  const refreshDigikam = async () => {
    setCheckingDigi(true);
    try {
      setDigikam(await digikamStatus());
    } finally {
      setCheckingDigi(false);
    }
  };

  const refreshDrive = async () => {
    setCheckingDrive(true);
    try {
      const st = await driveStatus();
      setDrive(st);
      if (st.folder) await refreshDocs([st.folder]);
    } finally {
      setCheckingDrive(false);
    }
  };

  useEffect(() => {
    if (route === "docs" && !probed) {
      setProbed(true);
      refreshDigikam();
      refreshDrive();
    }
    if (route === "images") {
      if (digikam === null && !checkingDigi) refreshDigikam();
      if (!imagesLoaded) refreshImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const displayApps = useMemo(() => getDisplayApps(adobify), [adobify]);
  const popular = useMemo(
    () => displayApps.filter((d) => d.mergedIds.some((id) => POPULAR_IDS.includes(id))),
    [displayApps]
  );
  const filtered = useMemo(
    () => displayApps.filter((a) => (category === "All" || a.category === category) && matchesDisplayQuery(a, query)),
    [displayApps, category, query]
  );
  const searchResults = useMemo(() => displayApps.filter((a) => matchesDisplayQuery(a, query)), [displayApps, query]);
  const selected = selectedId ? displayApps.find((a) => a.mergedIds.includes(selectedId)) ?? null : null;
  const selectedParts = useMemo(
    () => (selected ? selected.mergedIds.map((id) => APPS.find((a) => a.id === id)!).filter(Boolean) : []),
    [selected]
  );
  const bridgeApp = useMemo(() => APPS.find((a) => a.id === "bridge")!, []);

  const recentDocs = useMemo(() => {
    const f = docFilter.trim().toLowerCase();
    const list = f
      ? docs.filter((d) => d.name.toLowerCase().includes(f) || d.ext.includes(f))
      : docs;
    return list.slice(0, 40);
  }, [docs, docFilter]);

  const pinnedDocs = useMemo(
    () => pinnedFiles.filter((p) => docs.some((d) => d.path === p.path)),
    [pinnedFiles, docs]
  );

  // ---------------- actions ----------------

  async function handleOpen(app: AltApp) {
    if (app.installType !== "desktop" || app.executables.length === 0) {
      try {
        await openWebApp(app);
      } catch {
        setToast(`Couldn't open ${app.alt} — try ${app.website}`);
      }
      return;
    }
    if (!isTauri()) {
      setToast(`Browser preview — download ${app.alt} from ${app.installUrl}`);
      await openExternal(app.installUrl);
      return;
    }
    setBusy(app.id);
    try {
      const msg = await openApp(app.executables);
      if (!installed.includes(app.id)) setInstalled((p) => [...p, app.id]);
      setToast(msg);
    } catch {
      setToast(`${app.alt} isn't installed yet — hit Install to get it.`);
    } finally {
      setBusy(null);
    }
  }

  async function handleInstall(app: AltApp) {
    if (!isTauri()) {
      setToast(`Browser preview: get ${app.alt} at ${app.installUrl}`);
      await openExternal(app.installUrl);
      return;
    }
    try {
      await openInstaller(app);
    } catch {
      setToast(`Couldn't open the installer — try ${app.installUrl}`);
    }
  }

  async function handleShortcut(app: AltApp, location: ShortcutLocation) {
    const name = adobify ? app.adobe : app.alt;
    if (!isTauri()) {
      setToast("Browser preview — shortcuts need the Tauri app.");
      return;
    }
    setBusy(`${app.id}-shortcut`);
    try {
      const where = location === "desktop" ? "Desktop" : "Start Menu";
      await createShortcut(name, app.executables, location);
      setToast(`“${name}” added to ${where}.`);
    } catch (e) {
      const err = String(e);
      if (err.includes("not-found") || err.includes("not-tauri")) {
        setToast(`Install ${app.alt} first, then add the shortcut.`);
      } else {
        setToast(`Couldn't create the shortcut (${err}).`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function openDocs(app: AltApp, tab: "guide" | "docs" = "guide") {
    if (!isTauri()) {
      await openExternal(tab === "docs" ? app.docsUrl : app.website);
      return;
    }
    try {
      await openDocsWindow(app.id, tab);
    } catch (e) {
      void logWarn(`openDocsWindow failed: ${String(e)}`);
      setToast("Couldn't open Anobe Docs.");
    }
  }

  async function openDriveFolder() {
    if (!drive?.folder) return;
    if (!isTauri()) return;
    try {
      await openPath(drive.folder);
    } catch {
      setToast("Couldn't open the Drive folder.");
    }
  }

  async function openDriveWeb() {
    if (!isTauri()) {
      window.open("https://drive.google.com/", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await openChildWindow("webapp", { id: "googledrive", title: "Google Drive" }, "https://drive.google.com/");
    } catch {
      setToast("Couldn't open Google Drive.");
    }
  }

  async function openDriveInstaller() {
    const url = "https://www.google.com/drive/download/";
    if (!isTauri()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await openChildWindow("installer", { id: "googledrive", title: "Google Drive for Desktop" }, url);
    } catch {
      setToast("Couldn't open the installer — try https://www.google.com/drive/download/");
    }
  }

  function togglePin(d: DocFile) {
    setPinnedFiles((p) =>
      p.some((x) => x.path === d.path)
        ? p.filter((x) => x.path !== d.path)
        : [...p, { name: d.name, path: d.path }]
    );
  }

  const titleFor = (app: DisplayApp) => (adobify ? app.adobe : app.alt);
  const subFor = (app: DisplayApp) => (adobify ? app.alt : app.adobe);

  // ---------------- pieces ----------------

  function fileRow(d: DocFile) {
    const owner = appForExt(d.ext);
    const isPinned = pinnedFiles.some((x) => x.path === d.path);
    return (
      <div className="file-row" key={d.path} onClick={() => docsLive && openPath(d.path)} title={docsLive ? `Open ${d.name}` : d.name}>
        <div className="file-icon">
          {owner ? <BrandIcon app={owner} size={34} adobify={false} /> : <DocIcon size={30} />}
        </div>
        <div className="file-meta">
          <div className="file-name">{d.name}</div>
          <div className="file-sub">{formatWhen(d.modified)} · {formatBytes(d.size)}{!docsLive ? " · sample" : ""}</div>
        </div>
        <button
          className="btn pin-btn"
          title={isPinned ? "Remove from pinned" : "Pin to the top of Home"}
          onClick={(e) => { e.stopPropagation(); togglePin(d); }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <PinIcon size={14} />{isPinned ? "Pinned" : "Add to pinned"}
          </span>
        </button>
<FileMenu
          file={d}
          docsLive={docsLive}
          notify={(m) => setToast(m)}
          markInstalled={(id) => setInstalled((p) => (p.includes(id) ? p : [...p, id]))}
          installApp={handleInstall}
          openOwnerWeb={handleOpen}
        />
      </div>
    );
  }

  function renderSysWarnings() {
    if (!sysinfo || sysinfo.ramGB === null) return null;
    const ram = sysinfo.ramGB;
    const mins = APPS.filter((a) => a.installType === "desktop" && sysReqFor(a).minRam > ram);
    const recs = APPS.filter(
      (a) => a.installType === "desktop" && sysReqFor(a).minRam <= ram && sysReqFor(a).recRam > ram
    );
    if (mins.length === 0 && recs.length === 0)
      return <p>Good news: this PC meets the recommended specs of every listed desktop app.</p>;
    return (
      <>
        {mins.map((a) => (
          <div className="warn-row warn-min" key={a.id}>
            <span><strong>{a.alt}</strong> needs at least {sysReqFor(a).minRam} GB RAM (you have ~{ram} GB) - expect trouble.</span>
            <button className="link-btn" onClick={() => setSelectedId(a.id)}>Details</button>
          </div>
        ))}
        {recs.slice(0, 8).map((a) => (
          <div className="warn-row warn-rec" key={a.id}>
            <span><strong>{a.alt}</strong> recommends {sysReqFor(a).recRam} GB RAM (you have ~{ram} GB).</span>
          </div>
        ))}
        {recs.length > 8 && <p>...and {recs.length - 8} more below recommended spec.</p>}
      </>
    );
  }

  function renderFileList(list: DocFile[], emptyText: string) {
    if (list.length === 0) return <div className="empty">{emptyText}</div>;
    return <div className="file-list">{list.map(fileRow)}</div>;
  }

  function renderImageGrid() {
    if (!isTauri()) return <div className="empty">Image browsing runs inside the Tauri app.</div>;
    if (!imagesLoaded) return <div className="empty">Scanning image folders...</div>;
    const f = imgFilter.trim().toLowerCase();
    const list = (f ? imageDocs.filter((d) => d.name.toLowerCase().includes(f)) : imageDocs).slice(0, 120);
    if (list.length === 0)
      return <div className="empty">No images found yet. Photos, scans and artwork will appear here.</div>;
    const mp = {
      docsLive,
      notify: (m: string) => setToast(m),
      markInstalled: (id: string) => setInstalled((p) => (p.includes(id) ? p : [...p, id])),
      installApp: handleInstall,
      openOwnerWeb: handleOpen,
    };
    return (
      <div className="img-grid">
        {list.map((d) => (
          <ImageTile key={d.path} file={d} {...mp} />
        ))}
      </div>
    );
  }

  function appCard(app: DisplayApp) {
    const isBusy = busy === app.id;
    const parts = app.mergedIds.map((id) => APPS.find((a) => a.id === id)!).filter(Boolean);
    const primary = parts[0];
    const isDesktop = primary.installType === "desktop" && primary.executables.length > 0;
    const anyInstalled = parts.some((p) => installed.includes(p.id));
    return (
      <div className="card" key={app.mergedIds.join("+")}>
        <div className="card-top">
          <BrandIcon app={primary} size={42} adobify={adobify} />
          <div style={{ minWidth: 0 }}>
            <div className="card-title">{titleFor(app)}</div>
            <div className="card-sub">{subFor(app)} · {app.category}</div>
          </div>
        </div>
        <p className="card-desc">{app.description}</p>
        <div className="badges">
          <span className="badge">
            {primary.installType === "desktop" ? "Desktop app" : primary.installType === "mobile" ? "Mobile app" : primary.installType === "web" ? "Web app" : "Service"}
          </span>
          {anyInstalled && <span className="badge">Installed</span>}
        </div>
        <div className="card-actions">
          {isDesktop ? (
            <>
              <button className="btn primary" disabled={isBusy} onClick={() => handleInstall(primary)} title={`Install via the Anobe App Installer`}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <DownloadIcon size={14} />{isBusy ? "Working…" : anyInstalled ? "Reinstall" : "Install"}
                </span>
              </button>
              <button className="btn" disabled={isBusy} onClick={() => handleOpen(primary)}>Open</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => handleOpen(primary)}>Open in Anobe</button>
          )}
          <button className="btn" onClick={() => setSelectedId(primary.id)}>Details</button>
          <button className="btn" onClick={() => openDocs(primary)}>Docs</button>
        </div>
      </div>
    );
  }

  // ---------------- render ----------------

  return (
    <div className="shell">
      {/* Sidebar with full names */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">Anobe</div>
            <div className="brand-sub">Say no to Adobe</div>
          </div>
        </div>

        <nav aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item${route === n.id ? " active" : ""}`}
              title={n.id === "docslink" ? "Open Anobe Docs in its own window" : n.label}
              onClick={() => {
                if (n.id === "docslink") openDocsWindow().catch(() => setToast("Couldn't open Anobe Docs."));
                else setRoute(n.id as Route);
              }}
            >
              <span className="nav-icon"><n.Icon size={19} /></span>
              <span>{n.label}</span>
            </button>
          ))}
          <button
            className={`nav-item${route === "settings" ? " active" : ""}`}
            title="Settings"
            onClick={() => setRoute("settings")}
          >
            <span className="nav-icon"><GearIcon size={19} /></span>
            <span>Settings</span>
          </button>
        </nav>

        <div className="side-label">Most popular</div>
        <div className="pinned">
          {popular.map((app) => (
            <button
              key={app.mergedIds.join("+")}
              className="pinned-app"
              onClick={() => setSelectedId(app.mergedIds[0])}
              title={`${titleFor(app)} — replaces ${app.adobe}`}
            >
              <BrandIcon app={app} size={30} adobify={adobify} />
              <div className="meta">
                <div className="t">{titleFor(app)}</div>
                <div className="s">{subFor(app)}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="side-footer">
          <button className="all-apps-btn" onClick={() => setRoute("apps")} title="Browse every replacement">
            All apps · {displayApps.length}
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-brand">Anobe</div>
          <div className="search">
            <span style={{ color: "var(--text-3)", display: "flex" }}><SearchIcon size={15} /></span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for apps, files and more  ( / )"
              aria-label="Search for apps, files and more"
            />
            {query && <button className="link-btn" onClick={() => setQuery("")}>Clear</button>}
          </div>
          <label className="adobify-pill" title="Adobify: show Adobe names + Adobe-style tiles instead of replacement names + real icons">
            <button role="switch" aria-checked={adobify} className={`switch${adobify ? " on" : ""}`} onClick={() => setAdobify((v) => !v)} aria-label="Toggle Adobify mode" />
            Adobify
          </label>
        </div>

        <div className="content">
          {route === "home" && (
            <>
              <div className="hero">
                <div>
                  <h1>Welcome to Anobe</h1>
                  <p>
                    Every Adobe replacement in one hub — install them, open them, and learn the
                    switch. <span className="hero-pill">{installed.length} of {APPS.length} installed</span>
                  </p>
                </div>
                <button className="hero-btn" onClick={() => setRoute("apps")}>Install apps</button>
              </div>

              {query.trim() ? (
                <>
                  <div className="section-head">
                    <h2>Results for “{query.trim()}”</h2>
                    <button className="link-btn" onClick={() => setQuery("")}>Clear search</button>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="empty">No apps match. Try an Adobe name (“Photoshop”) or a replacement (“Krita”).</div>
                  ) : (
                    <div className="grid">{searchResults.map(appCard)}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="section-head"><h2>Create New</h2></div>
                  <div className="create-row">
                    {CREATE_NEW.map((c) => {
                      const app = APPS.find((a) => a.id === c.appId)!;
                      return (
                        <button className="create-card" key={c.appId} onClick={() => handleOpen(app)} title={`${c.action} with ${app.alt}`}>
                          <span className="create-art"><AppIcon app={app} size={52} /></span>
                          <span className="create-foot">
                            <AppIcon app={app} size={22} />
                            <span>
                              <span className="create-title">{c.label}</span>
                              <span className="create-sub">{c.action} · {app.alt}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {showIntro && (
                    <div className="intro-strip">
                      <div>
                        <strong>Start using Anobe</strong>
                        <p>Your all-day creative suite without the subscription. Install a replacement, open your old files, and follow the switch guide when you get stuck. Press <kbd>/</kbd> to search any time.</p>
                      </div>
                      <button className="icon-btn" onClick={() => setShowIntro(false)} aria-label="Dismiss" title="Dismiss"><ChevronIcon size={16} /></button>
                    </div>
                  )}

                  <div className="file-tabs">
                    <div className="tabs">
                      <button className={fileTab === "recent" ? "active" : ""} onClick={() => setFileTab("recent")}>Recent</button>
                      <button className={fileTab === "pinned" ? "active" : ""} onClick={() => setFileTab("pinned")}>Pinned{pinnedDocs.length > 0 ? ` (${pinnedDocs.length})` : ""}</button>
                    </div>
                    <button className="btn primary" onClick={() => setRoute("docs")}>See more</button>
                  </div>
                  {fileTab === "recent"
                    ? renderFileList(docs.slice(0, 6), "No recent project files yet. Files linked to your apps will appear here.")
                    : renderFileList(
                        pinnedDocs.map((p) => docs.find((x) => x.path === p.path)!),
                        "Nothing pinned yet — use “Add to pinned” on any file."
                      )}
                </>
              )}
            </>
          )}

          {route === "apps" && (
            <>
              <h1 className="page-title">Apps</h1>
              <p className="page-sub">
                {query
                  ? `${filtered.length} result${filtered.length === 1 ? "" : "s"} for “${query}” — matches Adobe and replacement names.`
                  : "Desktop apps install through the Anobe App Installer (the official download page, never anything silent). Web apps open inside their own Anobe window."}
              </p>
              <div className="chips">
                {["All", ...CATEGORIES].map((c) => (
                  <button key={c} className={`chip${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
              {filtered.length === 0 ? (
                <div className="empty">No apps match “{query}”.</div>
              ) : (
                <div className="grid">{filtered.map(appCard)}</div>
              )}
            </>
          )}

          {route === "docs" && (
            <>
              <div>
                <h1 className="page-title">Documents</h1>
                <p className="page-sub">Your project files in one place — only files linked to your Anobe apps, never random clutter.</p>
              </div>

              <div className="cloud-row">
                <span style={{ display: "flex", color: "var(--text-2)" }}><CloudIcon size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>Google Drive for Desktop</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {drive === null || checkingDrive
                      ? "Checking for the Drive app…"
                      : drive.folder
                        ? `Connected — cloud project files included from ${drive.folder}`
                        : drive.installed
                          ? "Installed but not signed in — sign in to sync your cloud files."
                          : "The Adobe-cloud stand-in. Install it to see cloud project files here."}
                  </div>
                </div>
                {drive?.folder ? (
                  <>
                    <button className="btn" onClick={openDriveFolder} title="Open the local Drive folder">Open Drive folder</button>
                    <button className="link-btn" onClick={openDriveWeb}>web version</button>
                  </>
                ) : drive?.installed ? (
                  <>
                    <button className="btn" onClick={openDriveWeb} title="Open Google Drive on the web">Open Drive</button>
                    <button className="link-btn" onClick={refreshDrive} title="Check again for the Drive folder">check again</button>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={openDriveInstaller} title="Install Drive for Desktop via the Anobe App Installer">Get Drive for Desktop</button>
                    <button className="link-btn" onClick={openDriveWeb}>web version</button>
                    <button className="link-btn" onClick={refreshDrive} title="I installed it — check again">check again</button>
                  </>
                )}
              </div>

              {digikam?.installed ? (
                <div className="doc-banner">
                  <strong>Managed with digiKam</strong> — tags, ratings and XMP sidecars carry over from Bridge.{" "}
                  <button className="link-btn" onClick={() => openDigikam().catch(() => setToast("Couldn't launch digiKam."))}>
                    Open in digiKam
                  </button>
                </div>
              ) : (
                <div className="digi-strip">
                  <BrandIcon app={bridgeApp} size={26} adobify={false} />
                  <span style={{ flex: 1 }}>
                    Tip: <strong>digiKam</strong> (the Bridge replacement) adds tagging, ratings and photo management on top of these files.
                    {digikam === null && checkingDigi ? " (checking)" : ""}
                  </span>
                  <button className="btn" onClick={() => handleInstall(bridgeApp)}>Install digiKam</button>
                  {!digikam?.installed && digikam !== null && (
                    <button className="link-btn" onClick={refreshDigikam} title="I installed it — check again">check again</button>
                  )}
                </div>
              )}

              <div className="search" style={{ margin: "0 0 14px", maxWidth: "100%" }}>
                <span style={{ color: "var(--text-3)", display: "flex" }}><SearchIcon size={15} /></span>
                <input value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="Filter documents by name or extension…" aria-label="Filter documents" />
              </div>
              {renderFileList(recentDocs, "No linked documents found yet. Project files (.afphoto, .kra, .blend, .pdf…) will appear here.")}
              {!docsLive && (
                <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 10 }}>Sample files shown — the real scan runs inside the Tauri app.</p>
              )}
            </>
          )}

          {route === "images" && (
            <>
              <div>
                <h1 className="page-title">Images</h1>
                <p className="page-sub">Your photos, scans and artwork. digiKam lives here; documents stay on the Documents tab.</p>
              </div>

              {digikam?.installed ? (
                <div className="doc-banner">
                  <strong>Managed with digiKam</strong> - tags, ratings and albums live there.{" "}
                  <button className="link-btn" onClick={() => openDigikam().catch(() => setToast("Couldn't launch digiKam."))}>
                    Open in digiKam
                  </button>
                  <button className="link-btn" onClick={() => { setImagesLoaded(false); refreshImages(); }} title="Rescan image folders">
                    Rescan
                  </button>
                </div>
              ) : (
                <div className="digi-strip">
                  <AppIcon app={bridgeApp} size={26} />
                  <span style={{ flex: 1 }}>
                    <strong>digiKam</strong> turns this tab into a real photo manager (tags, albums, RAW queue).
                    {digikam === null && checkingDigi ? " (checking)" : ""}
                  </span>
                  <button className="btn" onClick={() => handleInstall(bridgeApp)}>Install digiKam</button>
                  {!digikam?.installed && digikam !== null && (
                    <button className="link-btn" onClick={refreshDigikam} title="I installed it - check again">check again</button>
                  )}
                </div>
              )}

              <div className="search" style={{ margin: "0 0 14px", maxWidth: "100%" }}>
                <span style={{ color: "var(--text-3)", display: "flex" }}><SearchIcon size={15} /></span>
                <input value={imgFilter} onChange={(e) => setImgFilter(e.target.value)} placeholder="Filter images by name" aria-label="Filter images" />
              </div>
              {renderImageGrid()}
            </>
          )}

          {route === "settings" && (
            <>
              <h1 className="page-title">Settings</h1>
              <p className="page-sub">Make Anobe behave the way you think.</p>

              <div className="settings-card">
                <h3>Adobify</h3>
                <p>Show everything with its Adobe name (and Adobe-style tiles) with the replacement name as subtitle — instead of real icons and names. Search works both ways either way.</p>
                <label className="adobify-pill" style={{ justifyContent: "flex-start", minWidth: 0 }}>
                  <button role="switch" aria-checked={adobify} className={`switch${adobify ? " on" : ""}`} onClick={() => setAdobify((v) => !v)} aria-label="Toggle Adobify mode" />
                  {adobify ? "Adobify is ON — showing Adobe names" : "Adobify is OFF — showing real names"}
                </label>
                <div className="preview-box" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <BrandIcon app={APPS[0]} size={30} adobify={adobify} />
                  <div>
                    <div style={{ fontWeight: 650 }}>{adobify ? APPS[0].adobe : APPS[0].alt}</div>
                    <div style={{ fontSize: 12, color: "var(--text-2)" }}>{adobify ? APPS[0].alt : APPS[0].adobe}</div>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <h3>Installing apps</h3>
                <p>
                  Anobe never installs anything silently. <strong>Install</strong> opens the{" "}
                  <strong>Anobe App Installer</strong> window with the app's official download page,
                  so you always see exactly what's going on.{" "}
                  {isTauri() ? "Tauri backend detected." : "Browser preview — installs open download pages in a tab."}
                </p>
              </div>

              <div className="settings-card">
                <h3>System check</h3>
                {sysinfo === null ? (
                  <p>Detecting your hardware...</p>
                ) : (
                  <>
                    <div className="kv"><span>OS:</span><span>{sysinfo.osLabel}</span></div>
                    <div className="kv"><span>CPU:</span><span>{sysinfo.cores === null ? "unknown core count" : `${sysinfo.cores} logical cores`}</span></div>
                    <div className="kv"><span>Memory:</span><span>{sysinfo.ramGB === null ? "size not detectable here" : `~${sysinfo.ramGB} GB`}</span></div>
                    {sysinfo.ramGB === null || sysinfo.cores === null ? (
                      <p>Exact specs are not readable from this view, so per-app warnings may be missing. The Tauri app reads them directly.</p>
                    ) : (
                      renderSysWarnings()
                    )}
                  </>
                )}
                <div className="kv"><span>Logs:</span><span>{logDir ?? "log folder unavailable in browser preview"}</span></div>
                {logDir && isTauri() && (
                  <button className="btn" onClick={() => openPath(logDir).catch(() => setToast("Couldn't open the log folder."))}>
                    Open log folder
                  </button>
                )}
              </div>

              <div className="settings-card">
                <h3>About</h3>
                <p>Anobe v0.4.0 · Tauri hub + Anobe Docs + Anobe App Installer · {APPS.length} Adobe apps covered. Say no to Adobe.</p>
                <div className="card-actions">
                  <button className="btn" onClick={() => { setInstalled([]); setToast("Installed flags cleared."); }}>Reset installed flags</button>
                  <button className="btn" onClick={() => openDocsWindow().catch(() => setToast("Couldn't open Anobe Docs."))}>Open Anobe Docs</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail drawer (merged view in Adobify mode) */}
      {selected && (
        <div className="overlay" onClick={() => setSelectedId(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <BrandIcon app={selectedParts[0]} size={48} adobify={adobify} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0 }}>{adobify ? selected.adobe : selected.alt}</h2>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>{adobify ? selected.alt : selected.adobe} · {selected.category}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Close" title="Close"><CloseIcon size={16} /></button>
            </div>
            <p style={{ color: "var(--text-2)" }}>{selected.description}</p>

            {selectedParts.map((part) => {
              const isDesktop = part.installType === "desktop" && part.executables.length > 0;
              const partBusy = busy === part.id || busy === `${part.id}-shortcut`;
              return (
                <div key={part.id} style={{ marginBottom: selectedParts.length > 1 ? 14 : 0 }}>
                  {selectedParts.length > 1 && <h4 style={{ margin: "10px 0 6px" }}>{part.alt}</h4>}
                  <div className="card-actions">
                    {isDesktop ? (
                      <>
                        <button className="btn primary" disabled={!!partBusy} onClick={() => handleInstall(part)} title="Open the Anobe App Installer">Install</button>
                        <button className="btn" disabled={!!partBusy} onClick={() => handleOpen(part)}>Open</button>
                      </>
                    ) : (
                      <button className="btn primary" onClick={() => handleOpen(part)}>Open in Anobe</button>
                    )}
                    <button className="btn" onClick={() => openDocs(part)}>Docs</button>
                    <button className="btn" onClick={() => openExternal(part.website)}>Website</button>
                  </div>
                  {isDesktop && (
                    <div className="card-actions" style={{ marginTop: 8 }}>
                      <button className="btn" disabled={!!partBusy} onClick={() => handleShortcut(part, "desktop")} title={`Pin “${adobify ? part.adobe : part.alt}” to the Desktop`}>
                        Desktop shortcut
                      </button>
                      <button className="btn" disabled={!!partBusy} onClick={() => handleShortcut(part, "startmenu")} title={`Pin “${adobify ? part.adobe : part.alt}” to the Start Menu`}>
                        Start Menu shortcut
                      </button>
                    </div>
                  )}
                  {sysinfo?.ramGB != null &&
                    part.installType === "desktop" &&
                    (() => {
                      const req = sysReqFor(part);
                      const ram = sysinfo.ramGB as number;
                      if (ram < req.minRam)
                        return (
                          <div className="warn-row warn-min" style={{ marginTop: 8 }}>
                            This PC (~{ram} GB RAM) is below the {req.minRam} GB minimum - expect trouble.
                          </div>
                        );
                      if (ram < req.recRam)
                        return (
                          <div className="warn-row warn-rec" style={{ marginTop: 8 }}>
                            Below the recommended {req.recRam} GB RAM (you have ~{ram} GB).
                          </div>
                        );
                      return null;
                    })()}
                </div>
              );
            })}

            <h3 style={{ marginTop: 20 }}>How to switch</h3>
            <ol>{selected.switchSteps.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ol>
            <button className="link-btn" onClick={() => openDocs(selectedParts[0])}>Full guide in Anobe Docs</button>
            <div className="kv"><span>Handles:</span><span>{selected.handles.join("  ") || "—"}</span></div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
