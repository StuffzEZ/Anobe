import { useEffect, useMemo, useState } from "react";
import { APPS, initials, matchesQuery, type AltApp } from "../data/apps";
import { SearchIcon } from "../components/icons";
import {
  isTauri,
  listenDocEvent,
  openDocsSite,
  openExternal,
  openInstaller,
  takePendingDoc,
  type DocsTab,
} from "../lib/tauri";

function DocIcon({ app, size = 34, adobify = false }: { app: AltApp; size?: number; adobify?: boolean }) {
  const [err, setErr] = useState(false);
  const src = adobify && (app as any).adobeIcon ? (app as any).adobeIcon : app.icon;
  if (!err) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        onError={() => setErr(true)}
        style={{ borderRadius: size * 0.22, display: "block" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: app.altColor,
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initials(app.alt)}
    </div>
  );
}

export default function DocsApp() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(APPS[0].id);
  const [tab, setTab] = useState<DocsTab>("guide");
  const [toast, setToast] = useState<string | null>(null);
  const [adobify] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("anobe.adobify") ?? "false");
    } catch {
      return false;
    }
  });

  useEffect(() => {
    takePendingDoc().then((p) => {
      if (p && APPS.some((a) => a.id === p.app_id)) {
        setSelectedId(p.app_id);
        setTab(p.tab === "docs" ? "docs" : "guide");
      }
    });
    let unlisten: (() => void) | undefined;
    listenDocEvent((p) => {
      if (APPS.some((a) => a.id === p.app_id)) {
        setSelectedId(p.app_id);
        setTab(p.tab === "docs" ? "docs" : "guide");
      }
    }).then((u) => (unlisten = u)).catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  async function safe(p: Promise<void>, fallback: string) {
    try {
      await p;
    } catch {
      setToast(fallback);
    }
  }

  const filtered = useMemo(() => APPS.filter((a) => matchesQuery(a, query)), [query]);
  const selected = APPS.find((a) => a.id === selectedId) ?? APPS[0];
  const isDesktop = selected.installType === "desktop" && selected.executables.length > 0;

  return (
    <div className="docs-shell">
      <div className="docs-topbar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">Anobe Docs</div>
            <div className="brand-sub">{isTauri() ? "Guides & documentation" : "Browser preview"}</div>
          </div>
        </div>
        <div className="search" style={{ maxWidth: 480 }}>
          <span style={{ color: "var(--text-3)", display: "flex" }}><SearchIcon size={15} /></span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides — “Photoshop”, “Krita”…"
            aria-label="Search guides"
          />
          {query && <button className="link-btn" onClick={() => setQuery("")}>Clear</button>}
        </div>
        <div style={{ width: 120 }} />
      </div>

      <div className="docs-body">
        <aside className="docs-list">
          {filtered.map((a) => (
            <button
              key={a.id}
              className={`docs-item${a.id === selected.id ? " active" : ""}`}
              onClick={() => setSelectedId(a.id)}
            >
              <DocIcon app={a} size={30} adobify={adobify} />
              <div className="meta">
                <div className="t">{adobify ? a.adobe : a.alt}</div>
                <div className="s">{adobify ? a.alt : a.adobe}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">No guides match “{query}”.</div>}
        </aside>

        <main className="docs-page">
          <div className="docs-page-head">
            <DocIcon app={selected} size={52} adobify={adobify} />
            <div style={{ flex: 1 }}>
              <h1>
                {adobify ? selected.adobe : selected.alt}
                <span style={{ color: "var(--text-2)", fontWeight: 400, fontSize: 15 }}>
                  {" "}→ {adobify ? selected.alt : selected.adobe}
                </span>
              </h1>
              <p>{selected.description}</p>
            </div>
            {isDesktop ? (
              <button className="btn primary" onClick={() => safe(openInstaller(selected), `Couldn't open the installer for ${selected.alt}.`)}>
                Install {selected.alt}
              </button>
            ) : (
              <button className="btn primary" onClick={() => safe(openExternal(selected.website), `Couldn't open ${selected.alt}.`)}>
                Open {selected.alt}
              </button>
            )}
          </div>

          <div className="docs-tabs">
            <button className={tab === "guide" ? "active" : ""} onClick={() => setTab("guide")}>
              Switch guide
            </button>
            <button className={tab === "docs" ? "active" : ""} onClick={() => setTab("docs")}>
              Official docs
            </button>
          </div>

          {tab === "guide" ? (
            <>
              <h3 style={{margin:"0 0 8px", fontSize:14}}>You need to know — offline essentials</h3>
              <ol className="docs-steps">
                {selected.switchSteps.map((s, i) => (
                  <li key={i}>
                    <span className="step-n">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {(selected as any).extended?.length > 0 && (
                <>
                  <h4 style={{margin:"16px 0 8px", fontSize:13, color:"var(--text-2)"}}>Deeper essentials (summarised from official docs)</h4>
                  <ol className="docs-steps">
                    {(selected as any).extended.map((s: string, i: number) => (
                      <li key={`e-${i}`}><span className="step-n" style={{background:"#0f6cbd"}}>{i+1}</span><span>{s}</span></li>
                    ))}
                  </ol>
                </>
              )}
              <p style={{fontSize:12, color:"var(--text-3)", marginTop:12}}>Full detail lives in Official docs tab — this guide is the 20% you need 80% of the time.</p>
            </>
          ) : (
            <div className="docs-official">
              <p>
                The full reference for <strong>{selected.alt}</strong> lives on its official docs
                site. Open it inside Anobe as its own <strong>Anobe Docs</strong> webview, so you
                never lose your place.
              </p>
              <div className="card-actions">
                <button className="btn primary" onClick={() => safe(openDocsSite(selected), "Couldn't open the official docs. Check your connection and retry.")}>
                  Open official docs in Anobe
                </button>
                <button className="btn" onClick={() => safe(openExternal(selected.docsUrl), "Couldn't open the docs site.")}>
                  Open in browser instead
                </button>
              </div>
              <div className="kv">
                <span>Docs URL:</span>
                <span style={{ wordBreak: "break-all" }}>{selected.docsUrl}</span>
              </div>
            </div>
          )}

          <div className="docs-details">
            <div className="kv"><span>Replaces:</span><span>{selected.adobe} ({selected.adobeCode})</span></div>
            <div className="kv"><span>Category:</span><span>{selected.category}</span></div>
            <div className="kv">
              <span>Type:</span>
              <span>{selected.installType === "desktop" ? "Desktop app" : selected.installType === "mobile" ? "Mobile app" : selected.installType === "web" ? "Web app" : "Service"}</span>
            </div>
            {selected.handles.length > 0 && (
              <div className="badges" style={{ marginTop: 8 }}>
                {selected.handles.map((h) => <span className="badge" key={h}>{h}</span>)}
              </div>
            )}
          </div>
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
