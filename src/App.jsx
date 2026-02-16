import { useState, useCallback, useEffect, useRef } from 'react';

// ============================================================
// Shared Components
// ============================================================

function Sidebar({ activePage, onNavigate }) {
    const pages = [
        { id: 'compress', icon: '📦', label: 'Compress' },
        { id: 'decompress', icon: '📂', label: 'Decompress' },
        { id: 'merge', icon: '🔗', label: 'Merge' },
        { id: 'info', icon: 'ℹ️', label: 'File Info' },
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
                NSZ v4.6.1 Backend
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
                        <div
                            key={i}
                            className={`output-line ${line.toLowerCase().includes('error') ? 'error' :
                                line.includes('Done!') ? 'success' :
                                    line.startsWith('[') ? 'info' : ''
                                }`}
                        >
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

// ============================================================
// Pages
// ============================================================

function CompressPage() {
    const [files, setFiles] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ percent: 0, message: '' });
    const [outputLines, setOutputLines] = useState([]);
    const [outputDir, setOutputDir] = useState('');

    // Options
    const [level, setLevel] = useState(18);
    const [block, setBlock] = useState(false);
    const [solid, setSolid] = useState(false);
    const [longMode, setLongMode] = useState(false);
    const [verify, setVerify] = useState(false);
    const [keep, setKeep] = useState(false);
    const [threads, setThreads] = useState(-1);
    const [overwrite, setOverwrite] = useState(false);

    useEffect(() => {
        if (!window.nszAPI) return;
        const unsubs = [
            window.nszAPI.onProgress((data) => {
                setProgress(data);
            }),
            window.nszAPI.onOutput((line) => {
                setOutputLines(prev => [...prev.slice(-200), line]);
            }),
            window.nszAPI.onDone((data) => {
                setRunning(false);
                setProgress({ percent: 100, message: `Completed (exit code: ${data.code})` });
            }),
            window.nszAPI.onError((msg) => {
                setOutputLines(prev => [...prev, `ERROR: ${msg}`]);
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, []);

    const handleAddFiles = (newFiles) => {
        setFiles(prev => [...prev, ...newFiles.filter(f => !prev.includes(f))]);
    };

    const handleRemoveFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ percent: 0, message: 'Starting compression...' });
        setOutputLines([]);

        const opts = {
            level,
            block: block || undefined,
            solid: solid || undefined,
            long: longMode || undefined,
            verify: verify || undefined,
            keep: keep || undefined,
            threads: threads !== -1 ? threads : undefined,
            overwrite: overwrite || undefined,
            output: outputDir || undefined,
        };

        await window.nszAPI.compress(files, opts);
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
        setProgress({ percent: 0, message: 'Cancelled' });
    };

    const handleSelectOutputDir = async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) setOutputDir(dir);
    };

    return (
        <div>
            <div className="page-header">
                <h2>Compress</h2>
                <p>Compress NSP/XCI files to NSZ/XCZ format</p>
            </div>

            <DropZone
                onFiles={handleAddFiles}
                accept={['nsp', 'xci']}
                hint="Drop NSP or XCI files to compress"
            />

            <FileList files={files} onRemove={handleRemoveFile} />

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
                                    {level <= 8 ? 'Fast' : level <= 14 ? 'Normal' : level <= 18 ? 'Great' : 'Ultra'}
                                </span>
                            </div>

                            <div className="option-group">
                                <label className="option-label">Threads</label>
                                <input
                                    type="number"
                                    value={threads}
                                    onChange={(e) => setThreads(Number(e.target.value))}
                                    min="-1"
                                    placeholder="-1 = auto"
                                />
                                <span className="option-description">-1 = auto detect CPU cores</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={block} onChange={setBlock} label="Block Compression" />
                                <span className="option-description">Multi-threaded with random access</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={solid} onChange={setSolid} label="Solid Compression" />
                                <span className="option-description">Higher ratio, no random access</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={longMode} onChange={setLongMode} label="Long Distance Mode" />
                                <span className="option-description">Better compression (slower)</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={verify} onChange={setVerify} label="Verify After" />
                                <span className="option-description">Hash check after compression</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={keep} onChange={setKeep} label="Keep All Partitions" />
                                <span className="option-description">Allow bit-identical recreation</span>
                            </div>

                            <div className="option-group">
                                <Toggle checked={overwrite} onChange={setOverwrite} label="Overwrite Existing" />
                                <span className="option-description">Overwrite files with same name</span>
                            </div>
                        </div>
                    </div>

                    <div className="dir-picker">
                        <input
                            type="text"
                            value={outputDir}
                            onChange={(e) => setOutputDir(e.target.value)}
                            placeholder="Output directory (default: same as source)"
                        />
                        <button className="btn btn-secondary btn-sm" onClick={handleSelectOutputDir}>
                            Browse
                        </button>
                    </div>

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <div className="actions-bar">
                        <span className="spacer" />
                        {running ? (
                            <button className="btn btn-danger" onClick={handleCancel}>
                                ✕ Cancel
                            </button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { setFiles([]); setOutputLines([]); setProgress({ percent: 0, message: '' }); }}
                                >
                                    Clear All
                                </button>
                                <button className="btn btn-primary btn-lg" onClick={handleStart}>
                                    🚀 Start Compression
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function DecompressPage() {
    const [files, setFiles] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ percent: 0, message: '' });
    const [outputLines, setOutputLines] = useState([]);
    const [outputDir, setOutputDir] = useState('');
    const [verify, setVerify] = useState(false);
    const [threads, setThreads] = useState(-1);
    const [overwrite, setOverwrite] = useState(false);

    useEffect(() => {
        if (!window.nszAPI) return;
        const unsubs = [
            window.nszAPI.onProgress((data) => setProgress(data)),
            window.nszAPI.onOutput((line) => setOutputLines(prev => [...prev.slice(-200), line])),
            window.nszAPI.onDone((data) => {
                setRunning(false);
                setProgress({ percent: 100, message: `Completed (exit code: ${data.code})` });
            }),
            window.nszAPI.onError((msg) => setOutputLines(prev => [...prev, `ERROR: ${msg}`])),
        ];
        return () => unsubs.forEach(fn => fn());
    }, []);

    const handleAddFiles = (newFiles) => {
        setFiles(prev => [...prev, ...newFiles.filter(f => !prev.includes(f))]);
    };

    const handleStart = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ percent: 0, message: 'Starting decompression...' });
        setOutputLines([]);
        await window.nszAPI.decompress(files, {
            verify: verify || undefined,
            threads: threads !== -1 ? threads : undefined,
            overwrite: overwrite || undefined,
            output: outputDir || undefined,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancel();
        setRunning(false);
    };

    const handleSelectOutputDir = async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) setOutputDir(dir);
    };

    return (
        <div>
            <div className="page-header">
                <h2>Decompress</h2>
                <p>Decompress NSZ/XCZ/NCZ files back to NSP/XCI format</p>
            </div>

            <DropZone
                onFiles={handleAddFiles}
                accept={['nsz', 'xcz', 'ncz']}
                hint="Drop NSZ, XCZ, or NCZ files to decompress"
            />

            <FileList files={files} onRemove={(i) => setFiles(prev => prev.filter((_, idx) => idx !== i))} />

            {files.length > 0 && (
                <>
                    <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="card-header">
                            <span className="card-title">Decompression Options</span>
                        </div>
                        <div className="options-panel">
                            <div className="option-group">
                                <label className="option-label">Threads</label>
                                <input
                                    type="number"
                                    value={threads}
                                    onChange={(e) => setThreads(Number(e.target.value))}
                                    min="-1"
                                    placeholder="-1 = auto"
                                />
                            </div>
                            <div className="option-group">
                                <Toggle checked={verify} onChange={setVerify} label="Verify After" />
                            </div>
                            <div className="option-group">
                                <Toggle checked={overwrite} onChange={setOverwrite} label="Overwrite Existing" />
                            </div>
                        </div>
                    </div>

                    <div className="dir-picker">
                        <input
                            type="text"
                            value={outputDir}
                            onChange={(e) => setOutputDir(e.target.value)}
                            placeholder="Output directory (default: same as source)"
                        />
                        <button className="btn btn-secondary btn-sm" onClick={handleSelectOutputDir}>
                            Browse
                        </button>
                    </div>

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <div className="actions-bar">
                        <span className="spacer" />
                        {running ? (
                            <button className="btn btn-danger" onClick={handleCancel}>✕ Cancel</button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { setFiles([]); setOutputLines([]); setProgress({ percent: 0, message: '' }); }}
                                >
                                    Clear All
                                </button>
                                <button className="btn btn-primary btn-lg" onClick={handleStart}>
                                    📂 Start Decompression
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function InfoPage() {
    const [files, setFiles] = useState([]);
    const [infoText, setInfoText] = useState('');
    const [running, setRunning] = useState(false);

    useEffect(() => {
        if (!window.nszAPI) return;
        const unsubs = [
            window.nszAPI.onOutput((line) => {
                setInfoText(prev => prev + line + '\n');
            }),
            window.nszAPI.onDone(() => setRunning(false)),
            window.nszAPI.onError((msg) => setInfoText(prev => prev + `ERROR: ${msg}\n`)),
        ];
        return () => unsubs.forEach(fn => fn());
    }, []);

    const handleAddFiles = (newFiles) => {
        setFiles(newFiles);
        setInfoText('');
    };

    const handleGetInfo = async () => {
        if (files.length === 0 || !window.nszAPI) return;
        setRunning(true);
        setInfoText('');
        await window.nszAPI.getInfo(files);
    };

    return (
        <div>
            <div className="page-header">
                <h2>File Info</h2>
                <p>View detailed information about Switch game files</p>
            </div>

            <DropZone
                onFiles={handleAddFiles}
                hint="Drop any Switch file to view its info"
            />

            <FileList files={files} onRemove={(i) => setFiles(prev => prev.filter((_, idx) => idx !== i))} />

            {files.length > 0 && (
                <div className="actions-bar">
                    <span className="spacer" />
                    <button
                        className="btn btn-primary"
                        onClick={handleGetInfo}
                        disabled={running}
                    >
                        {running ? '⏳ Loading...' : 'ℹ️ Get Info'}
                    </button>
                </div>
            )}

            {infoText && (
                <div className="info-display">{infoText}</div>
            )}
        </div>
    );
}

function MergePage() {
    const [files, setFiles] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ percent: 0, message: '' });
    const [outputLines, setOutputLines] = useState([]);
    const [outputDir, setOutputDir] = useState('');
    const [format, setFormat] = useState('xci');
    const [hasSquirrel, setHasSquirrel] = useState(null);

    useEffect(() => {
        if (window.nszAPI) {
            window.nszAPI.hasSquirrel().then(setHasSquirrel);
        }
    }, []);

    useEffect(() => {
        if (!window.nszAPI) return;
        const unsubs = [
            window.nszAPI.onMergeProgress((data) => setProgress(data)),
            window.nszAPI.onMergeOutput((line) => setOutputLines(prev => [...prev.slice(-200), line])),
            window.nszAPI.onMergeDone((data) => {
                setRunning(false);
                setProgress({
                    percent: 100,
                    message: data.code === 0 ? 'Merge completed successfully!' : `Completed with exit code: ${data.code}`,
                });
            }),
            window.nszAPI.onMergeError((msg) => setOutputLines(prev => [...prev, `ERROR: ${msg}`])),
        ];
        return () => unsubs.forEach(fn => fn());
    }, []);

    const handleAddFiles = (newFiles) => {
        setFiles(prev => [...prev, ...newFiles.filter(f => !prev.includes(f))]);
    };

    const handleRemoveFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleStart = async () => {
        if (files.length < 2 || !window.nszAPI) return;
        setRunning(true);
        setProgress({ percent: 0, message: 'Starting merge...' });
        setOutputLines([]);
        await window.nszAPI.mergeFiles(files, {
            output: outputDir || undefined,
            format,
        });
    };

    const handleCancel = async () => {
        if (window.nszAPI) await window.nszAPI.cancelMerge();
        setRunning(false);
        setProgress({ percent: 0, message: 'Cancelled' });
    };

    const handleSelectOutputDir = async () => {
        if (!window.nszAPI) return;
        const dir = await window.nszAPI.selectOutputDir();
        if (dir) setOutputDir(dir);
    };

    if (hasSquirrel === false) {
        return (
            <div>
                <div className="page-header">
                    <h2>Merge</h2>
                    <p>Combine base game + updates + DLCs into a single file</p>
                </div>
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Setup Required</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
                        Merge requires <code style={{
                            background: 'rgba(0, 212, 170, 0.1)',
                            color: 'var(--accent-primary)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontFamily: "'Consolas', 'Courier New', monospace",
                            fontSize: 'var(--font-size-xs)',
                        }}>squirrel.exe</code> to be placed in the same directory as nsz.exe.
                        <br /><br />
                        Build it from the <a
                            href="https://github.com/cxfcxf/NSC_BUILDER/tree/fixes"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-primary)' }}
                        >NSC_Builder fixes branch</a> using PyInstaller, then copy squirrel.exe next to nsz.exe.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h2>Merge</h2>
                <p>Combine base game (XCI/NSP) + updates + DLCs into a single XCI or NSP</p>
            </div>

            <DropZone
                onFiles={handleAddFiles}
                accept={['xci', 'nsp']}
                hint="Drop base game, update, and DLC files (XCI, NSP only)"
            />

            <FileList files={files} onRemove={handleRemoveFile} />

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
                        </div>
                    </div>

                    <div className="dir-picker">
                        <input
                            type="text"
                            value={outputDir}
                            onChange={(e) => setOutputDir(e.target.value)}
                            placeholder="Output directory (default: same as first file)"
                        />
                        <button className="btn btn-secondary btn-sm" onClick={handleSelectOutputDir}>
                            Browse
                        </button>
                    </div>

                    {(running || outputLines.length > 0) && (
                        <ProgressDisplay progress={progress} outputLines={outputLines} />
                    )}

                    <div className="actions-bar">
                        <span className="spacer" />
                        {running ? (
                            <button className="btn btn-danger" onClick={handleCancel}>
                                ✕ Cancel
                            </button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { setFiles([]); setOutputLines([]); setProgress({ percent: 0, message: '' }); }}
                                >
                                    Clear All
                                </button>
                                <button
                                    className="btn btn-primary btn-lg"
                                    onClick={handleStart}
                                    disabled={files.length < 2}
                                >
                                    🔗 Start Merge
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function SettingsPage() {
    const [settings, setSettings] = useState({
        defaultLevel: 18,
        defaultThreads: -1,
        defaultMulti: 4,
        defaultOutputDir: '',
        defaultVerify: 'quick',
        defaultBlockSize: 20,
        fixPadding: false,
        parseCnmt: false,
        rmOldVersion: false,
        rmSource: false,
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
                <p>Default options for compression and decompression</p>
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

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Default Threads</h4>
                            <p>-1 for auto-detect CPU cores</p>
                        </div>
                        <div className="settings-row-control">
                            <input
                                type="number"
                                value={settings.defaultThreads}
                                onChange={(e) => update('defaultThreads', Number(e.target.value))}
                                min="-1"
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Parallel Tasks</h4>
                            <p>Number of files to compress in parallel</p>
                        </div>
                        <div className="settings-row-control">
                            <input
                                type="number"
                                value={settings.defaultMulti}
                                onChange={(e) => update('defaultMulti', Number(e.target.value))}
                                min="1"
                                max="16"
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Block Size</h4>
                            <p>Block size for random read access (2^x bytes)</p>
                        </div>
                        <div className="settings-row-control">
                            <select
                                value={settings.defaultBlockSize}
                                onChange={(e) => update('defaultBlockSize', Number(e.target.value))}
                            >
                                <option value={16}>64 KB</option>
                                <option value={17}>128 KB</option>
                                <option value={18}>256 KB</option>
                                <option value={19}>512 KB</option>
                                <option value={20}>1 MB (default)</option>
                                <option value={21}>2 MB</option>
                                <option value={22}>4 MB</option>
                                <option value={23}>8 MB</option>
                                <option value={24}>16 MB</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Verification</h4>
                            <p>Default verify mode after compression</p>
                        </div>
                        <div className="settings-row-control">
                            <select
                                value={settings.defaultVerify}
                                onChange={(e) => update('defaultVerify', e.target.value)}
                            >
                                <option value="none">None</option>
                                <option value="quick">Quick (NCA hashes)</option>
                                <option value="full">Full (NCA + PFS0)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3 className="settings-section-title">Advanced</h3>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Fix Padding</h4>
                            <p>Fix PFS0 padding to match nxdumptool/no-intro standard</p>
                        </div>
                        <div className="settings-row-control">
                            <Toggle
                                checked={settings.fixPadding}
                                onChange={(v) => update('fixPadding', v)}
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Parse CNMT</h4>
                            <p>Extract TitleId/Version from CNMT metadata</p>
                        </div>
                        <div className="settings-row-control">
                            <Toggle
                                checked={settings.parseCnmt}
                                onChange={(v) => update('parseCnmt', v)}
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Remove Old Versions</h4>
                            <p>Automatically remove older versions when found</p>
                        </div>
                        <div className="settings-row-control">
                            <Toggle
                                checked={settings.rmOldVersion}
                                onChange={(v) => update('rmOldVersion', v)}
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Remove Source Files</h4>
                            <p>Delete source after processing (use with verify!)</p>
                        </div>
                        <div className="settings-row-control">
                            <Toggle
                                checked={settings.rmSource}
                                onChange={(v) => update('rmSource', v)}
                            />
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h3 className="settings-section-title">Paths</h3>
                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h4>Default Output Directory</h4>
                            <p>Where compressed/decompressed files are saved by default</p>
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

    const handleOpenToolsDir = async () => {
        if (window.nszAPI) await window.nszAPI.openToolsDir();
    };

    const handleRefresh = async () => {
        if (!window.nszAPI) return;
        const has = await window.nszAPI.hasKeys();
        if (has) {
            const dir = await window.nszAPI.getNszDir();
            onComplete(dir);
        } else {
            setError('Keys file not found. Please place prod.keys or keys.txt in the tools directory and try again.');
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
                        <h3>Add Encryption Keys</h3>
                        <p>
                            Place your <code>prod.keys</code> (or <code>keys.txt</code>) file
                            in the tools directory next to nsz.exe and squirrel.exe.
                            <br /><br />
                            This file contains your Switch console's encryption keys,
                            required for processing game files.
                        </p>
                    </div>

                    <button
                        className="btn btn-secondary btn-lg setup-browse-btn"
                        onClick={handleOpenToolsDir}
                        style={{ marginBottom: 'var(--space-md)' }}
                    >
                        📂 Open Tools Directory
                    </button>

                    <button
                        className="btn btn-primary btn-lg setup-browse-btn"
                        onClick={handleRefresh}
                    >
                        🔄 I've added my keys — Continue
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
                    Modern GUI for NSZ compression, decompression & merging
                </p>

                <div className="setup-divider" />

                <div className="setup-instruction">
                    <h3>Locate Tools Directory</h3>
                    <p>
                        Select the directory containing <code>nsz.exe</code>, <code>squirrel.exe</code>,
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
        const unsub = window.nszAPI.onError((msg) => {
            addToast(msg, 'error');
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

    // Main app
    return (
        <div className="app-shell">
            <Sidebar activePage={activePage} onNavigate={setActivePage} />
            <main className="main-content">
                <div style={{ display: activePage === 'compress' ? 'block' : 'none' }}>
                    <CompressPage />
                </div>
                <div style={{ display: activePage === 'decompress' ? 'block' : 'none' }}>
                    <DecompressPage />
                </div>
                <div style={{ display: activePage === 'merge' ? 'block' : 'none' }}>
                    <MergePage />
                </div>
                <div style={{ display: activePage === 'info' ? 'block' : 'none' }}>
                    <InfoPage />
                </div>
                <div style={{ display: activePage === 'settings' ? 'block' : 'none' }}>
                    <SettingsPage />
                </div>
            </main>
            <ToastContainer toasts={toasts} />
        </div>
    );
}

