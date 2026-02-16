# NSZ Desktop

Modern desktop GUI for Nintendo Switch game file operations — compress, decompress, and merge game files (NSP, XCI, NSZ, XCZ, NCZ).

Built with Electron + React + Vite.

## Features

- **Compress** NSP/XCI to NSZ/XCZ format
- **Decompress** NSZ/XCZ/NCZ back to NSP/XCI
- **Merge** base game (XCI/NSP) + updates + DLCs into a single XCI or NSP
- **File Info** viewer for any Switch game file
- Drag & drop file support
- Real-time progress bar and output console
- Configurable compression options (level, threads, block mode, etc.)
- Settings persistence across sessions

## Prerequisites

Place your `prod.keys` (or `keys.txt`) file in the `tools/` directory next to the bundled executables. This file contains your Switch console's encryption keys and is required for all operations.

```
tools/
  nsz.exe        (included)
  squirrel.exe   (included)
  prod.keys      <-- you provide this
```

## Download

Grab the latest release from the [Releases](https://github.com/cxfcxf/nsz-desktop/releases) page:

| Asset | Description |
|-------|-------------|
| `NSZ-Desktop-Portable.exe` | Single-file portable executable |
| `NSZ-Desktop-Setup.exe` | Windows installer |

## Usage

1. Run the app
2. On first launch, place your `prod.keys` in the `tools/` directory when prompted
3. Use the sidebar to navigate between Compress, Decompress, Merge, File Info, and Settings

## Building the Tool Executables

The `tools/` directory contains pre-built `nsz.exe` and `squirrel.exe`. If you need to rebuild them from source:

### nsz.exe

Built from [cxfcxf/nsz](https://github.com/cxfcxf/nsz) (branch: `fixes`).

```bash
git clone -b fixes git@github.com:cxfcxf/nsz.git
cd nsz
python -m venv venv
venv\Scripts\activate
pip install pycryptodome zstandard enlighten pyinstaller
pyinstaller --onefile --name nsz --paths nsz --hidden-import nsz --hidden-import nsz.Fs --hidden-import nsz.nut --hidden-import nsz.gui nsz.py
# Output: dist/nsz.exe
```

### squirrel.exe

Built from [cxfcxf/NSC_BUILDER](https://github.com/cxfcxf/NSC_BUILDER) (branch: `fixes`).

```bash
git clone -b fixes git@github.com:cxfcxf/NSC_BUILDER.git
cd NSC_BUILDER/py/ztools
python -m venv venv
venv\Scripts\activate
pip install wheel urllib3 unidecode tqdm beautifulsoup4 requests pycryptodome zstandard colorama Pillow chardet pykakasi googletrans legacy-cgi pywin32 pyinstaller
pyinstaller --onefile --name squirrel --paths lib --paths . --add-data "lib;lib" --add-data "Fs;Fs" --add-data "nutFs;nutFs" squirrel.py
# Output: dist/squirrel.exe
```

Copy both executables into the `tools/` directory of this project.

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
