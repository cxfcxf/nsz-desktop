const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nszAPI', {
    // Setup
    getNszDir: () => ipcRenderer.invoke('setup:getNszDir'),
    selectNszDir: () => ipcRenderer.invoke('setup:selectNszDir'),
    setNszDir: (dirPath) => ipcRenderer.invoke('setup:setNszDir', dirPath),

    // File operations
    compress: (files, options) => ipcRenderer.invoke('nsz:compress', files, options),
    decompress: (files, options) => ipcRenderer.invoke('nsz:decompress', files, options),
    getInfo: (files) => ipcRenderer.invoke('nsz:info', files),
    extract: (files, options) => ipcRenderer.invoke('nsz:extract', files, options),
    cancel: () => ipcRenderer.invoke('nsz:cancel'),

    // Dialogs
    selectFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    selectOutputDir: () => ipcRenderer.invoke('dialog:openDir'),

    // Events from main process
    onProgress: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:progress', handler);
        return () => ipcRenderer.removeListener('nsz:progress', handler);
    },
    onOutput: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:output', handler);
        return () => ipcRenderer.removeListener('nsz:output', handler);
    },
    onStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:status', handler);
        return () => ipcRenderer.removeListener('nsz:status', handler);
    },
    onDone: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:done', handler);
        return () => ipcRenderer.removeListener('nsz:done', handler);
    },
    onError: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:error', handler);
        return () => ipcRenderer.removeListener('nsz:error', handler);
    },
    onLog: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('nsz:log', handler);
        return () => ipcRenderer.removeListener('nsz:log', handler);
    },

    // Settings
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
