# NSCB Desktop

Modern desktop GUI for Nintendo Switch game file operations: compress, decompress, merge, convert, split, and repack (NSP, XCI, NSZ, XCZ, NCZ).

Built with Tauri v2 + React + Vite. Powered by [nscb_rust](https://github.com/cxfcxf/nscb_rust).

## Features

- Compress NSP/XCI to NSZ/XCZ (zstd level 1-22)
- Decompress NSZ/XCZ/NCZ back to NSP/XCI
- Merge base + update + DLC into one NSP/XCI
- Convert between NSP and XCI
- Split multi-title files into per-title folders
- Create/Repack NSP from split folders
- Drag & drop file input
- Live output console + progress tracking
- Batch support for compress/decompress/convert/split
- Dark theme UI with SVG iconography and file type badges
- First-launch setup wizard with import checklist

## Prerequisites

- Windows 10/11
- WebView2 runtime
- Switch keys file (`prod.keys` or `keys.txt`)
- `nscb_rust.exe` backend binary (imported during setup)

## Usage

1. Run `nscb-desktop.exe` directly (standalone, no install needed), or use the NSIS/MSI installer.
2. The setup wizard will prompt you to import:
   - **Encryption keys** (`prod.keys` or `keys.txt`) — each item shows a checkmark once imported
   - **Backend binary** (`nscb_rust.exe`)
3. Files are copied to a temporary tools directory (`%TEMP%\nscb-desktop-tools`).
4. Pick an operation from the sidebar and drop your files.

## Development

Requires [Rust](https://rustup.rs) + [Node.js](https://nodejs.org) (v18+).

```bash
npm install
npm run dev        # Tauri dev mode (hot reload)
npm run dev:vite   # Vite dev server only (no Tauri)
```

## Build

```bash
# NSIS installer
npm run build

# Portable folder at release/NSCB Desktop/
npm run dist:portable
```

## Project Layout

```text
nscb-desktop/
|- ui/                     # Frontend (React + TypeScript)
|  |- App.tsx              # All components + pages (config-driven)
|  |- App.css              # Dark theme design system
|  |- main.tsx             # Entry point
|  `- lib/
|     |- api.ts            # Tauri plugin wrappers
|     `- nscb-runner.ts     # Sidecar process + progress parsing
|- src-tauri/              # Tauri v2 / Rust backend
|  |- src/lib.rs           # Commands: run_nscb, import_keys, etc.
|  |- tauri.conf.json      # Window config, sidecar, bundling
|  `- capabilities/        # Security permissions
`- scripts/portable.mjs    # Portable folder assembly
```

## Notes

- Operation pages are config-driven via a generic `OperationPage` component — adding a new operation only requires a config object.
- Backend and key files are imported at runtime into `%TEMP%\nscb-desktop-tools`.
- The app uses native window decorations (no custom titlebar).

## License

ISC
