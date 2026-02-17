# NSZ Desktop

Modern desktop GUI for Nintendo Switch game file operations — compress, decompress, merge, convert, split, and trim game files (NSP, XCI, NSZ, XCZ, NCZ).

Built with Electron + React + Vite. Powered by [nscb_rust](https://github.com/cxfcxf/nscb_rust).

## Features

- **Compress** NSP/XCI to NSZ/XCZ format (configurable zstd level 1-22)
- **Decompress** NSZ/XCZ/NCZ back to NSP/XCI
- **Merge** base game + updates + DLCs into a single XCI or NSP
- **Convert** between NSP and XCI formats
- **Split** multi-title files into separate files by title ID (CNMT-aware naming)
- **XCI Trim** — trim, super-trim, or untrim XCI cartridge files
- Drag & drop file support
- Real-time progress bar and output console
- Settings persistence across sessions

## Prerequisites

You need your Switch console's encryption keys (`prod.keys` or `keys.txt`). On first launch, the app will prompt you to select your keys file.

## Download

Grab the latest release from the [Releases](https://github.com/cxfcxf/nsz-desktop/releases) page:

| Asset | Description |
|-------|-------------|
| `NSZ-Desktop-Portable.exe` | Single-file portable executable |
| `NSZ-Desktop-Setup.exe` | Windows installer |

## Usage

1. Run the app
2. On first launch, the setup wizard will prompt you to select your `prod.keys` file
3. Use the sidebar to navigate between Compress, Decompress, Merge, Convert, Split, XCI Trim, and Settings

## Backend

The `tools/` directory contains `nscb_rust.exe`, a single Rust-native binary that handles all operations. Built from [cxfcxf/nscb_rust](https://github.com/cxfcxf/nscb_rust).

To update the backend, download the latest release from [nscb_rust releases](https://github.com/cxfcxf/nscb_rust/releases) and replace `tools/nscb_rust.exe`.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist
```

Outputs to `release/` directory.

## License

ISC
