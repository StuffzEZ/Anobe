# Anobe
Say no to Adobe

## Hub app (Tauri)

Office-style app hub to install, open and manage every replacement, with docs + switch guides.

```powershell
npm install
npm run tauri dev      # run the desktop app
npm run tauri build    # build an installer
npm run dev            # frontend-only browser preview
```

- Splash screen with loading bar, system tray (Show / Docs / Quit), remembered window sizes.
- Slim sidebar with full app names, pinned popular apps (real brand icons), **All apps** button.
- Top search matches Adobe and replacement names (`/` focuses it anywhere).
- **Adobify** flips to Adobe names with Adobe-style tiles (audition shows Audacity + Ardour together).
- **Documents** works out of the box: only files linked to your apps. Every file has an **Open with** menu (owner app, capable PC apps like Chrome/Edge/VLC, the Windows picker, install prompt, show in folder).
- **Images** tab is digiKam's home (thumbnails, RAW, rescan); **Google Drive for Desktop** (`G:\My Drive`) joins the scan when installed.
- **Anobe Docs** window: every switch guide + official docs, one page per app.
- **Install** never installs silently (official download page in an **Anobe App Installer** popup). App details offer Desktop/Start Menu shortcuts.
- Web apps open integrated in their own **Anobe Webapp** windows.
- Deep links: `anobe://open/blender`, `anobe://install/blender`, `anobe://docs[/blender]`, `anobe://apps`, `anobe://documents`.
- Settings has a **System check** (OS/CPU/RAM with min/recommended warnings per app) and the log folder path (debug logging to file).

## Apps
| Adobe App | Standalone App? | What It Does | Best Free Replacement(s) |
|---|---|---|---|
| Photoshop | Yes | Raster/photo editing, retouching, compositing | Affinity (Pixel Studio) |
| Illustrator | Yes | Vector graphics — logos, icons, scalable art | Affinity (Vector Studio) |
| InDesign | Yes | Page layout for print/digital publishing | Affinity (Layout Studio) |
| Lightroom / Lightroom Classic | Yes | RAW photo processing, organizing, batch editing | Darktable |
| Premiere Pro | Yes | Timeline-based video editing | DaVinci Resolve |
| Premiere Rush | Yes | Quick mobile-first video editing for social | Kdenlive |
| After Effects | Yes | Motion graphics, VFX, compositing | Cavalry |
| Animate | Yes | 2D vector/frame-by-frame animation | Cavalry |
| Character Animator | Yes | Puppet rigging, real-time performance animation | OpenToonz |
| Audition | Yes | Waveform editing and multitrack audio mixing/mastering | Audacity (editing/cleanup) + Ardour (multitrack/MIDI/mixing) |
| Fresco | Yes | Digital painting (tablet-first) | Krita |
| Bridge | Yes | Browsing, tagging, managing media assets | digiKam |
| Media Encoder | Yes | Batch export/transcoding | HandBrake |
| Dimension | Yes | 3D product mockups/rendering | Blender |
| XD | Yes | UI/UX wireframing, interactive prototyping | Figma |
| InCopy | Yes | Collaborative text editing that flows into InDesign | LibreOffice Writer |
| Substance 3D Painter | Yes | Painting textures onto 3D models | ArmorPaint |
| Substance 3D Designer | Yes | Procedural node-based material creation | Blender (shader editor) |
| Substance 3D Sampler | Yes | Converting scans/photos into materials | Materialize |
| Substance 3D Stager | Yes | Arranging/rendering 3D scenes | Blender |
| Substance 3D Modeler | Yes | Sculpting 3D models (VR-friendly) | Blender (sculpt mode) |
| Acrobat Pro/Standard/Reader | Yes | Creating, editing, viewing, merging PDFs | PDF24 |
| Adobe Scan | Yes (mobile) | Turning phone photos into scanned PDFs w/ OCR | Microsoft Lens |
| Fill & Sign | Yes (mobile/web) | Filling PDF forms, digital signatures | DocHub |
| Adobe Stock | No — licensing service | Stock photo/video/audio library | Pexels |
| Adobe Fonts | No — font-licensing service | Font library integrated into other apps | Google Fonts |
| Frame.io | Yes (web platform) | Sharing video cuts for timestamped review | Frame.io (free tier) |
| Behance | No — social/portfolio website | Showcasing creative work publicly | ArtStation |
| Portfolio | No — hosted site builder | Simple personal portfolio site | Self-hosted static site |
| Photoshop Elements | Yes | Consumer-simplified Photoshop | Affinity (Pixel Studio) |
| Premiere Elements | Yes | Consumer-simplified Premiere | Kdenlive |
| Experience Cloud/Manager | No — enterprise cloud platform | CMS/marketing-campaign management | WordPress |
| Connect | Yes (web/desktop client) | Webinars, virtual classrooms | Jitsi Meet |
| ColdFusion | Yes (server software) | Server-side web app platform | Node.js |
| RoboHelp / FrameMaker | Yes | Authoring technical docs/help manuals | Sphinx |
| Captivate | Yes | Building interactive eLearning courses | H5P |