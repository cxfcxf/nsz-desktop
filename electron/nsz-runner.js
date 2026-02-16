const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class NszRunner extends EventEmitter {
    constructor(nszDir) {
        super();
        this.process = null;
        this.nszDir = nszDir;
        this.nszPath = nszDir ? path.join(nszDir, 'nsz.exe') : null;

        // File-size progress monitoring (for decompression)
        this._outputFilePath = null;
        this._expectedTotalSize = 0;
        this._progressInterval = null;
    }

    setNszDir(nszDir) {
        this.nszDir = nszDir;
        this.nszPath = path.join(nszDir, 'nsz.exe');
    }

    static validateNszDir(dirPath) {
        // Check if the directory contains both nsz.exe and squirrel.exe
        return fs.existsSync(path.join(dirPath, 'nsz.exe')) &&
               fs.existsSync(path.join(dirPath, 'squirrel.exe'));
    }

    _buildArgs(operation, files, options = {}) {
        const args = [];

        // Operation flag
        switch (operation) {
            case 'compress':
                args.push('-C');
                break;
            case 'decompress':
                args.push('-D');
                break;
            case 'info':
                args.push('-i');
                break;
            case 'extract':
                args.push('-x');
                break;
        }

        // Compression options
        if (options.level != null) {
            args.push('-l', String(options.level));
        }
        if (options.threads != null) {
            args.push('-t', String(options.threads));
        }
        if (options.block) args.push('-B');
        if (options.solid) args.push('-S');
        if (options.long) args.push('-L');
        if (options.verify) args.push('-V');
        if (options.quickVerify) args.push('-Q');
        if (options.keep) args.push('-K');
        if (options.fixPadding) args.push('-F');
        if (options.overwrite) args.push('-w');
        if (options.rmOldVersion) args.push('-r');
        if (options.rmSource) args.push('--rm-source');
        if (options.parseCnmt) args.push('-p');
        if (options.multi) args.push('-m', String(options.multi));

        if (options.blockSize) {
            args.push('-s', String(options.blockSize));
        }

        if (options.output) {
            args.push('-o', options.output);
        }

        if (options.depth) {
            args.push('--depth', String(options.depth));
        }

        if (options.extractRegex) {
            args.push('--extractregex', options.extractRegex);
        }

        // Files
        args.push(...files);

        return args;
    }

    run(operation, files, options = {}) {
        if (this.process) {
            this.emit('error', 'A process is already running');
            return;
        }
        if (!this.nszPath) {
            this.emit('error', 'nsz.exe path not configured. Please set the NSZ directory in Settings.');
            return;
        }

        // Reset file monitoring state
        this._outputFilePath = null;
        this._expectedTotalSize = 0;
        this._stopFileProgressMonitor();

        const args = this._buildArgs(operation, files, options);

        this.emit('log', `Running: ${this.nszPath} ${args.join(' ')}`);

        this.process = spawn(this.nszPath, args, {
            cwd: this.nszDir,
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
                PYTHONUNBUFFERED: '1',
            },
        });

        let stdoutBuffer = '';

        this.process.stdout.on('data', (data) => {
            const text = data.toString('utf-8');
            stdoutBuffer += text;

            // Process complete lines (split on both \n and \r)
            const lines = stdoutBuffer.split(/[\r\n]+/);
            stdoutBuffer = lines.pop(); // keep incomplete line in buffer

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    this._parseLine(trimmed);
                }
            }
        });

        this.process.stderr.on('data', (data) => {
            const text = data.toString('utf-8');
            // Strip ANSI escape codes
            const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
            const segments = clean.split(/[\r\n]+/);
            for (const seg of segments) {
                const trimmed = seg.trim();
                if (!trimmed) continue;
                this.emit('log', `[stderr] ${trimmed}`);
            }
        });

        this.process.on('close', (code) => {
            this._stopFileProgressMonitor();
            // Flush remaining buffer
            if (stdoutBuffer.trim()) {
                this._parseLine(stdoutBuffer.trim());
            }
            this.process = null;
            this.emit('done', { code });
        });

        this.process.on('error', (err) => {
            this._stopFileProgressMonitor();
            this.process = null;
            this.emit('error', `Failed to start nsz.exe: ${err.message}`);
        });
    }

    _parseLine(line) {
        this.emit('output', line);

        // Detect "[ADDING]" lines to calculate expected output file size
        // Pattern: "[ADDING]     filename 0xSIZE bytes to PFS0 at 0xOFFSET"
        const addingMatch = line.match(/^\[ADDING\s*\]\s+\S+\s+0x([0-9a-fA-F]+)\s+bytes/);
        if (addingMatch) {
            const size = parseInt(addingMatch[1], 16);
            this._expectedTotalSize += size;
            this.emit('status', { action: 'ADDING', detail: line });
            return;
        }

        // Detect "Decompressing X -> Y" to get the output file path
        const decompressMatch = line.match(/^Decompressing\s+.+\s+->\s+(.+)$/);
        if (decompressMatch) {
            this._outputFilePath = decompressMatch[1].trim();
            this.emit('status', { action: 'DECOMPRESS', detail: line });
            // Start file monitoring after a short delay (file needs to be created)
            setTimeout(() => this._startFileProgressMonitor(), 1000);
            return;
        }

        // Detect progress patterns from nsz output (percentage text)
        const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
            this.emit('progress', {
                percent: parseFloat(percentMatch[1]),
                message: line,
            });
            return;
        }

        // Pattern: "[VERIFY ...], [OPEN ...], [EXISTS ...], etc."
        const actionMatch = line.match(/^\[(\w+)\s*(?:\w*)\]\s*(.*)/);
        if (actionMatch) {
            this.emit('status', {
                action: actionMatch[1],
                detail: actionMatch[2],
            });
            return;
        }

        // Pattern: "Done!"
        if (line.includes('Done!')) {
            this._stopFileProgressMonitor();
            this.emit('progress', { percent: 100, message: 'Done!' });
            return;
        }

        // Error detection
        if (line.toLowerCase().includes('error') || line.includes('BAD VERIFY')) {
            this.emit('nsz-error', line);
            return;
        }

        // Info output (for -i flag)
        this.emit('info-line', line);
    }

    _startFileProgressMonitor() {
        if (this._progressInterval) return;
        if (!this._outputFilePath || this._expectedTotalSize === 0) return;

        this.emit('log', `Monitoring file progress: ${this._outputFilePath} (expected ~${Math.round(this._expectedTotalSize / 1048576)} MiB)`);

        this._progressInterval = setInterval(() => {
            try {
                const stats = fs.statSync(this._outputFilePath);
                const currentSize = stats.size;
                const percent = Math.min(99, (currentSize / this._expectedTotalSize) * 100);
                const currentMiB = Math.round(currentSize / 1048576);
                const totalMiB = Math.round(this._expectedTotalSize / 1048576);
                this.emit('progress', {
                    percent: Math.round(percent * 10) / 10,
                    message: `Decompressing... ${currentMiB} / ${totalMiB} MiB`,
                });
            } catch (e) {
                // File might not exist yet or be locked — that's fine
            }
        }, 500);
    }

    _stopFileProgressMonitor() {
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
            this._progressInterval = null;
        }
    }

    cancel() {
        if (this.process) {
            this._stopFileProgressMonitor();
            this.process.kill('SIGTERM');
            // Force kill after 3 seconds if still alive
            setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                    this.process = null;
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
