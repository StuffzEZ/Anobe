# Anobe — Say no to Adobe

> **The free, open hub to install, manage and master every Adobe replacement.** Search by Adobe name or replacement name, install without silent magic, keep your files, and learn the switch — all from one Tauri desktop app.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg) ![Platform: Win | macOS | Linux](https://img.shields.io/badge/platform-Win%20%E2%80%A2%20macOS%20%E2%80%A2%20Linux-lightgrey) ![Anobe v0.6.1 Beta 1](https://img.shields.io/badge/version-v0.6.1%20Beta%201-orange)

**Quick links:** [Releases](https://github.com/StuffzEZ/Anobe/releases) • [License](LICENSE) • [Create an issue](https://github.com/StuffzEZ/Anobe/issues/new/choose) • [View license](https://github.com/StuffzEZ/Anobe/blob/main/LICENSE) • Deep links: `anobe://open/blender`, `anobe://install/blender`, `anobe://docs/blender`, `anobe://apps`, `anobe://documents`

---

## Why Anobe?

Adobe Creative Cloud locks you in. Anobe maps **every Adobe app → the best *truly free* replacement** (no big-catch `free*` like WordPress plugin paywalls) and gives you a native hub to **install, open, organize and learn** — with real icons, Adobify toggle, and offline guides.

| Adobe App | Best Free Replacement | Why this pick |
|---|---|---|
| Photoshop / Elements | **Affinity Photo** (now free via Canva, affinity.studio) | PSD layers, non-destructive, no subscription |
| Illustrator | **Affinity Designer** | True vector + pixel personas |
| InDesign | **Affinity Publisher** | IDML import, Publisher-grade layout |
| Lightroom | **darktable** | RAW, Lighttable/Darkroom, styles |
| Premiere Pro | **DaVinci Resolve** (free tier) | Pro timeline + color, generous free |
| Rush / Elements | **Kdenlive** | Social presets, lightweight |
| After Effects / Animate | **Cavalry** | Procedural motion, free tier |
| Character Animator | **OpenToonz** | Puppet rig, real production use |
| Audition | **Audacity** + **Ardour** (split) | Waveform + multitrack/MIDI |
| Fresco | **Krita** | Tablet-first painting |
| Bridge | **digiKam** | Tags/ratings/XMP |
| Media Encoder | **HandBrake** | Batch transcode |
| Dimension / Stager / Modeler | **Blender** | Cycles/Eevee, sculpt |
| XD | **Figma** (desktop) / **Penpot** (self-host) | Figma free tier small catch |
| InCopy | **LibreOffice Writer** | Track Changes round-trip |
| Substance Painter | **ArmorPaint** | PBR painting |
| Substance Designer | **Blender Shader Editor** | Node materials |
| Substance Sampler | **Materialize** | Photo → PBR |
| Acrobat | **PDF24** | Merge/split/OCR |
| Scan | **Microsoft Lens** | Phone → OCR PDF |
| Fill & Sign | **DocHub** (web) | Browser sign |
| Stock / Fonts | **Pexels** / **Google Fonts** | Truly free |
| Frame.io | **Frame.io (free tier)** | Timestamp review |
| Behance / Portfolio | **ArtStation** / **Hugo** | Free portfolio |
| Experience Cloud (AEM) | **Strapi** (headless, MIT) | API-first, self-host, no paywall |
| Connect | **Jitsi Meet** | No account |
| ColdFusion | **Lucee** (CFML) | Drop-in CFML |
| RoboHelp / Captivate | **Sphinx** / **H5P** | Docs / eLearning |

*Icon handling:* normal mode shows **replacement’s real brand mark**; **Adobify** (top bar + Settings) swaps to the **actual Adobe CC logo** (`public/icons/adobe/*.svg`) with the replacement as subtitle.

---

## Install & Run

```powershell
npm install
npm run tauri dev      # desktop (splash → hub)
npm run tauri build    # → src-tauri/target/release/bundle (msi/nsis, deb/appimage, dmg)
npm run dev            # browser preview (no Tauri)
```

**First launch:** splash with marquee → hub. Top bar: centered search (`/` or `Ctrl+K` anywhere), Adobify switch. Sidebar: Home / Apps / Documents / Images / Docs (separate window) / Settings.

---

## Features — What’s Inside

**Hub (Office-like):**
- Slim icon rail → **Most popular** (real icons + full names) + **All apps** button
- `Create New` hero (Photo/Vector/Video/Paint/3D/Writer) + Recent/Pinned with pin, Open-with menu, Show in folder, Copy path
- Deep links (no Adobify): `anobe://open/<id>`, `anobe://install/<id>`, `anobe://docs[/<id>]`, `anobe://apps`, `anobe://documents` + `anobe://docs/blender` — single-instance forwards second launches to the first window.

**App Installer (separate window):**
- `Anobe App Installer — {App}` with **Intel/AMD vs ARM + OS** banner (`public/installer.html:9` seeded from `std::env::consts::OS/ARCH` + `plugin-os` version fix for Win11 10.0.22000+ → 11)
- Save-as defaults to `Downloads/[Original]_Anobe.ext`
- Webview `on_download` → native **Save as** dialog, then auto-flips to **Installed** screen (icon + Adobe name below + *Open installer* + *Scan with VirusTotal* + *Information*). VirusTotal opens `virustotal.com/gui/home/upload` with last download path remembered (`LastDownload` state).

**Documents vs Images:**
- **Documents** = only app-linked project files (`handles` minus generic jpg/png/mp4…) from `Documents/Pictures/Videos/Desktop` + `G:\My Drive` when Drive for Desktop is mounted (`drive_status`). No mocks in Tauri — empty state if none.
- **Images** = digiKam’s home (JPEG/RAW/KRA/PSD/AFPHOTO/HEIC…) with 128px thumbnails via `asset://` + fallback, filter, rescan, “Open in digiKam” when installed.

**Anobe Docs (separate window):**
- **Guide tab** = *what you need to run the app* — install, import PSD/AI/IDML, round-trip, export — per-app offline, concise.
- **Official docs tab** = *everything else* — opens `https://…` in its own `Anobe Docs - {App}` webview (never hidden behind the hub).

**System Check (Settings):**
- `os-info` + `navigator.deviceMemory/hardwareConcurrency` → OS label (Win11 fix), cores, RAM + per-app **min/recommended** warnings (`Photo/Video/3D: 8/16GB, 4 cores` etc., Premiere/After Effects/Blender heavy overrides). Drawer also warns.

**Updater:**
- `tauri-plugin-updater` with `bundle.createUpdaterArtifacts` + `plugins.updater.pubkey` (`anobe.key.pub` minisign key) + `endpoints: ["https://github.com/StuffzEZ/Anobe/releases/latest/download/latest.json"]`. Settings → Check for updates. CI signs with `TAURI_SIGNING_PRIVATE_KEY` secret.

---

## Cross-Platform

- **Windows / macOS / Linux** — Tauri + `cfg!(target_os)` shims (`where` vs `which`, `xdg-open` vs `open`, `ProgramFiles` probing, `*.app` etc.). Tested `cargo check` on `stable-x86_64-pc-windows-msvc`; Linux/mac need `libwebkit2gtk`/`appindicator` at build.
- **Per-app OS badge + install guard:** each `AltApp.os: OsKey[]` (empty = web). `handleInstall` in `src/App.tsx:610` checks `platform()` and shows `dialog.confirm` if you’re on an unsupported OS before opening the installer.

---

## GitHub & Releases

- **Releases:** `git tag v0.6.1-beta.1 && git push origin v0.6.1-beta.1` or **Publish a release** in GitHub UI → `.github/workflows/release.yml:1` builds 4 targets (Win x64, Linux x64, macOS aarch64 + x64) via `tauri-action`, signs with `TAURI_SIGNING_PRIVATE_KEY`, and attaches `msi`/`nsis`, `deb`/`appimage`, `dmg` + `latest.json` to the release.
- **Updater key:** `C:/Temp/opencode/anobe.key` (private, keep secret) / `anobe.key.pub` (public, in `tauri.conf.json:45`). Add the private key as repo secret `TAURI_SIGNING_PRIVATE_KEY` (and password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if set to `anobe`).
- **Issues:** [Choose](https://github.com/StuffzEZ/Anobe/issues/new/choose) → Bug report / Feature request; `CONFIG: view license / view README`.
- **License:** MIT — see [LICENSE](LICENSE).

---

## Docs Philosophy

- **Anobe Docs → Guide** = minimal to be productive (install + import + 3-step switch).
- **Web docs button** = full reference (community + official). Anobe *summarises* rather than mirrors — each guide links to `docsUrl` with “Open in Anobe” vs “Open in browser.”

---

## Dev Notes

- Splash: `src-tauri/tauri.conf.json:14` `main: visible:false` + `splashscreen: splash.html` + `src/main.tsx:34` `splashDance()` + 20s Rust watchdog.
- Tray: `tray-icon` feature + `TrayIconBuilder` (Show/Docs/Quit, click-to-show).
- Deep links: `tauri-plugin-deep-link` (`anobe` scheme) + `single-instance` (first plugin) + `register_all()` for dev on Win/Linux.
- File scopes: `capabilities/default.json:13` explicitly allows `$DOCUMENT/**`, `$DOWNLOAD/**`, `$PICTURE/**`, `$DESKTOP/**`, `$HOME/**` (`fs:default` alone grants nothing — see https://v2.tauri.app/plugin/file-system/#scopes).
- Window-state only for `main` (`with_filter(|l| l=="main")`) — installer/webapp/docs never restore stale `x=-1027` positions.

---

## Attribution

Affinity is now free via Canva (affinity.studio) — used as replacement for Photoshop/Illustrator/InDesign. All Adobe product names/logos are property of Adobe Inc., shown only for identification in Adobify mode. Anobe is not affiliated with Adobe. Built with Tauri 2 + Vite + React.

