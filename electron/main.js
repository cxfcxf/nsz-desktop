const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const NszRunner = require('./nsz-runner');

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

    // In development, load from Vite dev server
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
}

app.whenReady().then(() => {
    const settings = loadSettings();

    nszRunner = new NszRunner(settings.nszDir || null);

    // Forward nsz-runner events to renderer
    const forwardEvent = (eventName, channel) => {
        nszRunner.on(eventName, (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(channel, data);
            }
        });
    };

    forwardEvent('progress', 'nsz:progress');
    forwardEvent('output', 'nsz:output');
    forwardEvent('status', 'nsz:status');
    forwardEvent('done', 'nsz:done');
    forwardEvent('nsz-error', 'nsz:error');
    forwardEvent('log', 'nsz:log');

    // ── Setup / NSZ directory ────────────────────────────────────
    ipcMain.handle('setup:getNszDir', async () => {
        return nszRunner.nszDir || null;
    });

    ipcMain.handle('setup:selectNszDir', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select NSZ Portable Directory',
            properties: ['openDirectory'],
            message: 'Select the nsz_vXXX_win64_portable folder containing nsz.exe',
        });
        if (result.canceled || result.filePaths.length === 0) return { ok: false };

        const dirPath = result.filePaths[0];
        if (!NszRunner.validateNszDir(dirPath)) {
            return { ok: false, error: 'nsz.exe not found in the selected directory.' };
        }

        // Save and apply
        nszRunner.setNszDir(dirPath);
        const currentSettings = loadSettings();
        currentSettings.nszDir = dirPath;
        saveSettings(currentSettings);

        return { ok: true, path: dirPath };
    });

    ipcMain.handle('setup:setNszDir', async (_event, dirPath) => {
        if (!NszRunner.validateNszDir(dirPath)) {
            return { ok: false, error: 'nsz.exe not found in that directory.' };
        }
        nszRunner.setNszDir(dirPath);
        const currentSettings = loadSettings();
        currentSettings.nszDir = dirPath;
        saveSettings(currentSettings);
        return { ok: true, path: dirPath };
    });

    // ── NSZ operations ─────────────────────────────────────────
    ipcMain.handle('nsz:compress', async (_event, files, options) => {
        nszRunner.run('compress', files, options);
        return { started: true };
    });

    ipcMain.handle('nsz:decompress', async (_event, files, options) => {
        nszRunner.run('decompress', files, options);
        return { started: true };
    });

    ipcMain.handle('nsz:info', async (_event, files) => {
        nszRunner.run('info', files, {});
        return { started: true };
    });

    ipcMain.handle('nsz:extract', async (_event, files, options) => {
        nszRunner.run('extract', files, options);
        return { started: true };
    });

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
        // Preserve nszDir
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
