import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as api from './lib/api';
import { getRunner } from './lib/nscb-runner';

// ============================================================
// SVG Icons
// ============================================================

function icon(size: number, children: React.ReactNode, strokeWidth = 2): React.JSX.Element {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {children}
        </svg>
    );
}

const Icons = {
    compress: icon(20, <><path d="M12 3v18" /><path d="m8 8 4-4 4 4" /><path d="m8 16 4 4 4-4" /><path d="M4 12h16" /></>),
    decompress: icon(20, <><path d="M12 3v18" /><path d="m8 7 4 4 4-4" /><path d="m8 17 4-4 4 4" /><path d="M4 12h16" /></>),
    merge: icon(20, <><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /><path d="M6 9a9 9 0 0 1 9-9" /></>),
    convert: icon(20, <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>),
    split: icon(20, <><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" /><path d="m15 9 6-6" /></>),
    create: icon(20, <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>),
    settings: icon(20, <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>),
    upload: icon(40, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>, 1.5),
    file: icon(16, <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></>),
    folder: icon(16, <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />),
    x: icon(14, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
    check: icon(16, <polyline points="20 6 9 17 4 12" />),
    alertCircle: icon(16, <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
    play: icon(18, <polygon points="5 3 19 12 5 21 5 3" />),
    save: icon(16, <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>),
    key: icon(20, <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />),
    download: icon(20, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
    trash: icon(14, <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
    stop: icon(16, <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />),
    switchLogo: icon(28, <><rect x="2" y="3" width="20" height="18" rx="3" ry="3" /><line x1="12" y1="3" x2="12" y2="21" /><circle cx="7.5" cy="9" r="2" /><circle cx="16.5" cy="15" r="1.5" /></>, 1.5),
    info: icon(16, <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
};

// ============================================================
// Helpers
// ============================================================

function levelLabel(level: number): string {
    if (level <= 8) return 'Fast';
    if (level <= 14) return 'Normal';
    if (level <= 18) return 'Great';
    return 'Ultra';
}

function getFileExt(path: string): string {
    const name = path.replace(/\\/g, '/').split('/').pop() || '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.substring(dot + 1).toUpperCase() : '';
}

function getFileName(path: string): string {
    return path.replace(/\\/g, '/').split('/').pop() || '';
}

function getDirectory(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';
}

const EXT_COLORS: Record<string, string> = {
    NSP: '#3fb950',
    XCI: '#58a6ff',
    NSZ: '#d2a8ff',
    XCZ: '#f0883e',
    NCZ: '#f778ba',
    NCA: '#8b949e',
};

const EMPTY_PROGRESS = { percent: 0, message: '' };

const runner = getRunner();

// ============================================================
// Hooks
// ============================================================

function useRunnerEvents(operationNames: string | string[]) {
    const ops = Array.isArray(operationNames) ? operationNames : [operationNames];
    const opsKey = ops.join(',');

    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(EMPTY_PROGRESS);
    const [outputLines, setOutputLines] = useState<string[]>([]);

    useEffect(() => {
        function matchesOp(data: { op: string }) {
            return ops.includes(data.op);
        }

        const unsubs = [
            runner.on('progress', (data) => {
                if (matchesOp(data)) {
                    setProgress({ percent: data.percent, message: data.message });
                }
            }),
            runner.on('output', (data) => {
                if (matchesOp(data)) {
                    setOutputLines(prev => [...prev.slice(-200), data.line]);
                }
            }),
            runner.on('done', (data) => {
                if (matchesOp(data)) {
                    setRunning(false);
                    setProgress({
                        percent: 100,
                        message: data.code === 0 ? 'Completed successfully!' : `Completed with exit code: ${data.code}`,
                    });
                }
            }),
            runner.on('nscb-error', (data) => {
                if (matchesOp(data)) {
                    setOutputLines(prev => [...prev, `ERROR: ${data.message}`]);
                }
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [opsKey]);

    return { running, progress, outputLines, setRunning, setProgress, setOutputLines };
}

function useFileList() {
    const [files, setFiles] = useState<string[]>([]);

    const addFiles = useCallback((newFiles: string[]) => {
        setFiles(prev => [...prev, ...newFiles.filter(f => !prev.includes(f))]);
    }, []);

    const removeFile = useCallback((index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearFiles = useCallback(() => setFiles([]), []);

    return { files, addFiles, removeFile, clearFiles };
}

function useOutputDir() {
    const [outputDir, setOutputDir] = useState('');

    const selectOutputDirFn = useCallback(async () => {
        const dir = await api.selectOutputDir();
        if (dir) setOutputDir(dir);
    }, []);

    return { outputDir, setOutputDir, selectOutputDir: selectOutputDirFn };
}

// ============================================================
// Shared Components
// ============================================================

const NAV_PAGES = [
    { id: 'compress', icon: Icons.compress, label: 'Compress' },
    { id: 'decompress', icon: Icons.decompress, label: 'Decompress' },
    { id: 'merge', icon: Icons.merge, label: 'Merge' },
    { id: 'convert', icon: Icons.convert, label: 'Convert' },
    { id: 'split', icon: Icons.split, label: 'Split' },
    { id: 'create', icon: Icons.create, label: 'Create/Repack' },
    { id: 'settings', icon: Icons.settings, label: 'Settings' },
];

function Sidebar({ activePage, onNavigate }: { activePage: string; onNavigate: (id: string) => void }) {
    return (
        <div className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-logo">{Icons.switchLogo}</div>
                <div className="brand-text">
                    <h1>NSCB Desktop</h1>
                    <span>v1.0.0</span>
                </div>
            </div>
            <nav className="sidebar-nav">
                {NAV_PAGES.map(p => (
                    <div
                        key={p.id}
                        className={`nav-item ${activePage === p.id ? 'active' : ''}`}
                        onClick={() => onNavigate(p.id)}
                    >
                        <span className="nav-icon">{p.icon}</span>
                        <span className="nav-label">{p.label}</span>
                    </div>
                ))}
            </nav>
            <div className="sidebar-footer">
                <span className="footer-dot" />
                nscb_rust Backend
            </div>
        </div>
    );
}

function ExtBadge({ ext }: { ext: string }) {
    const color = EXT_COLORS[ext] || 'var(--text-muted)';
    return (
        <span className="ext-badge" style={{ '--badge-color': color } as React.CSSProperties}>
            {ext}
        </span>
    );
}

function DropZone({ onFiles, accept, hint }: { onFiles: (files: string[]) => void; accept?: string[]; hint?: string }) {
    const [dragOver, setDragOver] = useState(false);

    useEffect(() => {
        const appWindow = getCurrentWebviewWindow();
        const unlisten = appWindow.onDragDropEvent((event) => {
            if (event.payload.type === 'over') {
                setDragOver(true);
            } else if (event.payload.type === 'leave') {
                setDragOver(false);
            } else if (event.payload.type === 'drop') {
                setDragOver(false);
                const paths = event.payload.paths;
                if (paths && paths.length > 0) {
                    onFiles(paths);
                }
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, [onFiles]);

    const handleClick = useCallback(async () => {
        const filters = accept ? [{ name: 'Files', extensions: accept }] : undefined;
        const files = await api.selectFiles(filters);
        if (files.length > 0) onFiles(files);
    }, [onFiles, accept]);

    return (
        <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={handleClick}
        >
            <div className="drop-zone-icon">{Icons.upload}</div>
            <div className="drop-zone-text">
                Drop files here or <span className="drop-zone-link">browse</span>
            </div>
            <div className="drop-zone-hint">
                {hint || 'Supports NSP, XCI, NSZ, XCZ, NCZ files'}
            </div>
            {accept && (
                <div className="drop-zone-badges">
                    {accept.map(ext => (
                        <ExtBadge key={ext} ext={ext.toUpperCase()} />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileList({ files, onRemove }: { files: string[]; onRemove: (index: number) => void }) {
    if (files.length === 0) return null;

    return (
        <div className="file-list">
            <div className="file-list-header">
                <span className="file-list-count">{files.length} file{files.length !== 1 ? 's' : ''} selected</span>
            </div>
            {files.map((file, i) => (
                <div key={i} className="file-item">
                    <span className="file-icon">{Icons.file}</span>
                    <ExtBadge ext={getFileExt(file)} />
                    <div className="file-info">
                        <div className="file-name">{getFileName(file)}</div>
                        <div className="file-path">{getDirectory(file)}</div>
                    </div>
                    <button
                        className="file-remove"
                        onClick={() => onRemove(i)}
                        title="Remove file"
                    >
                        {Icons.x}
                    </button>
                </div>
            ))}
        </div>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label?: string }) {
    return (
        <div className="toggle" onClick={() => onChange(!checked)}>
            <div className={`toggle-track ${checked ? 'active' : ''}`}>
                <div className="toggle-thumb" />
            </div>
            {label && <span className="toggle-label">{label}</span>}
        </div>
    );
}

function getOutputLineClass(line: string): string {
    if (line.toLowerCase().includes('error')) return 'error';
    if (line.includes('Done!')) return 'success';
    if (line.startsWith('[') || line.startsWith('>')) return 'info';
    return '';
}

function ProgressDisplay({ progress, outputLines }: { progress: { percent: number; message: string }; outputLines: string[] }) {
    const consoleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [outputLines]);

    const isComplete = progress.percent >= 100;

    return (
        <div className="progress-container">
            <div className="progress-bar-wrapper">
                <div
                    className={`progress-bar-fill ${isComplete ? 'complete' : ''}`}
                    style={{ width: `${progress.percent || 0}%` }}
                />
            </div>
            <div className="progress-info">
                <span className="progress-message">{progress.message || 'Waiting...'}</span>
                <span className={`progress-percent ${isComplete ? 'complete' : ''}`}>
                    {(progress.percent || 0).toFixed(1)}%
                </span>
            </div>
            {outputLines.length > 0 && (
                <div className="output-console" ref={consoleRef}>
                    {outputLines.map((line, i) => (
                        <div key={i} className={`output-line ${getOutputLineClass(line)}`}>
                            {line}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ToastContainer({ toasts }: { toasts: { id: number; message: string; type: string }[] }) {
    if (toasts.length === 0) return null;
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type}`}>
                    <span className="toast-icon">
                        {t.type === 'success' ? Icons.check : t.type === 'error' ? Icons.alertCircle : Icons.info}
                    </span>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}

function OutputDirPicker({ outputDir, setOutputDir, selectOutputDir }: { outputDir: string; setOutputDir: (dir: string) => void; selectOutputDir: () => void }) {
    return (
        <div className="dir-picker">
            <label className="dir-picker-label">{Icons.folder} Output Directory</label>
            <div className="dir-picker-row">
                <input
                    type="text"
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="Default: same as source file"
                />
                <button className="btn btn-secondary btn-sm" onClick={selectOutputDir}>
                    Browse
                </button>
            </div>
        </div>
    );
}

function ActionBar({ running, onCancel, onClear, onStart, startLabel, startDisabled }: {
    running: boolean;
    onCancel: () => void;
    onClear: () => void;
    onStart: () => void;
    startLabel: string;
    startDisabled?: boolean;
}) {
    return (
        <div className="actions-bar">
            <span className="spacer" />
            {running ? (
                <button className="btn btn-danger" onClick={onCancel}>
                    {Icons.stop} Cancel
                </button>
            ) : (
                <>
                    <button className="btn btn-ghost" onClick={onClear}>
                        {Icons.trash} Clear All
                    </button>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={onStart}
                        disabled={startDisabled}
                    >
                        {Icons.play} {startLabel}
                    </button>
                </>
            )}
        </div>
    );
}

// ============================================================
// Pages
// ============================================================

interface OperationPageConfig {
    op: string;
    icon: React.JSX.Element;
    accent: string;
    title: string;
    subtitle: string;
    accept: string[];
    hint: string;
    startLabel: string;
    startMessage: string;
    minFiles?: number;
    renderOptions?: (state: OperationPageState) => React.ReactNode;
    buildRunnerOpts?: (state: OperationPageState) => Record<string, unknown>;
}

interface OperationPageState {
    outputDir: string;
    options: Record<string, any>;
    setOption: (key: string, value: any) => void;
}

function OperationPage({ config }: { config: OperationPageConfig }) {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents(config.op);
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [options, setOptions] = useState<Record<string, any>>({});

    const setOption = useCallback((key: string, value: any) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    }, []);

    const minFiles = config.minFiles ?? 1;
    const state: OperationPageState = { outputDir, options, setOption };

    const handleStart = async () => {
        if (files.length < minFiles) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: config.startMessage });
        setOutputLines([]);
        const extraOpts = config.buildRunnerOpts ? config.buildRunnerOpts(state) : {};
        await runner.run(config.op, files, {
            output: outputDir || undefined,
            ...extraOpts,
        });
    };

    const handleCancel = async () => {
        await runner.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => {
        clearFiles();
        setOutputLines([]);
        setProgress(EMPTY_PROGRESS);
    };

    return (
        <div className="page">
            <div className="page-header">
                <div className={`page-icon accent-${config.accent}`}>{config.icon}</div>
                <div>
                    <h2>{config.title}</h2>
                    <p>{config.subtitle}</p>
                </div>
            </div>

            <DropZone onFiles={addFiles} accept={config.accept} hint={config.hint} />
            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
                <>
                    {config.renderOptions && config.renderOptions(state)}

                    <OutputDirPicker outputDir={outputDir} setOutputDir={setOutputDir} selectOutputDir={selectOutputDir} />

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <ActionBar
                        running={running}
                        onCancel={handleCancel}
                        onClear={handleClear}
                        onStart={handleStart}
                        startLabel={config.startLabel}
                        startDisabled={files.length < minFiles}
                    />
                </>
            )}
        </div>
    );
}

function CompressOptions({ options, setOption }: { options: Record<string, any>; setOption: (k: string, v: any) => void }) {
    const level = options.level ?? 18;
    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">Compression Options</span>
            </div>
            <div className="options-panel">
                <div className="option-group">
                    <label className="option-label">Compression Level</label>
                    <div className="slider-control">
                        <input
                            type="range"
                            min="1"
                            max="22"
                            value={level}
                            onChange={(e) => setOption('level', Number(e.target.value))}
                        />
                        <span className="slider-value">{level}</span>
                    </div>
                    <span className={`level-badge level-${levelLabel(level).toLowerCase()}`}>
                        {levelLabel(level)}
                    </span>
                </div>
            </div>
        </div>
    );
}

function FormatOptions({ options, setOption, title, descriptions }: {
    options: Record<string, any>;
    setOption: (k: string, v: any) => void;
    title: string;
    descriptions: { xci: string; nsp: string };
}) {
    const format = options.format ?? 'xci';
    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">{title}</span>
            </div>
            <div className="options-panel">
                <div className="option-group">
                    <label className="option-label">Output Format</label>
                    <select value={format} onChange={(e) => setOption('format', e.target.value)}>
                        <option value="xci">XCI (Game Cartridge)</option>
                        <option value="nsp">NSP (eShop Package)</option>
                    </select>
                    <span className="option-description">
                        {format === 'xci' ? descriptions.xci : descriptions.nsp}
                    </span>
                </div>
            </div>
        </div>
    );
}

const COMPRESS_CONFIG: OperationPageConfig = {
    op: 'compress',
    icon: Icons.compress,
    accent: 'compress',
    title: 'Compress',
    subtitle: 'Compress NSP/XCI files to NSZ/XCZ format',
    accept: ['nsp', 'xci'],
    hint: 'Drop NSP or XCI files to compress',
    startLabel: 'Start Compression',
    startMessage: 'Starting compression...',
    renderOptions: (state) => (
        <CompressOptions options={state.options} setOption={state.setOption} />
    ),
    buildRunnerOpts: (state) => ({
        level: state.options.level ?? 18,
    }),
};

const DECOMPRESS_CONFIG: OperationPageConfig = {
    op: 'decompress',
    icon: Icons.decompress,
    accent: 'decompress',
    title: 'Decompress',
    subtitle: 'Decompress NSZ/XCZ/NCZ files back to NSP/XCI format',
    accept: ['nsz', 'xcz', 'ncz'],
    hint: 'Drop NSZ, XCZ, or NCZ files to decompress',
    startLabel: 'Start Decompression',
    startMessage: 'Starting decompression...',
};

const MERGE_CONFIG: OperationPageConfig = {
    op: 'merge',
    icon: Icons.merge,
    accent: 'merge',
    title: 'Merge',
    subtitle: 'Combine base game + updates + DLCs into a single file',
    accept: ['xci', 'nsp', 'nsz', 'xcz'],
    hint: 'Drop base game, update, and DLC files',
    startLabel: 'Start Merge',
    startMessage: 'Starting merge...',
    minFiles: 2,
    renderOptions: (state) => {
        const format = state.options.format ?? 'xci';
        const nodelta = state.options.nodelta ?? false;
        return (
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Merge Options</span>
                </div>
                <div className="options-panel">
                    <div className="option-group">
                        <label className="option-label">Output Format</label>
                        <select value={format} onChange={(e) => state.setOption('format', e.target.value)}>
                            <option value="xci">XCI (Game Cartridge)</option>
                            <option value="nsp">NSP (eShop Package)</option>
                        </select>
                        <span className="option-description">
                            {format === 'xci' ? 'Single XCI with all content' : 'Single NSP with all content'}
                        </span>
                    </div>
                    <div className="option-group">
                        <Toggle checked={nodelta} onChange={(v) => state.setOption('nodelta', v)} label="Exclude Delta Fragments" />
                        <span className="option-description">Skip delta NCA fragments during merge</span>
                    </div>
                </div>
            </div>
        );
    },
    buildRunnerOpts: (state) => ({
        format: state.options.format ?? 'xci',
        nodelta: (state.options.nodelta ?? false) || undefined,
    }),
};

const CONVERT_CONFIG: OperationPageConfig = {
    op: 'convert',
    icon: Icons.convert,
    accent: 'convert',
    title: 'Convert',
    subtitle: 'Convert between NSP and XCI formats',
    accept: ['nsp', 'xci'],
    hint: 'Drop NSP or XCI files to convert',
    startLabel: 'Start Conversion',
    startMessage: 'Starting conversion...',
    renderOptions: (state) => (
        <FormatOptions
            options={state.options}
            setOption={state.setOption}
            title="Convert Options"
            descriptions={{ xci: 'Convert NSP \u2192 XCI', nsp: 'Convert XCI \u2192 NSP' }}
        />
    ),
    buildRunnerOpts: (state) => ({
        format: state.options.format ?? 'xci',
    }),
};

const SPLIT_CONFIG: OperationPageConfig = {
    op: 'split',
    icon: Icons.split,
    accent: 'split',
    title: 'Split',
    subtitle: 'Split multi-title files into per-title NCA folders',
    accept: ['nsp', 'xci'],
    hint: 'Drop NSP or XCI files to split into per-title NCA folders',
    startLabel: 'Start Split',
    startMessage: 'Starting split...',
};

function CompressPage() { return <OperationPage config={COMPRESS_CONFIG} />; }
function DecompressPage() { return <OperationPage config={DECOMPRESS_CONFIG} />; }
function MergePage() { return <OperationPage config={MERGE_CONFIG} />; }
function ConvertPage() { return <OperationPage config={CONVERT_CONFIG} />; }
function SplitPage() { return <OperationPage config={SPLIT_CONFIG} />; }

function CreatePage() {
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('create');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [inputFolder, setInputFolder] = useState('');

    const handleSelectFolder = useCallback(async () => {
        const dir = await api.selectOutputDir();
        if (dir) setInputFolder(dir);
    }, []);

    const handleStart = async () => {
        if (!inputFolder) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting repack...' });
        setOutputLines([]);
        await runner.run('create', [inputFolder], {
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        await runner.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => {
        setInputFolder('');
        setOutputLines([]);
        setProgress(EMPTY_PROGRESS);
    };

    const getFolderName = (p: string) => p.replace(/\\/g, '/').split('/').pop();

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-icon accent-create">{Icons.create}</div>
                <div>
                    <h2>Create / Repack</h2>
                    <p>Repack a split NCA folder back into an NSP file</p>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">Input Folder</span>
                </div>
                <div className="options-panel">
                    <div className="option-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="option-label">NCA Source Folder</label>
                        <div className="dir-picker-row">
                            <input
                                type="text"
                                value={inputFolder}
                                onChange={(e) => setInputFolder(e.target.value)}
                                placeholder="Select the folder produced by Split..."
                            />
                            <button className="btn btn-secondary btn-sm" onClick={handleSelectFolder}>
                                Browse
                            </button>
                        </div>
                        {inputFolder && (
                            <span className="option-description">
                                Output: <code>{getFolderName(inputFolder)}.nsp</code>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {inputFolder && (
                <>
                    <OutputDirPicker outputDir={outputDir} setOutputDir={setOutputDir} selectOutputDir={selectOutputDir} />

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <ActionBar
                        running={running}
                        onCancel={handleCancel}
                        onClear={handleClear}
                        onStart={handleStart}
                        startLabel="Start Repack"
                    />
                </>
            )}
        </div>
    );
}

function SettingsPage() {
    const [settings, setSettings] = useState({
        defaultLevel: 18,
        defaultOutputDir: '',
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.loadSettings().then(s => {
            if (s && Object.keys(s).length > 0) setSettings(prev => ({ ...prev, ...s }));
        });
    }, []);

    const handleSave = async () => {
        await api.saveSettings(settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const update = (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSelectDir = async () => {
        const dir = await api.selectOutputDir();
        if (dir) update('defaultOutputDir', dir);
    };

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-icon accent-settings">{Icons.settings}</div>
                <div>
                    <h2>Settings</h2>
                    <p>Default options for operations</p>
                </div>
            </div>

            <div className="settings-grid">
                <div className="settings-section">
                    <h3 className="settings-section-title">Compression Defaults</h3>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Default Compression Level</h4>
                            <p>1 (fast) to 22 (ultra). Default: 18</p>
                        </div>
                        <div className="settings-row-control">
                            <div className="slider-control">
                                <input
                                    type="range"
                                    min="1"
                                    max="22"
                                    value={settings.defaultLevel}
                                    onChange={(e) => update('defaultLevel', Number(e.target.value))}
                                />
                                <span className="slider-value">{settings.defaultLevel}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3 className="settings-section-title">Paths</h3>
                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Default Output Directory</h4>
                            <p>Where processed files are saved by default</p>
                        </div>
                        <div className="settings-row-control" style={{ minWidth: '280px' }}>
                            <div className="dir-picker-row">
                                <input
                                    type="text"
                                    value={settings.defaultOutputDir}
                                    onChange={(e) => update('defaultOutputDir', e.target.value)}
                                    placeholder="Same as source"
                                />
                                <button className="btn btn-secondary btn-sm" onClick={handleSelectDir}>
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="actions-bar">
                <span className="spacer" />
                {saved && (
                    <span className="save-confirm">
                        {Icons.check} Settings saved!
                    </span>
                )}
                <button className="btn btn-primary" onClick={handleSave}>
                    {Icons.save} Save Settings
                </button>
            </div>
        </div>
    );
}

// ============================================================
// Setup Page
// ============================================================

function SetupPage({
    onComplete,
    needsKeys,
    needsBackend,
}: {
    onComplete: () => void;
    needsKeys: boolean;
    needsBackend: boolean;
}) {
    const [error, setError] = useState('');
    const [checkingKeys, setCheckingKeys] = useState(false);
    const [checkingBackend, setCheckingBackend] = useState(false);
    const [hasKeys, setHasKeys] = useState(!needsKeys);
    const [hasBackend, setHasBackend] = useState(!needsBackend);
    const checking = checkingKeys || checkingBackend;

    async function handleImport(
        importFn: () => Promise<{ ok: boolean; error?: string }>,
        setChecking: (v: boolean) => void,
    ) {
        setError('');
        setChecking(true);
        const result = await importFn();
        setChecking(false);
        if (result.ok) {
            const [keys, backend] = await Promise.all([api.hasKeys(), api.hasBackend()]);
            setHasKeys(keys);
            setHasBackend(backend);
            if (keys && backend) onComplete();
        } else if (result.error) {
            setError(result.error);
        }
    }

    const handleImportKeys = () => handleImport(api.importKeys, setCheckingKeys);
    const handleImportBackend = () => handleImport(api.importBackend, setCheckingBackend);

    return (
        <div className="setup-screen">
            <div className="setup-card">
                <div className="setup-logo">{Icons.switchLogo}</div>
                <h1 className="setup-title">NSCB Desktop</h1>
                <p className="setup-subtitle">
                    One-time setup: import keys and backend executable
                </p>

                <div className="setup-divider" />

                <div className="setup-checklist">
                    <div className={`setup-check-item ${hasKeys ? 'done' : ''}`}>
                        <span className="setup-check-icon">
                            {hasKeys ? Icons.check : Icons.key}
                        </span>
                        <span>Encryption keys (<code>prod.keys</code>)</span>
                    </div>
                    <div className={`setup-check-item ${hasBackend ? 'done' : ''}`}>
                        <span className="setup-check-icon">
                            {hasBackend ? Icons.check : Icons.download}
                        </span>
                        <span>Backend binary (<code>nscb_rust.exe</code>)</span>
                    </div>
                </div>

                <div className="setup-actions">
                    {!hasKeys && (
                        <button
                            className="btn btn-primary btn-lg setup-btn"
                            onClick={handleImportKeys}
                            disabled={checking}
                        >
                            {checkingKeys ? 'Importing...' : <>{Icons.key} Import Keys File</>}
                        </button>
                    )}

                    {!hasBackend && (
                        <button
                            className="btn btn-primary btn-lg setup-btn"
                            onClick={handleImportBackend}
                            disabled={checking}
                        >
                            {checkingBackend ? 'Importing...' : <>{Icons.download} Import nscb_rust.exe</>}
                        </button>
                    )}
                </div>

                {error && (
                    <div className="setup-error">
                        {Icons.alertCircle} {error}
                    </div>
                )}

                <div className="setup-footer">
                    NSCB Desktop v1.0.0
                </div>
            </div>
        </div>
    );
}

// ============================================================
// App Root
// ============================================================

const PAGES: Record<string, React.FC> = {
    compress: CompressPage,
    decompress: DecompressPage,
    merge: MergePage,
    convert: ConvertPage,
    split: SplitPage,
    create: CreatePage,
    settings: SettingsPage,
};

async function checkSetupState() {
    const [dir, keys, backend] = await Promise.all([
        api.getToolsDirOrNull(),
        api.hasKeys(),
        api.hasBackend(),
    ]);
    return { dir, keys, backend };
}

export default function App() {
    const [activePage, setActivePage] = useState('compress');
    const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
    const [toolsDir, setToolsDir] = useState<string | null>(null);
    const [hasKeysState, setHasKeys] = useState(false);
    const [hasBackendState, setHasBackend] = useState(false);
    const [loading, setLoading] = useState(true);

    function applySetupState(state: { dir: string | null; keys: boolean; backend: boolean }) {
        setToolsDir(state.dir);
        setHasKeys(state.keys);
        setHasBackend(state.backend);
    }

    useEffect(() => {
        (async () => {
            await runner.init();
            applySetupState(await checkSetupState());
            setLoading(false);
        })();
    }, []);

    const addToast = useCallback((message: string, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    useEffect(() => {
        const unsub = runner.on('nscb-error', (data) => {
            addToast(data.message || String(data), 'error');
        });
        return unsub;
    }, [addToast]);

    const handleSetupComplete = async () => {
        const state = await checkSetupState();
        applySetupState(state);
        if (state.dir) runner.setToolsDir(state.dir);
        addToast('Ready to go!', 'success');
    };

    if (loading) {
        return (
            <div className="setup-screen">
                <div className="setup-card">
                    <div className="setup-logo loading">{Icons.switchLogo}</div>
                    <h1 className="setup-title">Loading...</h1>
                </div>
            </div>
        );
    }

    if (!toolsDir || !hasKeysState || !hasBackendState) {
        return (
            <>
                <SetupPage
                    onComplete={handleSetupComplete}
                    needsKeys={!hasKeysState}
                    needsBackend={!hasBackendState}
                />
                <ToastContainer toasts={toasts} />
            </>
        );
    }

    return (
        <div className="app-shell">
            <Sidebar activePage={activePage} onNavigate={setActivePage} />
            <main className="main-content">
                {Object.entries(PAGES).map(([id, PageComponent]) => (
                    <div key={id} style={{ display: activePage === id ? 'block' : 'none' }}>
                        <PageComponent />
                    </div>
                ))}
            </main>
            <ToastContainer toasts={toasts} />
        </div>
    );
}
