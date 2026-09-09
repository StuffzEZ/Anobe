#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{image::Image, AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct DocFile {
    name: String,
    path: String,
    ext: String,
    size: u64,
    modified: u64,
}

/// Extensions managed through the Bridge alternative (digiKam) + general creative docs.
fn tracked_extensions() -> Vec<String> {
    vec![
        "psd", "psb", "ai", "indd", "idml", "pdf", "xcf", "kra", "afphoto",
        "afdesign", "afpub", "svg", "png", "jpg", "jpeg", "tif", "tiff",
        "dng", "nef", "cr2", "cr3", "arw", "orf", "rw2", "xmp", "pp3",
        "mp4", "mov", "mkv", "prproj", "drp", "kdenlive", "aep", "cavalry",
        "blend", "fig", "sai", "ora", "wav", "mp3", "flac", "ardour",
        "aup3", "docx", "md", "txt", "epub", "stl", "obj", "fbx",
    ]
    .into_iter()
    .map(|s| s.to_string())
    .collect()
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs_home() {
        // Documents-first: only folders that hold project files, not random media.
        // (No bare-home scan: it drags whole trees like OneDrive into a sync walk.)
        for sub in ["Documents", "Pictures", "Videos", "Desktop"] {
            let p = home.join(sub);
            if p.is_dir() {
                roots.push(p);
            }
        }
    }
    roots
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
}

fn scan_dir(dir: &PathBuf, exts: &[String], out: &mut Vec<DocFile>, depth: u8) {
    if depth > 4 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let lower = name.to_lowercase();
                if lower.starts_with('.')
                    || ["node_modules", "appdata", "application data", "target", ".git"]
                        .contains(&lower.as_str())
                {
                    continue;
                }
            }
            scan_dir(&path, exts, out, depth + 1);
            if out.len() >= 200 {
                return;
            }
        } else if let Some(e) = path.extension().and_then(|s| s.to_str()) {
            let el = e.to_lowercase();
            if exts.contains(&el) {
                if let Ok(meta) = entry.metadata() {
                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    out.push(DocFile {
                        name: path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("file")
                            .to_string(),
                        path: path.to_string_lossy().to_string(),
                        ext: el,
                        size: meta.len(),
                        modified,
                    });
                    if out.len() >= 200 {
                        return;
                    }
                }
            }
        }
    }
}

/// List creative documents. The frontend passes the extension set derived
/// from the app catalog (`handles`), so only files actually linked to a
/// replacement app show up — never random photos, videos or music.
/// `extra_roots` adds mounted folders (e.g. Google Drive for Desktop).
#[tauri::command]
fn list_documents(
    extensions: Option<Vec<String>>,
    extra_roots: Option<Vec<String>>,
) -> Vec<DocFile> {
    let exts: Vec<String> = match extensions {
        Some(list) if !list.is_empty() => list.into_iter().map(|e| e.to_lowercase()).collect(),
        _ => tracked_extensions(),
    };
    let mut out = Vec::new();
    for root in candidate_roots() {
        scan_dir(&root, &exts, &mut out, 0);
        if out.len() >= 200 {
            break;
        }
    }
    if let Some(extra) = extra_roots {
        for r in extra {
            let p = PathBuf::from(r);
            if p.is_dir() {
                scan_dir(&p, &exts, &mut out, 0);
            }
            if out.len() >= 300 {
                break;
            }
        }
    }
    // De-duplicate: extra roots can overlap the standard ones.
    {
        use std::collections::HashSet;
        let mut seen = HashSet::new();
        out.retain(|d| seen.insert(d.path.clone()));
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.truncate(120);
    out
}

#[tauri::command]
fn open_path(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok("opened".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        Command::new(opener)
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok("opened".into());
    }
}

/// Try to launch an installed app by executable name(s).
/// Only reports success when the executable is actually found on PATH —
/// a blind `start` fallback would claim success for missing apps.
#[tauri::command]
fn open_app(executables: Vec<String>) -> Result<String, String> {
    for exe in &executables {
        #[cfg(target_os = "windows")]
        {
            if Command::new("where")
                .arg(exe)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                Command::new("cmd")
                    .args(["/C", "start", "", exe])
                    .spawn()
                    .map_err(|e| e.to_string())?;
                return Ok(format!("launched {exe}"));
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let probe = Command::new("which").arg(exe).output();
            if probe.map(|o| o.status.success()).unwrap_or(false) {
                Command::new(exe).spawn().map_err(|e| e.to_string())?;
                return Ok(format!("launched {exe}"));
            }
        }
    }
    Err("not-found".into())
}

// ---------------------------------------------------------------------------
// digiKam (Bridge replacement) powers the Documents tab.
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct DigikamStatus {
    installed: bool,
    path: Option<String>,
}

fn find_digikam() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = Command::new("where").arg("digikam").output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !p.is_empty() {
                    return Some(p);
                }
            }
        }
        for c in [
            "C:\\Program Files\\digiKam\\bin\\digiKam.exe",
            "C:\\Program Files (x86)\\digiKam\\bin\\digiKam.exe",
        ] {
            if std::path::Path::new(c).exists() {
                return Some(c.to_string());
            }
        }
        return None;
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(out) = Command::new("which").arg("digikam").output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !p.is_empty() {
                    return Some(p);
                }
            }
        }
        for c in ["/usr/bin/digikam", "/usr/local/bin/digikam"] {
            if std::path::Path::new(c).exists() {
                return Some(c.to_string());
            }
        }
        None
    }
}

#[tauri::command]
fn digikam_status() -> DigikamStatus {
    match find_digikam() {
        Some(p) => DigikamStatus {
            installed: true,
            path: Some(p),
        },
        None => DigikamStatus {
            installed: false,
            path: None,
        },
    }
}

#[tauri::command]
fn open_digikam() -> Result<String, String> {
    let Some(path) = find_digikam() else {
        return Err("not-found".into());
    };
    Command::new(&path).spawn().map_err(|e| e.to_string())?;
    Ok("launched digiKam".into())
}

// ---------------------------------------------------------------------------
// Start Menu / Desktop shortcuts (Windows .lnk). The shortcut is named with
// the Adobe name when Adobify is on, otherwise the replacement name.
// ---------------------------------------------------------------------------

fn resolve_exe(executables: &[String]) -> Option<String> {
    for exe in executables {
        #[cfg(target_os = "windows")]
        {
            if let Ok(out) = Command::new("where").arg(exe).output() {
                if out.status.success() {
                    if let Some(p) = String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .next()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        return Some(p.to_string());
                    }
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(out) = Command::new("which").arg(exe).output() {
                if out.status.success() {
                    if let Some(p) = String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .next()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    {
                        return Some(p.to_string());
                    }
                }
            }
        }
    }
    None
}

fn sanitize_shortcut_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " -_().+".contains(c) {
                c
            } else {
                ' '
            }
        })
        .collect();
    let clean = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    clean.chars().take(80).collect::<String>()
}

#[tauri::command]
fn create_shortcut(
    name: String,
    executables: Vec<String>,
    location: String,
) -> Result<String, String> {
    let exe = resolve_exe(&executables).ok_or("not-found".to_string())?;
    let clean = sanitize_shortcut_name(&name);
    if clean.is_empty() {
        return Err("bad-name".into());
    }
    #[cfg(target_os = "windows")]
    {
        // Resolve the real folder (respects OneDrive-redirected Desktop).
        let folder_kind = if location == "startmenu" { "Programs" } else { "Desktop" };
        let folder_out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("[Environment]::GetFolderPath('{folder_kind}')"),
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !folder_out.status.success() {
            return Err("no-folder".into());
        }
        let mut folder = String::from_utf8_lossy(&folder_out.stdout).trim().to_string();
        if folder.is_empty() {
            return Err("no-folder".into());
        }
        if location == "startmenu" {
            folder = format!("{folder}\\Anobe");
            std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        }
        let lnk = format!("{folder}\\{clean}.lnk");
        let workdir = std::path::Path::new(&exe)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let ps = |s: &str| s.replace('\'', "''");
        let script = format!(
            "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}');$s.TargetPath='{}';$s.WorkingDirectory='{}';$s.IconLocation='{},0';$s.Description='{} (via Anobe)';$s.Save()",
            ps(&lnk),
            ps(&exe),
            ps(&workdir),
            ps(&exe),
            ps(&clean)
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() && std::path::Path::new(&lnk).exists() {
            return Ok(lnk);
        }
        return Err("shortcut-failed".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (clean, exe, location);
        return Err("unsupported-platform".into());
    }
}

// ---------------------------------------------------------------------------
// Google Drive for Desktop (Adobe-cloud stand-in): detect the mounted
// "My Drive" folder so Documents can include cloud project files.
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct DriveStatus {
    installed: bool,
    folder: Option<String>,
}

fn find_drive_folder() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // Drive for Desktop mounts a virtual drive (usually G:).
        // A root-level "My Drive" folder is its unmistakable marker.
        for letter in b'D'..=b'Z' {
            let p = format!("{}:\\My Drive", letter as char);
            if std::path::Path::new(&p).is_dir() {
                return Some(p);
            }
        }
        return None;
    }
    #[cfg(not(target_os = "windows"))]
    {
        for p in ["/Volumes/GoogleDrive/My Drive"] {
            if std::path::Path::new(p).is_dir() {
                return Some(p.to_string());
            }
        }
        None
    }
}

fn drive_client_present() -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(pf) = std::env::var("ProgramFiles") {
            if std::path::Path::new(&format!("{pf}\\Google\\Drive File Stream")).exists() {
                return true;
            }
        }
        if let Ok(out) = Command::new("where").arg("GoogleDriveFS").output() {
            if out.status.success() {
                return true;
            }
        }
        return false;
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
fn drive_status() -> DriveStatus {
    let folder = find_drive_folder();
    DriveStatus {
        installed: folder.is_some() || drive_client_present(),
        folder,
    }
}

// ---------------------------------------------------------------------------
// Child windows: Anobe App Installer / Anobe Webapp / Anobe Docs.
// Window icons composite the app's real icon with the Anobe badge.
// ---------------------------------------------------------------------------

fn app_icon_png(app_id: &str) -> &'static [u8] {
    match app_id {
        "photoshop" => include_bytes!("../icons/apps/photoshop.png"),
        "illustrator" => include_bytes!("../icons/apps/illustrator.png"),
        "indesign" => include_bytes!("../icons/apps/indesign.png"),
        "photoshop-elements" => include_bytes!("../icons/apps/photoshop-elements.png"),
        "lightroom" => include_bytes!("../icons/apps/lightroom.png"),
        "premiere-pro" => include_bytes!("../icons/apps/premiere-pro.png"),
        "premiere-rush" => include_bytes!("../icons/apps/premiere-rush.png"),
        "premiere-elements" => include_bytes!("../icons/apps/premiere-elements.png"),
        "after-effects" => include_bytes!("../icons/apps/after-effects.png"),
        "animate" => include_bytes!("../icons/apps/animate.png"),
        "character-animator" => include_bytes!("../icons/apps/character-animator.png"),
        "audition" => include_bytes!("../icons/apps/audition.png"),
        "audition-ardour" => include_bytes!("../icons/apps/audition-ardour.png"),
        "fresco" => include_bytes!("../icons/apps/fresco.png"),
        "bridge" => include_bytes!("../icons/apps/bridge.png"),
        "media-encoder" => include_bytes!("../icons/apps/media-encoder.png"),
        "dimension" => include_bytes!("../icons/apps/dimension.png"),
        "substance-designer" => include_bytes!("../icons/apps/substance-designer.png"),
        "substance-stager" => include_bytes!("../icons/apps/substance-stager.png"),
        "substance-modeler" => include_bytes!("../icons/apps/substance-modeler.png"),
        "xd" => include_bytes!("../icons/apps/xd.png"),
        "incopy" => include_bytes!("../icons/apps/incopy.png"),
        "substance-painter" => include_bytes!("../icons/apps/substance-painter.png"),
        "substance-sampler" => include_bytes!("../icons/apps/substance-sampler.png"),
        "acrobat" => include_bytes!("../icons/apps/acrobat.png"),
        "adobe-scan" => include_bytes!("../icons/apps/adobe-scan.png"),
        "fill-sign" => include_bytes!("../icons/apps/fill-sign.png"),
        "stock" => include_bytes!("../icons/apps/stock.png"),
        "fonts" => include_bytes!("../icons/apps/fonts.png"),
        "frameio" => include_bytes!("../icons/apps/frameio.png"),
        "behance" => include_bytes!("../icons/apps/behance.png"),
        "portfolio" => include_bytes!("../icons/apps/portfolio.png"),
        "experience-cloud" => include_bytes!("../icons/apps/experience-cloud.png"),
        "connect" => include_bytes!("../icons/apps/connect.png"),
        "coldfusion" => include_bytes!("../icons/apps/coldfusion.png"),
        "robohelp" => include_bytes!("../icons/apps/robohelp.png"),
        "captivate" => include_bytes!("../icons/apps/captivate.png"),
        _ => include_bytes!("../icons/128x128.png"),
    }
}

/// 64x64 RGBA window icon. For child windows the app icon gets the Anobe
/// badge composited into the bottom-right corner.
fn composited_icon(app_id: Option<&str>) -> Image<'static> {
    use image::imageops::FilterType;
    let base_bytes = app_id
        .map(app_icon_png)
        .unwrap_or(include_bytes!("../icons/128x128.png"));
    let mut base = image::load_from_memory(base_bytes)
        .map(|i| i.to_rgba8())
        .unwrap_or_else(|_| {
            image::RgbaImage::from_pixel(64, 64, image::Rgba([32, 32, 36, 255]))
        });
    base = image::imageops::resize(&base, 64, 64, FilterType::Lanczos3);
    if app_id.is_some() {
        if let Ok(badge) = image::load_from_memory(include_bytes!("../icons/anobe-badge.png")) {
            let bw = 24u32;
            let badge = image::imageops::resize(&badge.to_rgba8(), bw, bw, FilterType::Lanczos3);
            // White ring behind the badge so it reads on any icon.
            let pad = 3i64;
            let ring_r = (bw as f64 + pad as f64 * 2.0) / 2.0;
            let ring_cx = 64.0 - ring_r - 1.0;
            let ring_cy = 64.0 - ring_r - 1.0;
            for y in 0..64u32 {
                for x in 0..64u32 {
                    let dx = x as f64 + 0.5 - ring_cx;
                    let dy = y as f64 + 0.5 - ring_cy;
                    if dx * dx + dy * dy <= ring_r * ring_r {
                        base.put_pixel(x, y, image::Rgba([255, 255, 255, 255]));
                    }
                }
            }
            let bx = 64 - bw as i64 - 2;
            image::imageops::overlay(&mut base, &badge, bx, bx);
        }
    }
    let (w, h) = (base.width(), base.height());
    Image::new_owned(base.into_raw(), w, h)
}

fn apply_icon(app: &AppHandle, label: &str, app_id: Option<&str>) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.set_icon(composited_icon(app_id));
    }
}

#[tauri::command]
async fn open_child_window(
    app: AppHandle,
    kind: String,
    app_id: String,
    title: String,
    adobe: Option<String>,
    icon: Option<String>,
    adobe_icon: Option<String>,
    url: String,
) -> Result<String, String> {
    log::info!("open_child_window kind={kind} app={app_id} url={url} adobe={:?}", adobe);
    // Yield so the IPC reply isn't blocked behind WebView init.
    // WebView2 creation must happen on the main thread; Tauri marshals it.
    let res = open_child_window_inner_ext(&app, &kind, &app_id, &title, adobe.as_deref(), icon.as_deref(), adobe_icon.as_deref(), &url);
    if let Err(ref e) = res {
        log::warn!("open_child_window failed: {e}");
    }
    res
}

#[allow(dead_code)]
fn open_child_window_inner(
    app: &AppHandle,
    kind: &str,
    app_id: &str,
    title: &str,
    url: &str,
) -> Result<String, String> {
    open_child_window_inner_ext(app, kind, app_id, title, None, None, None, url)
}

fn open_child_window_inner_ext(
    app: &AppHandle,
    kind: &str,
    app_id: &str,
    title: &str,
    adobe: Option<&str>,
    icon: Option<&str>,
    adobe_icon: Option<&str>,
    url: &str,
) -> Result<String, String> {
    let label = format!("{kind}-{app_id}");
    if let Some(w) = app.get_webview_window(&label) {
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok("focused".into());
    }
    let win_title = match kind {
        "installer" => format!("Anobe App Installer - {title}"),
        "webapp" => format!("Anobe Webapp - {title}"),
        "docssite" => format!("Anobe Docs - {title}"),
        _ => format!("Anobe - {title}"),
    };
    // Installer gets a local wrapper with an arch/OS banner + iframe.
    // That way the banner is a separate visual area and the user always
    // knows which build to pick (Intel/AMD vs ARM, Windows vs macOS/Linux).
    if kind == "installer" {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        // Try to enrich OS with version via os plugin if available
        let osver = "";
        let enc = |s: &str| url::form_urlencoded::byte_serialize(s.as_bytes()).collect::<String>();
        let wrapper = format!(
            "installer.html?url={}&title={}&adobe={}&icon={}&adobeIcon={}&os={}&arch={}&osver={}",
            enc(url), enc(title), enc(adobe.unwrap_or("")), enc(icon.unwrap_or("")), enc(adobe_icon.unwrap_or("")), os, arch, osver
        );
        let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(wrapper.into()))
            .title(&win_title)
            .inner_size(1120.0, 780.0)
            .min_inner_size(820.0, 560.0)
            .center()
            .visible(true)
            .on_download({
                let label_for_dl = label.clone();
                move |webview: tauri::Webview<tauri::Wry>, event: tauri::webview::DownloadEvent<'_>| {
                    match event {
                        tauri::webview::DownloadEvent::Requested { url, destination } => {
                            log::info!("download requested {} -> {:?}", url, destination);
                            let original = url.path_segments().and_then(|s| s.last()).unwrap_or("download").to_string();
                            let (stem, ext) = match original.rfind('.') {
                                Some(idx) if idx > 0 => (&original[..idx], &original[idx..]),
                                _ => (original.as_str(), ""),
                            };
                            let anobe_name = format!("{}_Anobe{}", stem, ext);
                            let downloads_dir = webview
                                .app_handle()
                                .path()
                                .download_dir()
                                .unwrap_or_else(|_| dirs_home().unwrap_or(std::path::PathBuf::from(".")) .join("Downloads"));
                            let picked = webview
                                .app_handle()
                                .dialog()
                                .file()
                                .set_directory(&downloads_dir)
                                .set_file_name(&anobe_name)
                                .blocking_save_file();
                            if let Some(path) = picked {
                                *destination = std::path::PathBuf::from(path.to_string());
                                log::info!("download save-as: {:?}", destination);
                                true
                            } else {
                                log::info!("download cancelled");
                                false
                            }
                        }
                        tauri::webview::DownloadEvent::Finished { url, path, success } => {
                            log::info!("download finished {} -> {:?} success={}", url, path, success);
                            if success {
                                if let Some(p) = path {
                                    if let Some(state) = webview.app_handle().try_state::<LastDownload>() {
                                        *state.0.lock().unwrap() = Some(p.to_string_lossy().to_string());
                                    }
                                    let _ = webview.emit("anobe:downloaded", serde_json::json!({"path": p.to_string_lossy()}));
                                    if let Some(w) = webview.app_handle().get_webview_window(&label_for_dl) {
                                        let _ = w.set_focus();
                                    }
                                }
                            }
                            true
                        }
                        _ => true,
                    }
                }
            })
            .build()
            .map_err(|e| e.to_string())?;
        log::info!("installer wrapper built: {label} url={url} arch={arch} os={os}");
        apply_icon(app, &label, Some(app_id));
        let _ = win.show();
        let _ = win.set_focus();
        return Ok("opened".into());
    }
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title(&win_title)
        .inner_size(1120.0, 780.0)
        .min_inner_size(820.0, 560.0)
        .center()
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    log::info!("child window built: {label}");
    apply_icon(app, &label, Some(app_id));
    let _ = win.show();
    let _ = win.set_focus();
    Ok("opened".into())
}

#[derive(Serialize, Clone)]
struct PendingDoc {
    app_id: String,
    tab: String,
}

struct PendingDocState(Mutex<Option<PendingDoc>>);

#[tauri::command]
async fn open_docs_window(
    app: AppHandle,
    app_id: Option<String>,
    tab: Option<String>,
) -> Result<String, String> {
    let res = show_docs_window_inner(&app, app_id, tab);
    if let Err(ref e) = res {
        log::warn!("open_docs_window failed: {e}");
    }
    res
}

fn show_docs_window_inner(
    app: &AppHandle,
    app_id: Option<String>,
    tab: Option<String>,
) -> Result<String, String> {
    if let Some(id) = app_id {
        if let Some(state) = app.try_state::<PendingDocState>() {
            *state.0.lock().unwrap() = Some(PendingDoc {
                app_id: id,
                tab: tab.unwrap_or_else(|| "guide".into()),
            });
        }
    }
    let state: State<PendingDocState> = app.state::<PendingDocState>();
    if let Some(w) = app.get_webview_window("docs") {
        w.set_focus().map_err(|e| e.to_string())?;
        // Clone (don't take): a freshly created window may still be mounting
        // and will pick the same payload up via take_pending_doc.
        if let Ok(guard) = state.0.lock() {
            if let Some(p) = guard.clone() {
                let _ = w.emit("anobe:open-doc", p);
            }
        }
        return Ok("focused".into());
    }
    log::info!("creating Anobe Docs window");
    let win = WebviewWindowBuilder::new(app, "docs", WebviewUrl::App("index.html".into()))
        .title("Anobe Docs")
        .inner_size(1140.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    log::info!("Anobe Docs window built: label=docs");
    apply_icon(app, "docs", None);
    // Nudge WebView2 to paint even if the main window just changed visibility.
    let _ = win.show();
    let _ = win.set_focus();
    Ok("opened".into())
}

#[tauri::command]
fn take_pending_doc(state: State<PendingDocState>) -> Result<Option<PendingDoc>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.take())
}

// ---------------------------------------------------------------------------
// Deep links: anobe://open/<id> | install/<id> | docs[/<id>] | apps | documents
// (Canonical replacement ids only — Adobify never applies to links.)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
struct PendingLink {
    action: String,
    id: Option<String>,
}

struct PendingLinkState(Mutex<Option<PendingLink>>);

struct LastDownload(Mutex<Option<String>>);

fn handle_deep_link_url(app: &AppHandle, raw: &str) {
    log::info!("deep link received: {raw}");
    let path = raw.trim_start_matches("anobe://").trim_matches('/');
    let mut segs = path.split('/').filter(|s| !s.is_empty());
    let (action, id): (&str, Option<String>) = match (segs.next(), segs.next()) {
        (Some("open"), id) => ("open", id.map(|s| s.to_string())),
        (Some("install"), id) => ("install", id.map(|s| s.to_string())),
        (Some("docs"), id) => ("docs", id.map(|s| s.to_string())),
        (Some("apps"), _) => ("apps", None),
        (Some("documents"), _) => ("documents", None),
        _ => {
            log::warn!("ignoring unknown deep link: {raw}");
            return;
        }
    };
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    let payload = PendingLink {
        action: action.to_string(),
        id,
    };
    if let Some(state) = app.try_state::<PendingLinkState>() {
        *state.0.lock().unwrap() = Some(payload.clone());
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("anobe:deeplink", payload);
    }
}

#[tauri::command]
fn take_pending_link(state: State<PendingLinkState>) -> Result<Option<PendingLink>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.take())
}

// ---------------------------------------------------------------------------
// Open With: per-file alternatives (owner app, capable PC apps, Windows dialog).
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct OpenerCandidate {
    label: String,
    path: String,
}

#[derive(Serialize)]
struct FileOpeners {
    owner_found: bool,
    candidates: Vec<OpenerCandidate>,
}

fn probe_exe(exe: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let probe = Command::new("where").arg(exe).output();
    #[cfg(not(target_os = "windows"))]
    let probe = Command::new("which").arg(exe).output();
    match probe {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        _ => well_known_location(exe),
    }
}

/// Browsers and friends often aren't on PATH — check their install folders.
#[cfg(target_os = "windows")]
fn well_known_location(exe: &str) -> Option<String> {
    let rel: &[&str] = match exe.to_lowercase().as_str() {
        "chrome" | "chrome.exe" => &["Google\\Chrome\\Application\\chrome.exe"],
        "msedge" | "msedge.exe" => &["Microsoft\\Edge\\Application\\msedge.exe"],
        "firefox" | "firefox.exe" => &["Mozilla Firefox\\firefox.exe"],
        "vlc" | "vlc.exe" => &["VideoLAN\\VLC\\vlc.exe"],
        "code" | "code.exe" => &[
            "Microsoft VS Code\\Code.exe",
            "Programs\\Microsoft VS Code\\Code.exe",
        ],
        _ => &[],
    };
    let mut roots = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(v);
        }
    }
    for root in &roots {
        for r in rel {
            let p = format!("{root}\\{r}");
            if std::path::Path::new(&p).is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn well_known_location(_exe: &str) -> Option<String> {
    None
}

fn opener_table(ext: &str) -> &'static [(&'static str, &'static str)] {
    match ext {
        "pdf" | "epub" => &[
            ("Google Chrome", "chrome"),
            ("Microsoft Edge", "msedge"),
            ("Firefox", "firefox"),
        ],
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif" | "tiff" => &[
            ("Google Chrome", "chrome"),
            ("Microsoft Edge", "msedge"),
            ("Firefox", "firefox"),
        ],
        "svg" => &[
            ("Google Chrome", "chrome"),
            ("Microsoft Edge", "msedge"),
            ("Firefox", "firefox"),
            ("Inkscape", "inkscape"),
        ],
        "mp4" | "mov" | "mkv" | "avi" => &[
            ("VLC media player", "vlc"),
            ("Google Chrome", "chrome"),
            ("Microsoft Edge", "msedge"),
        ],
        "mp3" | "wav" | "flac" => &[
            ("VLC media player", "vlc"),
            ("Windows Media Player", "wmplayer"),
        ],
        "txt" | "md" => &[("Notepad", "notepad"), ("VS Code", "code")],
        "docx" | "odt" => &[("LibreOffice", "soffice"), ("WordPad", "write")],
        "blend" => &[("Blender", "blender")],
        "kra" | "ora" => &[("Krita", "krita")],
        _ => &[],
    }
}

#[tauri::command]
fn file_openers(ext: String, owner_exes: Vec<String>) -> FileOpeners {
    let ext = ext.to_lowercase();
    let owner_found = owner_exes.iter().any(|e| probe_exe(e).is_some());
    let mut seen = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for (label, exe) in opener_table(&ext) {
        if let Some(path) = probe_exe(exe) {
            if seen.insert(path.clone()) {
                candidates.push(OpenerCandidate {
                    label: label.to_string(),
                    path,
                });
            }
        }
    }
    FileOpeners {
        owner_found,
        candidates,
    }
}


#[derive(serde::Deserialize)]
struct DetectRequest {
    id: String,
    executables: Vec<String>,
    alt: String,
}

#[derive(Serialize)]
struct DetectResult {
    id: String,
    installed: bool,
    path: Option<String>,
}

#[cfg(target_os = "windows")]
fn check_windows_registry(alt: &str) -> bool {
    // Common uninstall registry locations
    let hives = [
        (winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE), r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE), r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER), r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];
    let alt_lower = alt.to_lowercase();
    let alt_words: Vec<&str> = alt_lower.split_whitespace().collect();
    for (hive, path) in hives {
        if let Ok(key) = hive.open_subkey(path) {
            for name in key.enum_keys().flatten() {
                if let Ok(sub) = key.open_subkey(&name) {
                    if let Ok(display) = sub.get_value::<String, _>("DisplayName") {
                        let dl = display.to_lowercase();
                        // Require all words of alt to be in DisplayName for Affinity, otherwise fuzzy
                        let all_words = alt_words.iter().all(|w| dl.contains(w));
                        if all_words || dl.contains(&alt_lower) || alt_lower.contains(&dl) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn check_windows_registry(_alt: &str) -> bool { false }

#[cfg(target_os = "windows")]
fn check_common_paths(exe: &str) -> Option<String> {
    let exe_lower = exe.to_lowercase();
    // Affinity MSIX execution aliases
    if exe_lower.contains("affinity") || exe_lower == "photo.exe" || exe_lower == "designer.exe" || exe_lower == "publisher.exe" {
        let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!(r"{}\Microsoft\WindowsApps\AffinityPhoto2.exe", local_app),
            format!(r"{}\Microsoft\WindowsApps\AffinityDesigner2.exe", local_app),
            format!(r"{}\Microsoft\WindowsApps\AffinityPublisher2.exe", local_app),
            r"C:\Program Files\Affinity\Photo 2\Photo.exe".to_string(),
            r"C:\Program Files\Affinity\Designer 2\Designer.exe".to_string(),
            r"C:\Program Files\Affinity\Publisher 2\Publisher.exe".to_string(),
        ];
        for c in candidates {
            if std::path::Path::new(&c).is_file() {
                return Some(c);
            }
        }
        // Check WindowsApps glob for Serif package
        if let Ok(entries) = std::fs::read_dir(r"C:\Program Files\WindowsApps") {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_lowercase();
                if name.contains("serifeurope") && name.contains("affinity") {
                    // Look inside for executables
                    if let Ok(inner) = std::fs::read_dir(e.path()) {
                        for f in inner.flatten() {
                            let fp = f.path().to_string_lossy().to_lowercase();
                            if fp.ends_with("photo.exe") || fp.ends_with("designer.exe") || fp.ends_with("publisher.exe") {
                                return Some(f.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    // General Program Files checks
    let prog_files = [
        std::env::var("ProgramFiles").unwrap_or(r"C:\Program Files".to_string()),
        std::env::var("ProgramFiles(x86)").unwrap_or(r"C:\Program Files (x86)".to_string()),
        std::env::var("LOCALAPPDATA").unwrap_or_default() + r"\Programs",
    ];
    let exe_name = exe.to_string();
    for root in prog_files {
        // Check direct exe in root
        let p1 = format!(r"{}\{}", root, exe_name);
        if std::path::Path::new(&p1).is_file() {
            return Some(p1);
        }
        // Check common subfolders per exe
        let subfolders: &[&str] = match exe_lower.as_str() {
            "blender.exe" | "blender" => &["Blender Foundation\\Blender 4.2", "Blender Foundation\\Blender 4.1", "Blender Foundation\\Blender 4.0", "Blender Foundation\\Blender"],
            "krita.exe" | "krita" => &[r"Krita (x64)\bin", r"Krita\bin"],
            "darktable.exe" | "darktable" => &[r"darktable\bin"],
            "resolve.exe" | "resolve" => &[r"Blackmagic Design\DaVinci Resolve", r"Blackmagic Design\DaVinci Resolve\Resolve.exe".into()],
            "kdenlive.exe" | "kdenlive" => &[r"kdenlive\bin"],
            "cavalry.exe" => &[r"Cavalry"],
            "opentooz.exe" | "opentooz" | "opentool" => &[r"OpenToonz"],
            "audacity.exe" | "audacity" => &[r"Audacity"],
            "ardour" => &[r"Ardour\bin"],
            "digikam.exe" | "digikam" => &[r"digiKam\bin"],
            "handbrake.exe" | "handbrake" | "ghb" => &[r"HandBrake"],
            "figma.exe" | "figma" => &[r"Figma", r"Figma\app-*"],
            "soffice.exe" | "soffice" | "swriter.exe" => &[r"LibreOffice\program", r"LibreOffice"],
            "hugo.exe" | "hugo" => &[r"Hugo\bin", r"hugo"],
            _ => &[],
        };
        for sub in subfolders {
            let p = format!(r"{}\{}\{}", root, sub, exe_name);
            if std::path::Path::new(&p).is_file() {
                return Some(p);
            }
            // Also try without exe duplicate for cases where sub already includes exe
            let p2 = format!(r"{}\{}", root, sub);
            if p2.to_lowercase().ends_with(".exe") && std::path::Path::new(&p2).is_file() {
                return Some(p2);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn check_common_paths(_exe: &str) -> Option<String> { None }

#[cfg(target_os = "linux")]
fn check_flatpak_snap(alt: &str) -> bool {
    let alt_lower = alt.to_lowercase();
    let flatpak_map: &[(&str, &str)] = &[
        ("blender", "org.blender.Blender"),
        ("krita", "org.kde.krita"),
        ("kdenlive", "org.kde.kdenlive"),
        ("darktable", "org.darktable.Darktable"),
        ("audacity", "org.audacityteam.Audacity"),
        ("digikam", "org.kde.digikam"),
        ("handbrake", "fr.handbrake.ghb"),
        ("inkscape", "org.inkscape.Inkscape"),
        ("blender", "org.blender.Blender"),
    ];
    for (key, id) in flatpak_map {
        if alt_lower.contains(key) {
            if let Ok(out) = std::process::Command::new("flatpak").args(["info", id]).output() {
                if out.status.success() { return true; }
            }
        }
    }
    // Snap check
    for key in ["blender", "krita", "darktable", "audacity"] {
        if alt_lower.contains(key) {
            if let Ok(out) = std::process::Command::new("snap").args(["list", key]).output() {
                if out.status.success() && String::from_utf8_lossy(&out.stdout).contains(key) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(not(target_os = "linux"))]
fn check_flatpak_snap(_alt: &str) -> bool { false }

#[cfg(target_os = "macos")]
fn check_macos_app(alt: &str) -> bool {
    let alt_lower = alt.to_lowercase();
    let candidates = [
        format!("/Applications/{}.app", alt),
        format!("/Applications/{} 2.app", alt),
        format!("/Applications/Affinity {}.app", alt.split_whitespace().last().unwrap_or("")),
    ];
    for c in candidates {
        if std::path::Path::new(&c).exists() { return true; }
    }
    // Special cases
    let map: &[(&str, &str)] = &[
        ("affinity photo", "/Applications/Affinity Photo 2.app"),
        ("affinity designer", "/Applications/Affinity Designer 2.app"),
        ("affinity publisher", "/Applications/Affinity Publisher 2.app"),
        ("blender", "/Applications/Blender.app"),
        ("krita", "/Applications/krita.app"),
        ("darktable", "/Applications/darktable.app"),
        ("davinci resolve", "/Applications/DaVinci Resolve/DaVinci Resolve.app"),
    ];
    for (k, p) in map {
        if alt_lower.contains(k) && std::path::Path::new(p).exists() { return true; }
    }
    false
}

#[cfg(not(target_os = "macos"))]
fn check_macos_app(_alt: &str) -> bool { false }

fn is_installed(alt: &str, executables: &[String]) -> Option<String> {
    if executables.is_empty() {
        return None; // web/service never "installed" as desktop
    }
    for exe in executables {
        if let Some(path) = probe_exe(exe) {
            let exe_lower = exe.to_lowercase();
            // Generic Affinity exes (Photo.exe etc.) are only valid if path contains affinity
            if matches!(exe_lower.as_str(), "photo.exe" | "designer.exe" | "publisher.exe") {
                if path.to_lowercase().contains("affinity") {
                    return Some(path);
                }
                // otherwise ignore this generic hit and try next exe / registry
            } else {
                return Some(path);
            }
        }
        if let Some(path) = check_common_paths(exe) {
            return Some(path);
        }
    }
    // Windows AppX package check for Affinity (more reliable than where)
    if alt.to_lowercase().contains("affinity") {
        if check_affinity_appx(alt) { return Some("appx".to_string()); }
    }
    if check_windows_registry(alt) { return Some("registry".to_string()); }
    if check_flatpak_snap(alt) { return Some("flatpak/snap".to_string()); }
    if check_macos_app(alt) { return Some("app-bundle".to_string()); }
    None
}

#[cfg(target_os = "windows")]
fn check_affinity_appx(alt: &str) -> bool {
    let alt_lower = alt.to_lowercase();
    let pkg_keyword = if alt_lower.contains("photo") { "Photo" } else if alt_lower.contains("designer") { "Designer" } else if alt_lower.contains("publisher") { "Publisher" } else { return false };
    // Use PowerShell Get-AppxPackage to detect MSIX install (Canva/Affinity 2+)
    if let Ok(out) = std::process::Command::new("powershell")
        .args(["-NoProfile","-NonInteractive","-Command", &format!("Get-AppxPackage *Affinity*{}* | Select-Object -ExpandProperty PackageFullName", pkg_keyword)])
        .output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            if !s.trim().is_empty() { return true; }
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn check_affinity_appx(_alt: &str) -> bool { false }

#[tauri::command]
fn detect_installed(requests: Vec<DetectRequest>) -> Vec<DetectResult> {
    requests.into_iter().map(|r| {
        let path = is_installed(&r.alt, &r.executables);
        DetectResult { id: r.id, installed: path.is_some(), path }
    }).collect()
}

#[tauri::command]
fn open_with_exe(path: String, exe: String) -> Result<String, String> {
    log::info!("open-with {exe} <- {path}");
    Command::new(&exe)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok("opened".into())
}

#[tauri::command]
fn open_with_dialog(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        log::info!("open-with dialog <- {path}");
        Command::new("rundll32")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok("opened".into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        return Err("unsupported-platform".into());
    }
}

#[tauri::command]
fn get_last_download(state: State<LastDownload>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn scan_with_virustotal(app: AppHandle, path: Option<String>, state: State<LastDownload>) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let target = path.or_else(|| state.0.lock().unwrap().clone());
    if let Some(p) = target.as_ref() {
        log::info!("virustotal scan for {:?}", p);
    }
    // Open VirusTotal upload page — auto-upload via API would need a key,
    // so we open the page and the user can drag the file.
    app.opener().open_url("https://www.virustotal.com/gui/home/upload", None::<&str>).map_err(|e| e.to_string())?;
    Ok("opened".into())
}

#[tauri::command]
fn get_downloads_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("powershell")
            .args(["-NoProfile","-NonInteractive","-Command","[Environment]::GetFolderPath('UserProfile') + '\\Downloads'"])
            .output().map_err(|e| e.to_string())?;
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !p.is_empty() { return Ok(p); }
    }
    if let Some(home) = dirs_home() {
        let p = home.join("Downloads");
        if p.is_dir() { return Ok(p.to_string_lossy().to_string()); }
    }
    Err("no-downloads".into())
}

fn main() {
    // Single instance must be registered first (desktop only).
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log::info!("single-instance: second launch argv={argv:?}");
            for arg in argv.iter().filter(|a| a.starts_with("anobe://")) {
                handle_deep_link_url(app, arg);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .manage(PendingDocState(Mutex::new(None)))
        .manage(PendingLinkState(Mutex::new(None)))
        .manage(LastDownload(Mutex::new(None)))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Window geometry persistence (desktop): main window ONLY.
            // Child windows (installer/webapp/docs) and the splashscreen must
            // never restore stale geometry — a poisoned position once parked
            // a webapp window off-screen (x=-1027), looking "not working".
            #[cfg(desktop)]
            {
                let _ = app.handle().plugin(
                    tauri_plugin_window_state::Builder::default()
                        .with_filter(|label| label == "main")
                        .build(),
                );
            }

            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_icon(composited_icon(None));
            }

            // System tray (desktop): quick Show / Docs / Quit + click-to-show.
            #[cfg(desktop)]
            {
                use tauri::{
                    menu::{Menu, MenuItem},
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                };
                if let Some(icon) = app.default_window_icon().cloned() {
                    let show_i = MenuItem::with_id(app, "show", "Show Anobe", true, None::<&str>)?;
                    let docs_i =
                        MenuItem::with_id(app, "docs", "Open Anobe Docs", true, None::<&str>)?;
                    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                    let menu = Menu::with_items(app, &[&show_i, &docs_i, &quit_i])?;
                    let _tray = TrayIconBuilder::with_id("main-tray")
                        .icon(icon)
                        .tooltip("Anobe — Say no to Adobe")
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "docs" => {
                                if let Err(e) = show_docs_window_inner(app, None, None) {
                                    log::warn!("tray: open docs failed: {e}");
                                }
                            }
                            "quit" => app.exit(0),
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                let app = tray.app_handle();
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        })
                        .build(app)?;
                    log::info!("system tray ready");
                } else {
                    log::warn!("no default window icon — tray skipped");
                }
            }

            // Deep links: register scheme for dev, handle cold-start links, listen live.
            #[cfg(any(windows, target_os = "linux"))]
            {
                match app.deep_link().register_all() {
                    Ok(_) => log::info!("deep-link schemes registered (dev)"),
                    Err(e) => log::warn!("deep-link register_all failed: {e}"),
                }
            }
            match app.deep_link().get_current() {
                Ok(Some(urls)) => {
                    let handle = app.handle().clone();
                    for u in urls {
                        handle_deep_link_url(&handle, &u.to_string());
                    }
                }
                Ok(None) => {}
                Err(e) => log::warn!("deep-link get_current failed: {e}"),
            }
            {
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for u in event.urls() {
                        handle_deep_link_url(&handle, &u.to_string());
                    }
                });
            }

            // Splash watchdog: if the frontend never shows main (slow load or
            // boot failure), force it visible and drop the splash instead of
            // hanging forever.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(20));
                    if let Some(main) = handle.get_webview_window("main") {
                        let _ = main.show();
                    }
                    if let Some(splash) = handle.get_webview_window("splashscreen") {
                        let _ = splash.close();
                    }
                    log::info!("splash watchdog ran");
                });
            }

            // Dev smoke test (ANOBE_SMOKE=1 only): exercise every extra-window
            // path end to end so failures show up in the log file.
            if std::env::var("ANOBE_SMOKE").is_ok() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(8));
                    log::info!("SMOKE: installer window");
                    log::info!(
                        "SMOKE installer -> {:?}",
                        open_child_window_inner_ext(
                            &handle,
                            "installer",
                            "blender",
                            "Blender",
                            Some("Blender"),
                            None,
                            None,
                            "https://www.blender.org/download/"
                        )
                    );
                    log::info!("SMOKE: docs window");
                    log::info!(
                        "SMOKE docs -> {:?}",
                        show_docs_window_inner(
                            &handle,
                            Some("blender".to_string()),
                            Some("guide".to_string())
                        )
                    );
                    log::info!("SMOKE: webapp window");
                    log::info!(
                        "SMOKE webapp -> {:?}",
                        open_child_window_inner_ext(
                            &handle,
                            "webapp",
                            "xd",
                            "Figma",
                            Some("XD"),
                            None,
                            None,
                            "https://www.figma.com/"
                        )
                    );
                    log::info!("SMOKE: file_openers pdf");
                    log::info!(
                        "SMOKE openers -> owner={} n={}",
                        file_openers("pdf".to_string(), vec!["swriter.exe".to_string()])
                            .owner_found,
                        file_openers("pdf".to_string(), vec!["swriter.exe".to_string()])
                            .candidates
                            .len()
                    );
                    log::info!("SMOKE: drives/digikam");
                    log::info!("SMOKE drive -> {:?}", drive_status());
                    log::info!("SMOKE digikam -> {:?}", digikam_status());
                    log::info!("SMOKE DONE");
                });
            }

            log::info!("Anobe backend ready");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_documents,
            open_path,
            open_app,
            digikam_status,
            open_digikam,
            drive_status,
            create_shortcut,
            file_openers,
            open_with_exe,
            open_with_dialog,
            get_downloads_dir,
            get_last_download,
            detect_installed,
            scan_with_virustotal,
            open_child_window,
            open_docs_window,
            take_pending_doc,
            take_pending_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
