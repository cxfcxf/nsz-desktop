const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const NszRunner = require('./nsz-runner');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let nszRunner;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return {};
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return true;
    } catch (e) {
        console.error('Failed to save settings:', e);
        return false;
    }
}

/**
 * Resolve the tools directory.
 * In production: <resourcesPath>/tools  (extraResources)
 * In dev:        <project_root>/tools
 */
function resolveToolsDir() {
    if (isDev) return path.join(__dirname, '..', 'tools');
    return path.join(process.resourcesPath, 'tools');
}

/**
 * Get the directory where the actual executable lives.
 * For portable exe, this is where the user placed it (not the temp extraction dir).
 * In dev, same as project root.
 */
function getExeDir() {
    if (isDev) return path.join(__dirname, '..');
    return path.dirname(app.getPath('exe'));
}

/**
 * Sync keys from the exe directory into the tools directory.
 * Users place prod.keys/keys.txt next to the portable exe;
 * we copy it into tools/ so nscb_rust.exe can find it.
 */
function syncKeysToToolsDir(toolsDir) {
    const exeDir = getExeDir();
    const keyNames = ['prod.keys', 'keys.txt'];

    for (const name of keyNames) {
        const src = path.join(exeDir, name);
        const dst = path.join(toolsDir, name);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
            try {
                fs.copyFileSync(src, dst);
                console.log(`Copied ${name} from exe directory to tools directory`);
            } catch (e) {
                console.error(`Failed to copy ${name}:`, e);
            }
        }
    }
}

function createWindow() {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0d1117',
        title: 'NSZ Desktop',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
}

app.whenReady().then(() => {
    const settings = loadSettings();

    // Auto-detect bundled tools directory, fall back to user-configured path
    const bundledToolsDir = resolveToolsDir();
    let toolsDir = settings.nszDir || null;

    if (fs.existsSync(path.join(bundledToolsDir, 'nscb_rust.exe'))) {
        toolsDir = bundledToolsDir;
        syncKeysToToolsDir(toolsDir);
    }

    nszRunner = new NszRunner(toolsDir);

    // Forward events to renderer
    const forwardEvent = (emitter, eventName, channel) => {
        emitter.on(eventName, (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(channel, data);
            }
        });
    };

    forwardEvent(nszRunner, 'progress', 'nsz:progress');
    forwardEvent(nszRunner, 'output', 'nsz:output');
    forwardEvent(nszRunner, 'status', 'nsz:status');
    forwardEvent(nszRunner, 'done', 'nsz:done');
    forwardEvent(nszRunner, 'nsz-error', 'nsz:error');
    forwardEvent(nszRunner, 'log', 'nsz:log');

    // ── Setup / Tools directory ───────────────────────────────────
    ipcMain.handle('setup:getNszDir', async () => {
        return nszRunner.nszDir || null;
    });

    function applyNszDir(dirPath) {
        nszRunner.setNszDir(dirPath);
        const currentSettings = loadSettings();
        currentSettings.nszDir = dirPath;
        saveSettings(currentSettings);
    }

    ipcMain.handle('setup:selectNszDir', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Tools Directory',
            properties: ['openDirectory'],
            message: 'Select the directory containing nscb_rust.exe and prod.keys (or keys.txt)',
        });
        if (result.canceled || result.filePaths.length === 0) return { ok: false };

        const dirPath = result.filePaths[0];
        if (!NszRunner.validateNszDir(dirPath)) {
            return { ok: false, error: 'nscb_rust.exe not found in the selected directory.' };
        }

        applyNszDir(dirPath);
        return { ok: true, path: dirPath };
    });

    ipcMain.handle('setup:setNszDir', async (_event, dirPath) => {
        if (!NszRunner.validateNszDir(dirPath)) {
            return { ok: false, error: 'nscb_rust.exe not found in that directory.' };
        }
        applyNszDir(dirPath);
        return { ok: true, path: dirPath };
    });

    ipcMain.handle('setup:hasKeys', async () => {
        const dir = nszRunner.nszDir;
        if (!dir) return false;
        const exeDir = getExeDir();
        const hasInTools = fs.existsSync(path.join(dir, 'keys.txt')) || fs.existsSync(path.join(dir, 'prod.keys'));
        const hasInExeDir = fs.existsSync(path.join(exeDir, 'keys.txt')) || fs.existsSync(path.join(exeDir, 'prod.keys'));
        if (hasInExeDir && !hasInTools) {
            syncKeysToToolsDir(dir);
        }
        return hasInTools || hasInExeDir;
    });

    ipcMain.handle('setup:importKeys', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select your encryption keys file',
            properties: ['openFile'],
            filters: [
                { name: 'Keys Files', extensions: ['keys', 'txt'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) return { ok: false };

        const srcFile = result.filePaths[0];
        const dir = nszRunner.nszDir;
        if (!dir) return { ok: false, error: 'Tools directory not configured.' };

        try {
            const dstKeys = path.join(dir, 'keys.txt');
            const dstProd = path.join(dir, 'prod.keys');
            fs.copyFileSync(srcFile, dstKeys);
            fs.copyFileSync(srcFile, dstProd);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: `Failed to copy keys: ${e.message}` };
        }
    });

    // ── NSZ operations (unified runner) ─────────────────────────
    const operationChannels = {
        'nsz:compress':      'compress',
        'nsz:decompress':    'decompress',
        'merge:start':       'merge',
        'nsz:convert':       'convert',
        'nsz:split':         'split',
        'nsz:xciTrim':       'xci_trim',
        'nsz:xciSuperTrim':  'xci_super_trim',
        'nsz:xciUntrim':     'xci_untrim',
    };

    for (const [channel, operation] of Object.entries(operationChannels)) {
        ipcMain.handle(channel, async (_event, files, options) => {
            nszRunner.run(operation, files, options);
            return { started: true };
        });
    }

    ipcMain.handle('nsz:cancel', async () => {
        nszRunner.cancel();
        return { cancelled: true };
    });

    // ── Dialog handlers ─────────────────────────────────────────
    ipcMain.handle('dialog:openFiles', async (_event, filters) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: filters || [
                { name: 'Switch Files', extensions: ['nsp', 'xci', 'nsz', 'xcz', 'ncz'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('dialog:openDir', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // ── Settings handlers ───────────────────────────────────────
    ipcMain.handle('settings:load', async () => {
        return loadSettings();
    });

    ipcMain.handle('settings:save', async (_event, settings) => {
        const current = loadSettings();
        const merged = { ...current, ...settings };
        return saveSettings(merged);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (nszRunner && nszRunner.isRunning()) {
        nszRunner.cancel();
    }
    if (process.platform !== 'darwin') app.quit();
});
