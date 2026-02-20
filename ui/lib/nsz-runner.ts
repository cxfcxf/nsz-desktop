import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface RunnerEvent {
    progress: { op: string; percent: number; message: string };
    output: { op: string; line: string };
    status: { op: string; action: string; detail: string };
    done: { op: string; code: number };
    'nsz-error': { op: string; message: string };
    log: string;
}

type EventName = keyof RunnerEvent;
type Listener<K extends EventName> = (data: RunnerEvent[K]) => void;

class Emitter {
    private listeners = new Map<string, Set<Function>>();

    on<K extends EventName>(event: K, fn: Listener<K>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(fn);
        return () => { this.listeners.get(event)?.delete(fn); };
    }

    emit<K extends EventName>(event: K, data: RunnerEvent[K]): void {
        this.listeners.get(event)?.forEach(fn => fn(data));
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }
}

const SINGLE_FILE_OPS = new Set(['compress', 'decompress', 'convert', 'split']);

type StdoutPayload = { op: string; line: string };
type StderrPayload = { op: string; chunk: string };
type DonePayload = { op: string; code: number };

export class NszRunner extends Emitter {
    private childProcess: { kill: () => Promise<void> } | null = null;
    private toolsDir: string | null = null;
    currentOperation: string | null = null;
    private cancelled = false;
    private _ready = false;
    private lastOutputLine = '';
    private backendUnlisten: UnlistenFn[] = [];
    private doneResolver: ((code: number) => void) | null = null;
    private initPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this._ready) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
        try {
            this.toolsDir = await invoke<string>('get_tools_dir');
        } catch {
            this.toolsDir = 'tools';
        }

        if (this.backendUnlisten.length === 0) {
            this.backendUnlisten.push(await listen<StdoutPayload>('nsz-stdout', (event) => {
                const { op, line } = event.payload;
                this.lastOutputLine = line;
                this.emit('output', { op, line });
                this.parseLine(op, line);
            }));

            this.backendUnlisten.push(await listen<StderrPayload>('nsz-stderr', (event) => {
                const { op, chunk } = event.payload;
                const clean = this.normalizeProgressText(chunk);
                const trimmed = clean.trim();
                if (trimmed) {
                    this.lastOutputLine = trimmed;
                }
                this.parseStderrChunk(op, clean);
            }));

            this.backendUnlisten.push(await listen<DonePayload>('nsz-done', (event) => {
                const { op, code } = event.payload;
                if (this.currentOperation === op) {
                    this.childProcess = null;
                    const resolve = this.doneResolver;
                    this.doneResolver = null;
                    if (resolve) resolve(code);
                }
            }));
        }

        this._ready = true;
        })();

        await this.initPromise;
        this.initPromise = null;
    }

    private normalizeProgressText(text: string): string {
        return text
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    get ready(): boolean {
        return this._ready;
    }

    setNszDir(dir: string): void {
        this.toolsDir = dir;
    }

    private async resolveKeysPath(): Promise<string | null> {
        if (!this.toolsDir) return null;
        try {
            return await join(this.toolsDir, 'prod.keys');
        } catch {
            return null;
        }
    }

    private getBasename(filePath: string): string {
        const parts = filePath.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1];
    }

    private getDirname(filePath: string): string {
        const normalized = filePath.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash >= 0 ? normalized.substring(0, lastSlash) : '.';
    }

    private async buildArgs(operation: string, files: string[], options: Record<string, any> = {}): Promise<string[]> {
        const args: string[] = [];

        switch (operation) {
            case 'compress':
                args.push('-z', ...files);
                if (options.level != null) args.push('--level', String(options.level));
                break;
            case 'decompress':
                args.push('--decompress', ...files);
                break;
            case 'merge':
                args.push('-d', ...files);
                if (options.format) args.push('-t', options.format);
                if (options.nodelta) args.push('-n');
                break;
            case 'convert':
                args.push('-c', ...files);
                if (options.format) args.push('-t', options.format);
                break;
            case 'split':
                args.push('--splitter', ...files);
                break;
            case 'create': {
                const folderName = this.getBasename(files[0]);
                const outDir = options.output || this.getDirname(files[0]);
                const outNsp = `${outDir}/${folderName}.nsp`;
                args.push('--create', outNsp, '--ifolder', files[0]);
                break;
            }
        }

        if (operation !== 'create') {
            if (options.output) {
                args.push('-o', options.output);
            } else if (files.length > 0) {
                args.push('-o', this.getDirname(files[0]));
            }
        }

        if (options.buffer) args.push('-b', String(options.buffer));

        const keysPath = await this.resolveKeysPath();
        if (keysPath) args.push('--keys', keysPath);

        return args;
    }

    private async startBackendRun(operation: string, args: string[]): Promise<number> {
        return await new Promise<number>(async (resolve) => {
            this.doneResolver = resolve;
            this.childProcess = {
                kill: async () => { await invoke('cancel_nscb'); },
            };

            try {
                await invoke('run_nscb', { operation, args });
            } catch (error) {
                this.childProcess = null;
                this.doneResolver = null;
                this.emit('nsz-error', { op: operation, message: `Failed to start nscb_rust: ${String(error)}` });
                resolve(-1);
            }
        });
    }

    async run(operation: string, files: string[], options: Record<string, any> = {}): Promise<void> {
        if (this.childProcess) {
            this.emit('nsz-error', { op: operation, message: `A process is already running (${this.currentOperation})` });
            return;
        }

        this.currentOperation = operation;
        this.cancelled = false;

        const batches = SINGLE_FILE_OPS.has(operation) && files.length > 1
            ? files.map(f => [f])
            : [files];

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            if (this.cancelled) break;

            const currentFiles = batches[batchIdx];
            if (batches.length > 1) {
                this.emit('output', {
                    op: operation,
                    line: `[File ${batchIdx + 1}/${batches.length}] ${this.getBasename(currentFiles[0])}`,
                });
            }

            const args = await this.buildArgs(operation, currentFiles, options);
            this.lastOutputLine = '';
            this.emit('log', `Running: nscb_rust ${args.join(' ')}`);
            this.emit('output', { op: operation, line: `> nscb_rust ${args.join(' ')}` });

            const code = await this.startBackendRun(operation, args);
            if (code !== 0) {
                this.currentOperation = null;
                this.emit('nsz-error', {
                    op: operation,
                    message: this.lastOutputLine
                        ? `nscb_rust exited with code ${code}: ${this.lastOutputLine}`
                        : `nscb_rust exited with code ${code}`,
                });
                this.emit('done', { op: operation, code });
                return;
            }
        }

        this.currentOperation = null;
        if (!this.cancelled) {
            this.emit('progress', { op: operation, percent: 100, message: 'Done!' });
            this.emit('done', { op: operation, code: 0 });
        }
    }

    private parseLine(op: string, line: string): void {
        const cleanLine = this.normalizeProgressText(line);

        const percentMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percentMatch) {
            this.emit('progress', {
                op,
                percent: parseFloat(percentMatch[1]),
                message: cleanLine,
            });
            return;
        }

        if (this.parseByteOrItemProgress(op, cleanLine)) return;

        const actionMatch = cleanLine.match(/^\[(\w+)\s*(?:\w*)\]\s*(.*)/);
        if (actionMatch) {
            this.emit('status', {
                op,
                action: actionMatch[1],
                detail: actionMatch[2],
            });
            return;
        }

        if (cleanLine.includes('Done!') || cleanLine.includes('done!')) {
            this.emit('progress', { op, percent: 100, message: 'Done!' });
            return;
        }

        if (cleanLine.toLowerCase().includes('error')) {
            this.emit('nsz-error', { op, message: cleanLine });
        }
    }

    private parseStderrChunk(op: string, text: string): void {
        if (text.toLowerCase().includes('error:')) {
            const errorMatch = text.match(/error:\s*(.+?)(?:\s{2,}|$)/i);
            if (errorMatch) {
                this.emit('nsz-error', { op, message: errorMatch[1].trim() });
            }
            return;
        }

        this.parseByteOrItemProgress(op, text);
    }

    private parseByteOrItemProgress(op: string, text: string): boolean {
        const label = this.extractLabel(text);
        const UNITS: Record<string, number> = {
            B: 1,
            KiB: 1024,
            MiB: 1048576,
            GiB: 1073741824,
            KB: 1000,
            MB: 1000000,
            GB: 1000000000,
            TB: 1000000000000,
            TiB: 1099511627776,
        };

        const byteMatch = NszRunner.lastMatch(
            /(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB|KB|MB|GB|TB|TiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB|KB|MB|GB|TB|TiB)/gi,
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
                return true;
            }
        }

        const itemMatch = NszRunner.lastMatch(/(\d+)\s*\/\s*(\d+)/g, text);
        if (itemMatch) {
            const pos = parseInt(itemMatch[1]);
            const len = parseInt(itemMatch[2]);
            if (len > 0 && pos <= len) {
                this.emit('progress', {
                    op,
                    percent: Math.round(Math.min(99, (pos / len) * 100) * 10) / 10,
                    message: `${label}... ${pos} / ${len}`,
                });
                return true;
            }
        }

        return false;
    }

    private extractLabel(text: string): string {
        const match = text.match(/([A-Z][a-z]+(?:\s+\w+)*)\s*\[/);
        return match ? match[1] : 'Processing';
    }

    private static lastMatch(regex: RegExp, text: string): RegExpExecArray | null {
        let last: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
            last = m;
        }
        return last;
    }

    async cancel(): Promise<void> {
        this.cancelled = true;
        if (this.childProcess) {
            await this.childProcess.kill();
            this.childProcess = null;
            this.currentOperation = null;
            this.doneResolver = null;
        }
    }

    isRunning(): boolean {
        return this.childProcess !== null;
    }
}

let instance: NszRunner | null = null;

export function getRunner(): NszRunner {
    if (!instance) {
        instance = new NszRunner();
    }
    return instance;
}
