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
    getInfo: (files) => ipcRenderer.invoke('nsz:info', files),
    extract: (files, options) => ipcRenderer.invoke('nsz:extract', files, options),
    cancel: () => ipcRenderer.invoke('nsz:cancel'),

    // Dialogs
    selectFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    selectOutputDir: () => ipcRenderer.invoke('dialog:openDir'),

    // NSZ events
    onProgress: onChannel('nsz:progress'),
    onOutput: onChannel('nsz:output'),
    onStatus: onChannel('nsz:status'),
    onDone: onChannel('nsz:done'),
    onError: onChannel('nsz:error'),
    onLog: onChannel('nsz:log'),

    // Merge operations
    mergeFiles: (files, options) => ipcRenderer.invoke('merge:start', files, options),
    cancelMerge: () => ipcRenderer.invoke('merge:cancel'),
    hasSquirrel: () => ipcRenderer.invoke('merge:hasSquirrel'),

    // Merge events
    onMergeProgress: onChannel('merge:progress'),
    onMergeOutput: onChannel('merge:output'),
    onMergeDone: onChannel('merge:done'),
    onMergeError: onChannel('merge:error'),
    onMergeLog: onChannel('merge:log'),

    // Keys
    hasKeys: () => ipcRenderer.invoke('setup:hasKeys'),
    importKeys: () => ipcRenderer.invoke('setup:importKeys'),

    // Settings
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
