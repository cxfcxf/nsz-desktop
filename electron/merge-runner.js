const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

class MergeRunner extends EventEmitter {
    constructor(nszDir) {
        super();
        this.process = null;
        this.nszDir = nszDir;
        this.squirrelPath = nszDir ? path.join(nszDir, 'squirrel.exe') : null;
        this._tmpFile = null;
        this._appendedFiles = 0;
        this._phase = '';
    }

    setNszDir(nszDir) {
        this.nszDir = nszDir;
        this.squirrelPath = path.join(nszDir, 'squirrel.exe');
    }

    static validateSquirrel(dirPath) {
        return fs.existsSync(path.join(dirPath, 'squirrel.exe'));
    }

    /**
     * Start a merge operation.
     * @param {string[]} files - Input file paths (XCI, NSP)
     * @param {object} options - { output: string, format: 'xci'|'nsp' }
     */
    run(files, options = {}) {
        if (this.process) {
            this.emit('merge-error', 'A merge process is already running');
            return;
        }
        if (!this.squirrelPath) {
            this.emit('merge-error', 'squirrel.exe not found. Place it next to nsz.exe in the tools directory.');
            return;
        }
        if (!fs.existsSync(this.squirrelPath)) {
            this.emit('merge-error', `squirrel.exe not found at: ${this.squirrelPath}`);
            return;
        }

        const outputDir = options.output || path.dirname(files[0]);
        const format = options.format || 'xci';

        // Reset progress tracking
        this._appendedFiles = 0;
        this._phase = 'calculating';

        // Write temp filelist
        this._tmpFile = path.join(os.tmpdir(), `nsz-merge-${Date.now()}.txt`);
        fs.writeFileSync(this._tmpFile, files.join('\n'), 'utf-8');

        const args = [
            '-dmul', 'calculate',
            '-tfile', this._tmpFile,
            '-t', format,
            '-o', outputDir,
            '-b', '65536',
        ];

        this.emit('log', `Running: ${this.squirrelPath} ${args.join(' ')}`);
        this.emit('merge-status', { action: 'START', detail: `Merging ${files.length} files into ${format.toUpperCase()}...` });
        this.emit('merge-progress', { percent: 0, message: 'Calculating final content...' });

        this.process = spawn(this.squirrelPath, args, {
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

            const lines = stdoutBuffer.split(/[\r\n]+/);
            stdoutBuffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    this._parseLine(trimmed);
                }
            }
        });

        let stderrBuffer = '';

        this.process.stderr.on('data', (data) => {
            const text = data.toString('utf-8');
            const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
            stderrBuffer += clean;

            const segments = stderrBuffer.split(/[\r\n]+/);
            stderrBuffer = segments.pop();

            for (const seg of segments) {
                const trimmed = seg.trim();
                if (!trimmed) continue;
                const tqdmMatch = trimmed.match(/\s*(\d+)%\|/);
                if (tqdmMatch) {
                    const tqdmPercent = parseInt(tqdmMatch[1]);
                    // Map tqdm 0-100% to our 10-98% range (headers before, finalize after)
                    const mapped = 10 + (tqdmPercent * 0.88);
                    this.emit('merge-progress', {
                        percent: Math.min(98, Math.round(mapped * 10) / 10),
                        message: `Writing output... ${tqdmPercent}%`,
                    });
                    continue;
                }
                this.emit('log', `[stderr] ${trimmed}`);
            }
        });

        this.process.on('close', (code) => {
            if (stdoutBuffer.trim()) {
                this._parseLine(stdoutBuffer.trim());
            }
            this.process = null;
            this._cleanup();
            if (code === 0) {
                this.emit('merge-progress', { percent: 100, message: 'Merge complete!' });
            }
            this.emit('merge-done', { code });
        });

        this.process.on('error', (err) => {
            this.process = null;
            this._cleanup();
            this.emit('merge-error', `Failed to start squirrel.exe: ${err.message}`);
        });
    }

    _parseLine(line) {
        this.emit('merge-output', line);

        if (line.includes('Calculating final content')) {
            this._phase = 'calculating';
            this.emit('merge-progress', { percent: 2, message: 'Calculating final content...' });
            return;
        }

        if (line.startsWith('Filename:')) {
            this._phase = 'writing';
            const name = line.replace('Filename:', '').trim();
            this.emit('merge-progress', { percent: 5, message: `Output: ${name}` });
            return;
        }

        if (line.includes('Writing XCI header') || line.includes('Writing NSP header')) {
            this.emit('merge-progress', { percent: 8, message: line.replace(/^[\s\-*]+/, '') });
            return;
        }
        if (line.includes('Writing') && (line.includes('partition') || line.includes('certificate') || line.includes('game info') || line.includes('ROOT HFS0'))) {
            this.emit('merge-progress', { percent: 10, message: line.replace(/^[\s\-*]+/, '') });
            return;
        }

        if (line.includes('Appending:')) {
            this._appendedFiles++;
            const fileName = line.replace(/^[\s\-*]*Appending:\s*/, '').trim();
            const shortName = fileName.split(/[/\\]/).pop();
            // We don't know total in advance, so estimate based on appended count
            // Cap at 95% to leave room for finalization
            const estimatedPercent = Math.min(95, 10 + (this._appendedFiles * 8));
            this.emit('merge-progress', {
                percent: estimatedPercent,
                message: `Appending: ${shortName}`,
            });
            return;
        }

        const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
            const pct = parseFloat(percentMatch[1]);
            const mapped = 10 + (pct * 0.85);
            this.emit('merge-progress', {
                percent: Math.round(mapped * 10) / 10,
                message: `Writing output... ${Math.round(pct)}%`,
            });
            return;
        }

        const actionMatch = line.match(/^\[(\w+)\s*(?:\w*)\]\s*(.*)/);
        if (actionMatch) {
            this.emit('merge-status', {
                action: actionMatch[1],
                detail: actionMatch[2],
            });
            return;
        }

        if (line.includes('Done!') || line.includes('done!')) {
            this.emit('merge-progress', { percent: 100, message: 'Done!' });
            return;
        }

        if (line.toLowerCase().includes('error') || line.toLowerCase().includes('traceback')) {
            this.emit('merge-error', line);
            return;
        }
    }

    _cleanup() {
        if (this._tmpFile && fs.existsSync(this._tmpFile)) {
            try { fs.unlinkSync(this._tmpFile); } catch (_) {}
            this._tmpFile = null;
        }
    }

    cancel() {
        if (this.process) {
            this.process.kill('SIGTERM');
            setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                    this.process = null;
                }
            }, 3000);
            this._cleanup();
            this.emit('merge-cancelled');
        }
    }

    isRunning() {
        return this.process !== null;
    }
}

module.exports = MergeRunner;
