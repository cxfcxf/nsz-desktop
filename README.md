# NSZ Desktop

Modern desktop GUI for [nsz](https://github.com/nicoboss/nsz) — compress and decompress Nintendo Switch game files (NSP, XCI, NSZ, XCZ, NCZ).

Built with Electron + React + Vite.

## Screenshots

> TODO

## Prerequisites

Download the `nsz_vXXX_win64_portable` directory from [NSZ GitHub Releases](https://github.com/nicoboss/nsz/releases). NSZ Desktop is a standalone GUI that calls `nsz.exe` from that portable distribution.

## Download

Grab the latest release from the [Releases](https://github.com/cxfcxf/nsz-desktop/releases) page:

| Asset | Description |
|-------|-------------|
| `NSZ-Desktop-Portable.exe` | Single-file portable executable, no installation needed |
| `NSZ-Desktop-Setup.exe` | Windows installer |
| `win-unpacked.zip` | Unpacked app directory |
| `Source code` | Source archive |

## Usage

1. Run `NSZ-Desktop-Portable.exe` (or install via Setup)
2. On first launch, select the folder containing `nsz.exe` (the `nsz_vXXX_win64_portable` directory)
3. Use the sidebar to navigate between Compress, Decompress, File Info, and Settings

## Features

- Compress NSP/XCI to NSZ/XCZ format
- Decompress NSZ/XCZ/NCZ back to NSP/XCI
- View file info for any Switch game file
- Drag & drop file support
- Real-time progress and output console
- Configurable compression options (level, threads, block mode, etc.)
- Settings persistence across sessions

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
