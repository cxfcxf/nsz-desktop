import { useState, useCallback, useEffect, useRef } from 'react';

// ============================================================
// Helpers
// ============================================================

function levelLabel(level) {
    if (level <= 8) return 'Fast';
    if (level <= 14) return 'Normal';
    if (level <= 18) return 'Great';
    return 'Ultra';
}

const EMPTY_PROGRESS = { percent: 0, message: '' };

/**
 * Hook that subscribes to the unified runner events, filtering by operation name(s).
 * Accepts a single operation string or an array of operation strings.
 */
function useRunnerEvents(operationNames) {
    const ops = Array.isArray(operationNames) ? operationNames : [operationNames];
    const opsKey = ops.join(',');

    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(EMPTY_PROGRESS);
    const [outputLines, setOutputLines] = useState([]);

    useEffect(() => {
        if (!window.nszAPI) return;

        function matchesOp(data) {
            return ops.includes(data.op);
        }

        const unsubs = [
            window.nszAPI.onProgress((data) => {
                if (matchesOp(data)) {
                    setProgress({ percent: data.percent, message: data.message });
                }
            }),
            window.nszAPI.onOutput((data) => {
                if (matchesOp(data)) {
                    setOutputLines(prev => [...prev.slice(-200), data.line]);
                }
            }),
            window.nszAPI.onDone((data) => {
                if (matchesOp(data)) {
                    setRunning(false);
                    setProgress({
                        percent: 100,
                        message: data.code === 0 ? 'Completed successfully!' : `Completed with exit code: ${data.code}`,
                    });
                }
            }),
            window.nszAPI.onError((data) => {
                if (matchesOp(data)) {
                    setOutputLines(prev => [...prev, `ERROR: ${data.message}`]);
                }
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [opsKey]);

    return { running, progress, outputLines, setRunning, setProgress, setOutputLines };
}

/**
 * Hook for managing a file list with add (deduplicated) and remove operations.
 */
function useFileList() {
    const [files, setFiles] = useState([]);

    const addFiles = useCallback((newFiles) => {
        setFiles(prev => [...prev, ...newFiles.filter(f => !prev.includes(f))]);
    }, []);

    const removeFile = useCallback((index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearFiles = useCallback(() => setFiles([]), []);

    return { files, addFiles, removeFile, clearFiles };
}

/**
 * Hook for selecting an output directory via the native dialog.
 */
function useOutputDir() {
    const [outputDir, setOutputDir] = useState('');

    const selectOutputDir = useCallback(async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) setOutputDir(dir);
    }, []);

    return { outputDir, setOutputDir, selectOutputDir };
}

// ============================================================
// Shared Components
// ============================================================

function Sidebar({ activePage, onNavigate }) {
    const pages = [
        { id: 'compress', icon: '📦', label: 'Compress' },
        { id: 'decompress', icon: '📂', label: 'Decompress' },
        { id: 'merge', icon: '🔗', label: 'Merge' },
        { id: 'convert', icon: '🔄', label: 'Convert' },
        { id: 'split', icon: '✂️', label: 'Split' },
        { id: 'create', icon: '🗜️', label: 'Create/Repack' },
        { id: 'settings', icon: '⚙️', label: 'Settings' },
    ];

    return (
        <div className="sidebar">
            <div className="sidebar-brand">
                <h1>NSZ Desktop</h1>
                <span>v1.0.0</span>
            </div>
            <nav className="sidebar-nav">
                {pages.map(p => (
                    <div
                        key={p.id}
                        className={`nav-item ${activePage === p.id ? 'active' : ''}`}
                        onClick={() => onNavigate(p.id)}
                    >
                        <span className="nav-icon">{p.icon}</span>
                        <span>{p.label}</span>
                    </div>
                ))}
            </nav>
            <div className="sidebar-footer">
                nscb_rust v0.1.0 Backend
            </div>
        </div>
    );
}

function DropZone({ onFiles, accept, hint }) {
    const [dragOver, setDragOver] = useState(false);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).map(f => f.path);
        if (files.length > 0) onFiles(files);
    }, [onFiles]);

    const handleClick = useCallback(async () => {
        if (window.nszAPI) {
            const filters = accept ? [{ name: 'Files', extensions: accept }] : undefined;
            const files = await window.nszAPI.selectFiles(filters);
            if (files.length > 0) onFiles(files);
        }
    }, [onFiles, accept]);

    return (
        <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <div className="drop-zone-icon">🎮</div>
            <div className="drop-zone-text">
                Drop files here or click to browse
            </div>
            <div className="drop-zone-hint">
                {hint || 'Supports NSP, XCI, NSZ, XCZ, NCZ files'}
            </div>
        </div>
    );
}

function FileList({ files, onRemove }) {
    if (files.length === 0) return null;

    const getFileName = (path) => {
        const parts = path.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1];
    };

    const getDirectory = (path) => {
        const normalized = path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';
    };

    return (
        <div className="file-list">
            {files.map((file, i) => (
                <div key={i} className="file-item">
                    <span className="file-icon">🎮</span>
                    <div className="file-info">
                        <div className="file-name">{getFileName(file)}</div>
                        <div className="file-path">{getDirectory(file)}</div>
                    </div>
                    <button
                        className="file-remove"
                        onClick={() => onRemove(i)}
                        title="Remove file"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}

function Toggle({ checked, onChange, label }) {
    return (
        <div className="toggle" onClick={() => onChange(!checked)}>
            <div className={`toggle-track ${checked ? 'active' : ''}`}>
                <div className="toggle-thumb" />
            </div>
            {label && <span className="toggle-label">{label}</span>}
        </div>
    );
}

function getOutputLineClass(line) {
    if (line.toLowerCase().includes('error')) return 'error';
    if (line.includes('Done!')) return 'success';
    if (line.startsWith('[')) return 'info';
    return '';
}

function ProgressDisplay({ progress, outputLines }) {
    const consoleRef = useRef(null);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [outputLines]);

    return (
        <div className="progress-container">
            <div className="progress-bar-wrapper">
                <div
                    className="progress-bar-fill"
                    style={{ width: `${progress.percent || 0}%` }}
                />
            </div>
            <div className="progress-info">
                <span>{progress.message || 'Waiting...'}</span>
                <span className="progress-percent">
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

function ToastContainer({ toasts }) {
    if (toasts.length === 0) return null;
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type}`}>
                    <span className="toast-icon">
                        {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}

function OutputDirPicker({ outputDir, setOutputDir, selectOutputDir }) {
    return (
        <div className="dir-picker">
            <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder="Output directory (default: same as source)"
            />
            <button className="btn btn-secondary btn-sm" onClick={selectOutputDir}>
                Browse
            </button>
        </div>
    );
}

function ActionBar({ running, onCancel, onClear, onStart, startIcon, startLabel, startDisabled }) {
    return (
        <div className="actions-bar">
            <span className="spacer" />
            {running ? (
                <button className="btn btn-danger" onClick={onCancel}>
                    ✕ Cancel
                </button>
            ) : (
                <>
                    <button className="btn btn-secondary" onClick={onClear}>
                        Clear All
                    </button>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={onStart}
                        disabled={startDisabled}
                    >
                        {startIcon} {startLabel}
                    </button>
                </>
            )}
        </div>
    );
}

// ============================================================
// Pages
// ============================================================

function CompressPage() {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('compress');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [level, setLevel] = useState(18);

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting compression...' });
        setOutputLines([]);
        await window.nszAPI.compress(files, {
            level,
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => { clearFiles(); setOutputLines([]); setProgress(EMPTY_PROGRESS); };

    return (
        <div>
            <div className="page-header">
                <h2>Compress</h2>
                <p>Compress NSP/XCI files to NSZ/XCZ format</p>
            </div>

            <DropZone
                onFiles={addFiles}
                accept={['nsp', 'xci']}
                hint="Drop NSP or XCI files to compress"
            />

            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
                <>
                    <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
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
                                        onChange={(e) => setLevel(Number(e.target.value))}
                                    />
                                    <span className="slider-value">{level}</span>
                                </div>
                                <span className="option-description">
                                    {levelLabel(level)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <OutputDirPicker outputDir={outputDir} setOutputDir={setOutputDir} selectOutputDir={selectOutputDir} />

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <ActionBar
                        running={running}
                        onCancel={handleCancel}
                        onClear={handleClear}
                        onStart={handleStart}
                        startIcon="📦"
                        startLabel="Start Compression"
                    />
                </>
            )}
        </div>
    );
}

function DecompressPage() {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('decompress');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting decompression...' });
        setOutputLines([]);
        await window.nszAPI.decompress(files, {
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
    };

    const handleClear = () => { clearFiles(); setOutputLines([]); setProgress(EMPTY_PROGRESS); };

    return (
        <div>
            <div className="page-header">
                <h2>Decompress</h2>
                <p>Decompress NSZ/XCZ/NCZ files back to NSP/XCI format</p>
            </div>

            <DropZone
                onFiles={addFiles}
                accept={['nsz', 'xcz', 'ncz']}
                hint="Drop NSZ, XCZ, or NCZ files to decompress"
            />

            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
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
                        startIcon="📂"
                        startLabel="Start Decompression"
                    />
                </>
            )}
        </div>
    );
}

function MergePage() {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('merge');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [format, setFormat] = useState('xci');
    const [nodelta, setNodelta] = useState(false);

    const handleStart = async () => {
        if (files.length < 2 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting merge...' });
        setOutputLines([]);
        await window.nszAPI.mergeFiles(files, {
            output: outputDir || undefined,
            format,
            nodelta: nodelta || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => { clearFiles(); setOutputLines([]); setProgress(EMPTY_PROGRESS); };

    return (
        <div>
            <div className="page-header">
                <h2>Merge</h2>
                <p>Combine base game (XCI/NSP) + updates + DLCs into a single XCI or NSP</p>
            </div>

            <DropZone
                onFiles={addFiles}
                accept={['xci', 'nsp', 'nsz', 'xcz']}
                hint="Drop base game, update, and DLC files"
            />

            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
                <>
                    <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="card-header">
                            <span className="card-title">Merge Options</span>
                        </div>
                        <div className="options-panel">
                            <div className="option-group">
                                <label className="option-label">Output Format</label>
                                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                                    <option value="xci">XCI (Game Cartridge)</option>
                                    <option value="nsp">NSP (eShop Package)</option>
                                </select>
                                <span className="option-description">
                                    {format === 'xci' ? 'Single XCI with all content — load directly in emulator' : 'Single NSP with all content'}
                                </span>
                            </div>
                            <div className="option-group">
                                <Toggle checked={nodelta} onChange={setNodelta} label="Exclude Delta Fragments" />
                                <span className="option-description">Skip delta NCA fragments during merge</span>
                            </div>
                        </div>
                    </div>

                    <OutputDirPicker outputDir={outputDir} setOutputDir={setOutputDir} selectOutputDir={selectOutputDir} />

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <ActionBar
                        running={running}
                        onCancel={handleCancel}
                        onClear={handleClear}
                        onStart={handleStart}
                        startIcon="🔗"
                        startLabel="Start Merge"
                        startDisabled={files.length < 2}
                    />
                </>
            )}
        </div>
    );
}

function ConvertPage() {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('convert');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [format, setFormat] = useState('xci');

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting conversion...' });
        setOutputLines([]);
        await window.nszAPI.convert(files, {
            output: outputDir || undefined,
            format,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => { clearFiles(); setOutputLines([]); setProgress(EMPTY_PROGRESS); };

    return (
        <div>
            <div className="page-header">
                <h2>Convert</h2>
                <p>Convert between NSP and XCI formats</p>
            </div>

            <DropZone
                onFiles={addFiles}
                accept={['nsp', 'xci']}
                hint="Drop NSP or XCI files to convert"
            />

            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
                <>
                    <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="card-header">
                            <span className="card-title">Convert Options</span>
                        </div>
                        <div className="options-panel">
                            <div className="option-group">
                                <label className="option-label">Output Format</label>
                                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                                    <option value="xci">XCI (Game Cartridge)</option>
                                    <option value="nsp">NSP (eShop Package)</option>
                                </select>
                                <span className="option-description">
                                    {format === 'xci' ? 'Convert NSP → XCI' : 'Convert XCI → NSP'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <OutputDirPicker outputDir={outputDir} setOutputDir={setOutputDir} selectOutputDir={selectOutputDir} />

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <ActionBar
                        running={running}
                        onCancel={handleCancel}
                        onClear={handleClear}
                        onStart={handleStart}
                        startIcon="🔄"
                        startLabel="Start Conversion"
                    />
                </>
            )}
        </div>
    );
}

function SplitPage() {
    const { files, addFiles, removeFile, clearFiles } = useFileList();
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('split');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting split...' });
        setOutputLines([]);
        await window.nszAPI.split(files, {
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => { clearFiles(); setOutputLines([]); setProgress(EMPTY_PROGRESS); };

    return (
        <div>
            <div className="page-header">
                <h2>Split</h2>
                <p>Split a multi-title file into per-title folders with NCA files (title-aware naming)</p>
            </div>

            <DropZone
                onFiles={addFiles}
                accept={['nsp', 'xci']}
                hint="Drop NSP or XCI files to split into per-title NCA folders"
            />

            <FileList files={files} onRemove={removeFile} />

            {files.length > 0 && (
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
                        startIcon="✂️"
                        startLabel="Start Split"
                    />
                </>
            )}
        </div>
    );
}

function CreatePage() {
    const { running, progress, outputLines, setRunning, setProgress, setOutputLines } = useRunnerEvents('create');
    const { outputDir, setOutputDir, selectOutputDir } = useOutputDir();
    const [inputFolder, setInputFolder] = useState('');

    const handleSelectFolder = useCallback(async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) setInputFolder(dir);
    }, []);

    const handleStart = async () => {
        if (!inputFolder || !window.nszAPI) return;
        setRunning(true);
        setProgress({ ...EMPTY_PROGRESS, message: 'Starting repack...' });
        setOutputLines([]);
        await window.nszAPI.create([inputFolder], {
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ ...EMPTY_PROGRESS, message: 'Cancelled' });
    };

    const handleClear = () => {
        setInputFolder('');
        setOutputLines([]);
        setProgress(EMPTY_PROGRESS);
    };

    const getFolderName = (p) => p.replace(/\\/g, '/').split('/').pop();

    return (
        <div>
            <div className="page-header">
                <h2>Create / Repack</h2>
                <p>Repack a split NCA folder back into an NSP file</p>
            </div>

            <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                <div className="card-header">
                    <span className="card-title">Input Folder</span>
                </div>
                <div className="options-panel">
                    <div className="option-group">
                        <label className="option-label">NCA Source Folder</label>
                        <div className="dir-picker">
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
                                Will create: <code>{getFolderName(inputFolder)}.nsp</code>
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
                        startIcon="🗜️"
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
        if (window.nszAPI) {
            window.nszAPI.loadSettings().then(s => {
                if (s && Object.keys(s).length > 0) setSettings(prev => ({ ...prev, ...s }));
            });
        }
    }, []);

    const handleSave = async () => {
        if (window.nszAPI) {
            await window.nszAPI.saveSettings(settings);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    const update = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSelectDir = async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) update('defaultOutputDir', dir);
    };

    return (
        <div>
            <div className="page-header">
                <h2>Settings</h2>
                <p>Default options for operations</p>
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
                            <div className="dir-picker">
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
                    <span style={{ color: 'var(--accent-success)', fontSize: 'var(--font-size-sm)' }}>
                        ✅ Settings saved!
                    </span>
                )}
                <button className="btn btn-primary" onClick={handleSave}>
                    💾 Save Settings
                </button>
            </div>
        </div>
    );
}

// ============================================================
// Setup Page (first launch)
// ============================================================

function SetupPage({ onComplete, needsKeys }) {
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);

    const handleBrowse = async () => {
        if (!window.nszAPI) return;
        setError('');
        setChecking(true);
        const result = await window.nszAPI.selectNszDir();
        setChecking(false);
        if (result.ok) {
            onComplete(result.path);
        } else if (result.error) {
            setError(result.error);
        }
    };

    const handleImportKeys = async () => {
        if (!window.nszAPI) return;
        setError('');
        setChecking(true);
        const result = await window.nszAPI.importKeys();
        setChecking(false);
        if (result.ok) {
            const dir = await window.nszAPI.getNszDir();
            onComplete(dir);
        } else if (result.error) {
            setError(result.error);
        }
    };

    // Tools are bundled but keys.txt is missing
    if (needsKeys) {
        return (
            <div className="setup-screen">
                <div className="setup-card">
                    <div className="setup-icon">🔑</div>
                    <h1 className="setup-title">NSZ Desktop</h1>
                    <p className="setup-subtitle">
                        Almost ready — just need your encryption keys
                    </p>

                    <div className="setup-divider" />

                    <div className="setup-instruction">
                        <h3>Import Encryption Keys</h3>
                        <p>
                            Select your <code>prod.keys</code> or <code>keys.txt</code> file.
                            <br /><br />
                            This file contains your Switch console's encryption keys,
                            required for processing game files.
                        </p>
                    </div>

                    <button
                        className="btn btn-primary btn-lg setup-browse-btn"
                        onClick={handleImportKeys}
                        disabled={checking}
                    >
                        {checking ? '⏳ Importing...' : '🔑 Select Keys File'}
                    </button>

                    {error && (
                        <div className="setup-error">
                            ❌ {error}
                        </div>
                    )}

                    <div className="setup-footer">
                        NSZ Desktop v1.0.0
                    </div>
                </div>
            </div>
        );
    }

    // No tools found at all — browse for directory
    return (
        <div className="setup-screen">
            <div className="setup-card">
                <div className="setup-icon">🎮</div>
                <h1 className="setup-title">NSZ Desktop</h1>
                <p className="setup-subtitle">
                    Modern GUI for Switch file compression, conversion & merging
                </p>

                <div className="setup-divider" />

                <div className="setup-instruction">
                    <h3>Locate Tools Directory</h3>
                    <p>
                        Select the directory containing <code>nscb_rust.exe</code>
                        and <code>prod.keys</code> (or <code>keys.txt</code>).
                    </p>
                </div>

                <button
                    className="btn btn-primary btn-lg setup-browse-btn"
                    onClick={handleBrowse}
                    disabled={checking}
                >
                    {checking ? '⏳ Checking...' : '📂 Browse for Tools Directory'}
                </button>

                {error && (
                    <div className="setup-error">
                        ❌ {error}
                    </div>
                )}

                <div className="setup-footer">
                    NSZ Desktop v1.0.0
                </div>
            </div>
        </div>
    );
}

// ============================================================
// App Root
// ============================================================

export default function App() {
    const [activePage, setActivePage] = useState('compress');
    const [toasts, setToasts] = useState([]);
    const [nszDir, setNszDir] = useState(null);
    const [hasKeys, setHasKeys] = useState(false);
    const [loading, setLoading] = useState(true);

    // Check if nsz directory and keys are configured on mount
    useEffect(() => {
        if (!window.nszAPI) {
            setLoading(false);
            return;
        }
        Promise.all([
            window.nszAPI.getNszDir(),
            window.nszAPI.hasKeys(),
        ]).then(([dir, keys]) => {
            setNszDir(dir);
            setHasKeys(keys);
            setLoading(false);
        });
    }, []);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    // Listen for errors from main process
    useEffect(() => {
        if (!window.nszAPI) return;
        const unsub = window.nszAPI.onError((data) => {
            addToast(data.message || data, 'error');
        });
        return unsub;
    }, [addToast]);

    const handleSetupComplete = (dirPath) => {
        setNszDir(dirPath);
        setHasKeys(true);
        addToast('Ready to go!', 'success');
    };

    // Loading state
    if (loading) {
        return (
            <div className="setup-screen">
                <div className="setup-card">
                    <div className="setup-icon">⏳</div>
                    <h1 className="setup-title">Loading...</h1>
                </div>
            </div>
        );
    }

    // Setup screen if no tools or no keys
    if (!nszDir || !hasKeys) {
        return (
            <>
                <SetupPage
                    onComplete={handleSetupComplete}
                    needsKeys={!!nszDir && !hasKeys}
                />
                <ToastContainer toasts={toasts} />
            </>
        );
    }

    const pages = {
        'compress': CompressPage,
        'decompress': DecompressPage,
        'merge': MergePage,
        'convert': ConvertPage,
        'split': SplitPage,
        'create': CreatePage,
        'settings': SettingsPage,
    };

    // Main app
    return (
        <div className="app-shell">
            <Sidebar activePage={activePage} onNavigate={setActivePage} />
            <main className="main-content">
                {Object.entries(pages).map(([id, PageComponent]) => (
                    <div key={id} style={{ display: activePage === id ? 'block' : 'none' }}>
                        <PageComponent />
                    </div>
                ))}
            </main>
            <ToastContainer toasts={toasts} />
        </div>
    );
}
