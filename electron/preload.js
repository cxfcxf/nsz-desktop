const { contextBridge, ipcRenderer } = require('electron');

/**
 * Subscribe to an IPC channel, returning an unsubscribe function.
 */
function onChannel(channel) {
    return (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}

contextBridge.exposeInMainWorld('nszAPI', {
    // Setup
    getNszDir: () => ipcRenderer.invoke('setup:getNszDir'),
    selectNszDir: () => ipcRenderer.invoke('setup:selectNszDir'),
    setNszDir: (dirPath) => ipcRenderer.invoke('setup:setNszDir', dirPath),

    // File operations
    compress: (files, options) => ipcRenderer.invoke('nsz:compress', files, options),
    decompress: (files, options) => ipcRenderer.invoke('nsz:decompress', files, options),
    cancel: () => ipcRenderer.invoke('nsz:cancel'),

    // Merge
    mergeFiles: (files, options) => ipcRenderer.invoke('merge:start', files, options),

    // Convert
    convert: (files, options) => ipcRenderer.invoke('nsz:convert', files, options),

    // Split
    split: (files, options) => ipcRenderer.invoke('nsz:split', files, options),

    // XCI Trim
    xciTrim: (files, options) => ipcRenderer.invoke('nsz:xciTrim', files, options),
    xciSuperTrim: (files, options) => ipcRenderer.invoke('nsz:xciSuperTrim', files, options),
    xciUntrim: (files, options) => ipcRenderer.invoke('nsz:xciUntrim', files, options),

    // Dialogs
    selectFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    selectOutputDir: () => ipcRenderer.invoke('dialog:openDir'),

    // Events (shared by all operations via the unified runner)
    onProgress: onChannel('nsz:progress'),
    onOutput: onChannel('nsz:output'),
    onStatus: onChannel('nsz:status'),
    onDone: onChannel('nsz:done'),
    onError: onChannel('nsz:error'),
    onLog: onChannel('nsz:log'),

    // Keys
    hasKeys: () => ipcRenderer.invoke('setup:hasKeys'),
    importKeys: () => ipcRenderer.invoke('setup:importKeys'),

    // Settings
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
