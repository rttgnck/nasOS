nasOS Connect — a macOS menu bar app at nasos-menubar/

Structure:

nasos-menubar/
├── assets/
│   ├── nasos-logo.svg           # Source SVG (nasOS branding)
│   ├── trayIconTemplate.png     # 16×16 tray icon (generated)
│   ├── trayIconTemplate@2x.png  # 32×32 Retina tray icon (generated)
│   ├── icon.png                 # 512×512 app icon (generated)
│   └── icon.icns                # macOS .icns bundle (generated)
├── src/
│   ├── main.js                  # Main process: tray, windows, auto-launch, status polling
│   ├── settings.html            # Connection settings UI (dark themed, matches nasOS)
│   └── settings-preload.js      # IPC bridge for settings window
├── scripts/
│   └── generate-icons.js        # Converts SVG → tray PNGs + .icns via sharp/iconutil
├── package.json                 # Build scripts, electron-builder config
└── .gitignore

Key features:
- Menu bar only — no dock icon (LSUIElement: true, app.dock.hide())
- Tray dropdown menu with connection status (polls every 30s via TCP), host info, "Open nasOS" (in-app window), "Open in Browser", connection settings, and "Start at Login" toggle
- Double-click tray opens the nasOS desktop window
- Auto-start at login via app.setLoginItemSettings with openAsHidden: true
- Single instance lock — launching again focuses the existing instance
- Window hides on close (Cmd+W) instead of quitting, so it re-opens instantly
- Configurable host/port — defaults to nasos.local:8080, persisted in ~/Library/Application Support/nasos-connect/config.json
- macOS template tray icon — auto-adapts to light/dark mode
- HiddenInset title bar on the main window for a modern macOS look

Commands:
npm run dev	                Launch in dev mode
npm run build	            Generate icons + build .app + DMG
npm run dist	            Full distribution build (DMG + ZIP)
npm run generate-icons	    Regenerate icons from SVG

The build produces dist/nasOS Connect-1.0.0-arm64.dmg