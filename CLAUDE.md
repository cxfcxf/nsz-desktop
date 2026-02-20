# CLAUDE.md

## Project Overview

NSZ Desktop is a Tauri v2 + React + Vite desktop app for Nintendo Switch file operations (compress, decompress, merge, convert, split, repack). The Rust backend is minimal — it only registers Tauri plugins. All application logic lives in frontend TypeScript.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Tauri v2 (WebView2 on Windows)
- **Backend binary**: `tools/nscb_rust.exe` — external Rust CLI tool, spawned as a Tauri sidecar
- **No external JS libraries** beyond React and Tauri plugins

## Key Architecture Decisions

- All runner logic (arg building, progress parsing, batching) is in `src/lib/nsz-runner.ts`, NOT in Rust
- `nscb_rust.exe` is bundled as a Tauri sidecar via `bundle.externalBin` in `tauri.conf.json`
- `build.rs` auto-creates the platform-suffixed sidecar copy from `tools/nscb_rust.exe` — the user only maintains the plain exe
- Settings stored in the OS app data dir via `@tauri-apps/plugin-fs`
- Drag-and-drop uses Tauri's `onDragDropEvent` (not HTML5 dataTransfer)
- The app uses native window decorations (no custom titlebar)

## File Structure

| Path | Purpose |
|---|---|
| `src/App.tsx` | All React components and pages (~1100 lines, single file) |
| `src/App.css` | Dark theme design system with CSS variables |
| `src/lib/api.ts` | Tauri plugin wrappers — dialogs, settings, keys import |
| `src/lib/nsz-runner.ts` | Spawns nscb_rust sidecar, parses stdout/stderr for progress |
| `src-tauri/src/lib.rs` | Registers 4 plugins: shell, dialog, fs, opener |
| `src-tauri/tauri.conf.json` | Window size, sidecar config, resource bundling |
| `src-tauri/capabilities/default.json` | Security permissions for shell/dialog/fs/opener |
| `src-tauri/build.rs` | Copies `nscb_rust.exe` → `nscb_rust-{triple}.exe` for sidecar |
| `tools/nscb_rust.exe` | The actual backend binary (not written by us) |
| `scripts/portable.mjs` | Post-build script to assemble portable folder |

## Commands

```bash
npm run dev            # Tauri dev mode (hot reload)
npm run build          # Production build (NSIS installer)
npm run dist:portable  # Build + assemble portable folder in release/
npm run dev:vite       # Vite dev server only (no Tauri)
npm run build:vite     # Vite production build only
```

## nscb_rust Operations

The sidecar `nscb_rust.exe` accepts these CLI patterns:

| Operation | Args |
|---|---|
| Compress | `-z <file> [--level N] [-o dir] [--keys path]` |
| Decompress | `--decompress <file> [-o dir] [--keys path]` |
| Merge | `-d <files...> [-t xci\|nsp] [-n] [-o dir] [--keys path]` |
| Convert | `-c <file> [-t xci\|nsp] [-o dir] [--keys path]` |
| Split | `--splitter <file> [-o dir] [--keys path]` |
| Create | `--create <out.nsp> --ifolder <dir> [--keys path]` |

Single-file ops (compress, decompress, convert, split) accept one file per invocation — the runner batches them sequentially for multiple files.

## Progress Parsing

`nsz-runner.ts` parses two output streams:
- **stdout**: percentage (`XX%`), status lines (`[ACTION] detail`), error/done detection
- **stderr**: indicatif progress bars — byte progress (`X.XX MiB/Y.YY GiB`) and item progress (`5/12`), with ANSI escape stripping

## Common Patterns

- All pages follow the same structure: `useFileList()` + `useRunnerEvents(op)` + `useOutputDir()` hooks
- Runner is a singleton (`getRunner()`) with a typed event emitter
- The `DropZone` component handles both Tauri drag-drop events and click-to-browse via dialog
- Encryption keys (`prod.keys` / `keys.txt`) must exist in the tools dir — auto-resolved by the runner and passed via `--keys`
