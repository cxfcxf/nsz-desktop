const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// Operations that accept only one file per invocation in nscb_rust
const SINGLE_FILE_OPS = new Set(['compress', 'decompress', 'convert', 'split']);

class NszRunner extends EventEmitter {
    constructor(nszDir) {
        super();
        this.process = null;
        this.nszDir = nszDir;
        this.exePath = nszDir ? path.join(nszDir, 'nscb_rust.exe') : null;
        this.currentOperation = null;
    }

    setNszDir(nszDir) {
        this.nszDir = nszDir;
        this.exePath = path.join(nszDir, 'nscb_rust.exe');
    }

    static validateNszDir(dirPath) {
        return fs.existsSync(path.join(dirPath, 'nscb_rust.exe'));
    }

    /**
     * Resolve the keys file path from the tools directory.
     * Returns the path if found, null otherwise.
     */
    _resolveKeysPath() {
        if (!this.nszDir) return null;
        const prodKeys = path.join(this.nszDir, 'prod.keys');
        if (fs.existsSync(prodKeys)) return prodKeys;
        const keysTxt = path.join(this.nszDir, 'keys.txt');
        if (fs.existsSync(keysTxt)) return keysTxt;
        return null;
    }

    _buildArgs(operation, files, options = {}) {
        const args = [];

        switch (operation) {
            case 'compress':
                args.push('-z', ...files);
                if (options.level != null) {
                    args.push('--level', String(options.level));
                }
                break;
            case 'decompress':
                args.push('--decompress', ...files);
                break;
            case 'merge':
                args.push('-d', ...files);
                if (options.format) {
                    args.push('-t', options.format);
                }
                if (options.nodelta) {
                    args.push('-n');
                }
                break;
            case 'convert':
                args.push('-c', ...files);
                if (options.format) {
                    args.push('-t', options.format);
                }
                break;
            case 'split':
                args.push('--splitter', ...files);
                break;
            case 'create': {
                // files[0] is the input folder (split output); derive NSP output path
                const folderName = path.basename(files[0]);
                const outDir = options.output || path.dirname(files[0]);
                const outNsp = path.join(outDir, `${folderName}.nsp`);
                args.push('--create', outNsp, '--ifolder', files[0]);
                break;
            }
        }

        // Output directory (not used for 'create' — embedded in --create arg)
        if (operation !== 'create') {
            if (options.output) {
                args.push('-o', options.output);
            } else if (files.length > 0) {
                args.push('-o', path.dirname(files[0]));
            }
        }

        if (options.buffer) {
            args.push('-b', String(options.buffer));
        }

        // Auto-resolve keys
        const keysPath = this._resolveKeysPath();
        if (keysPath) {
            args.push('--keys', keysPath);
        }

        return args;
    }

    run(operation, files, options = {}) {
        if (this.process) {
            this.emit('nsz-error', { op: operation, message: `A process is already running (${this.currentOperation})` });
            return;
        }
        if (!this.exePath) {
            this.emit('nsz-error', { op: operation, message: 'nscb_rust.exe path not configured. Please set the tools directory in Settings.' });
            return;
        }

        this.currentOperation = operation;

        // Single-file operations (compress/decompress/convert/split) accept one file
        // per invocation — batch them sequentially if multiple files are provided.
        const batches = SINGLE_FILE_OPS.has(operation) && files.length > 1
            ? files.map(f => [f])
            : [files];

        let batchIdx = 0;

        const spawnNext = () => {
            if (batchIdx >= batches.length) {
                this.currentOperation = null;
                this.emit('progress', { op: operation, percent: 100, message: 'Done!' });
                this.emit('done', { op: operation, code: 0 });
                return;
            }

            const currentFiles = batches[batchIdx];
            if (batches.length > 1) {
                this.emit('output', {
                    op: operation,
                    line: `[File ${batchIdx + 1}/${batches.length}] ${path.basename(currentFiles[0])}`,
                });
            }
            batchIdx++;

            const args = this._buildArgs(operation, currentFiles, options);
            this.emit('log', `Running: ${this.exePath} ${args.join(' ')}`);
            this.emit('output', { op: operation, line: `> ${this.exePath} ${args.join(' ')}` });

            this.process = spawn(this.exePath, args, {
                cwd: this.nszDir,
                windowsHide: true,
            });

            this.process.stdout.on('data', (data) => {
                const lines = data.toString('utf-8').split(/[\r\n]+/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        this.emit('output', { op: operation, line: trimmed });
                        this._parseLine(operation, trimmed);
                    }
                }
            });

            this.process.stderr.on('data', (data) => {
                const clean = data.toString('utf-8')
                    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                    .replace(/\x1b\][^\x07]*\x07/g, '');
                this._parseStderrChunk(operation, clean);
            });

            this.process.on('close', (code) => {
                this.process = null;
                if (code !== 0) {
                    this.currentOperation = null;
                    this.emit('done', { op: operation, code });
                    return;
                }
                setImmediate(spawnNext);
            });

            this.process.on('error', (err) => {
                this.process = null;
                this.currentOperation = null;
                this.emit('nsz-error', { op: operation, message: `Failed to start nscb_rust.exe: ${err.message}` });
            });
        };

        spawnNext();
    }

    _parseLine(op, line) {
        // Percentage progress from stdout
        const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
            this.emit('progress', {
                op,
                percent: parseFloat(percentMatch[1]),
                message: line,
            });
            return;
        }

        // Status lines like [ACTION] detail
        const actionMatch = line.match(/^\[(\w+)\s*(?:\w*)\]\s*(.*)/);
        if (actionMatch) {
            this.emit('status', {
                op,
                action: actionMatch[1],
                detail: actionMatch[2],
            });
            return;
        }

        if (line.includes('Done!') || line.includes('done!')) {
            this.emit('progress', { op, percent: 100, message: 'Done!' });
            return;
        }

        // Error detection
        if (line.toLowerCase().includes('error')) {
            this.emit('nsz-error', { op, message: line });
            return;
        }
    }

    /**
     * Parse indicatif progress output from stderr.
     * indicatif outputs a continuous stream with no CR/LF -- just space-padded
     * overwrites. We regex-match the latest progress values from each chunk.
     *
     * Formats:
     *   "Compressing NCAs [====>---] 1.00 MiB/3.55 GiB (516 MiB/s, 7s)"
     *   "Merging NCAs [====>---] 5/12"
     */
    _parseStderrChunk(op, text) {
        if (text.toLowerCase().includes('error:')) {
            const errorMatch = text.match(/error:\s*(.+?)(?:\s{2,}|$)/i);
            if (errorMatch) {
                this.emit('nsz-error', { op, message: errorMatch[1].trim() });
            }
            return;
        }

        const label = this._extractLabel(text);

        // indicatif byte progress: "X.XX MiB/Y.YY GiB" or "X B/Y B" etc.
        const UNITS = { 'B': 1, 'KiB': 1024, 'MiB': 1048576, 'GiB': 1073741824 };
        const byteMatch = NszRunner._lastMatch(
            /(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB)/g,
            text,
        );
        if (byteMatch) {
            const current = parseFloat(byteMatch[1]) * UNITS[byteMatch[2]];
            const total = parseFloat(byteMatch[3]) * UNITS[byteMatch[4]];
            if (total > 0) {
                this.emit('progress', {
                    op,
                    percent: Math.round(Math.min(99, (current / total) * 100) * 10) / 10,
                    message: `${label}... ${byteMatch[1]} ${byteMatch[2]} / ${byteMatch[3]} ${byteMatch[4]}`,
                });
            }
            return;
        }

        // indicatif item progress: "5/12" (pos/len)
        const itemMatch = NszRunner._lastMatch(/(\d+)\s*\/\s*(\d+)/g, text);
        if (itemMatch) {
            const pos = parseInt(itemMatch[1]);
            const len = parseInt(itemMatch[2]);
            if (len > 0 && pos <= len) {
                this.emit('progress', {
                    op,
                    percent: Math.round(Math.min(99, (pos / len) * 100) * 10) / 10,
                    message: `${label}... ${pos} / ${len}`,
                });
            }
            return;
        }
    }

    _extractLabel(text) {
        const match = text.match(/([A-Z][a-z]+(?:\s+\w+)*)\s*\[/);
        return match ? match[1] : 'Processing';
    }

    static _lastMatch(regex, text) {
        let last = null;
        let m;
        while ((m = regex.exec(text)) !== null) {
            last = m;
        }
        return last;
    }

    cancel() {
        if (this.process) {
            this.process.kill('SIGTERM');
            setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                    this.process = null;
                    this.currentOperation = null;
                }
            }, 3000);
            this.emit('cancelled');
        }
    }

    isRunning() {
        return this.process !== null;
    }
}

module.exports = NszRunner;
