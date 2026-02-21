import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

let cachedToolsDir: string | null = null;

export async function getToolsDir(): Promise<string> {
    if (!cachedToolsDir) {
        try {
            cachedToolsDir = await invoke<string>('get_tools_dir');
        } catch {
            cachedToolsDir = 'tools';
        }
    }
    return cachedToolsDir;
}

export async function getToolsDirOrNull(): Promise<string | null> {
    try {
        return await getToolsDir();
    } catch {
        return null;
    }
}

export async function hasKeys(): Promise<boolean> {
    try {
        return await invoke<boolean>('has_keys');
    } catch {
        return false;
    }
}

export async function hasBackend(): Promise<boolean> {
    try {
        return await invoke<boolean>('has_backend');
    } catch {
        return false;
    }
}

export async function importKeys(): Promise<{ ok: boolean; error?: string }> {
    const selected = await open({
        title: 'Select your encryption keys file',
        multiple: false,
        filters: [
            { name: 'Keys Files', extensions: ['keys', 'txt'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    if (!selected) return { ok: false };

    const srcFile = selected as string;
    try {
        await invoke('import_keys', { srcPath: srcFile });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: `Failed to copy keys: ${e.message || e}` };
    }
}

export async function importBackend(): Promise<{ ok: boolean; error?: string }> {
    const selected = await open({
        title: 'Select nscb_rust.exe',
        multiple: false,
        filters: [
            { name: 'Executable', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    if (!selected) return { ok: false };

    const srcFile = selected as string;
    try {
        await invoke('import_nscb_binary', { srcPath: srcFile });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: `Failed to copy nscb_rust.exe: ${e.message || e}` };
    }
}

export interface FileFilter {
    name: string;
    extensions: string[];
}

export async function selectFiles(filters?: FileFilter[]): Promise<string[]> {
    const result = await open({
        multiple: true,
        filters: filters || [
            { name: 'Switch Files', extensions: ['nsp', 'xci', 'nsz', 'xcz', 'ncz'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    if (!result) return [];
    return result as string[];
}

export async function selectOutputDir(): Promise<string | null> {
    const result = await open({
        directory: true,
        multiple: false,
    });
    return result as string | null;
}

export async function openExternal(url: string): Promise<void> {
    await openUrl(url);
}

// GitHub release helpers

export interface ReleaseInfo {
    tag: string;
    downloadUrl: string;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    try {
        const res = await fetch('https://api.github.com/repos/cxfcxf/nscb_rust/releases/latest');
        if (!res.ok) return null;
        const data = await res.json();
        const tag: string = data.tag_name ?? '';
        const asset = (data.assets as any[])?.find(
            (a: any) => typeof a.name === 'string' && a.name.endsWith('.exe'),
        );
        if (!asset?.browser_download_url) return null;
        return { tag, downloadUrl: asset.browser_download_url };
    } catch {
        return null;
    }
}

export async function downloadBackend(url: string): Promise<void> {
    await invoke('download_backend', { url });
}

export async function getInstalledVersion(): Promise<string | null> {
    try {
        const v = await invoke<string>('get_backend_version');
        return v || null;
    } catch {
        return null;
    }
}

export async function saveInstalledVersion(tag: string): Promise<void> {
    await invoke('save_backend_version', { version: tag });
}
