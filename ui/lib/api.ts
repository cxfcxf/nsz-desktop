import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

async function getAppDataPath(): Promise<string> {
    return '.';
}

async function getSettingsPath(): Promise<string> {
    const dir = await getAppDataPath();
    return await join(dir, 'settings.json');
}

export async function loadSettings(): Promise<Record<string, any>> {
    try {
        const path = await getSettingsPath();
        if (await exists(path)) {
            const text = await readTextFile(path);
            return JSON.parse(text);
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return {};
}

export async function saveSettings(settings: Record<string, any>): Promise<boolean> {
    try {
        const dir = await getAppDataPath();
        if (!(await exists(dir))) {
            await mkdir(dir, { recursive: true });
        }
        const current = await loadSettings();
        const merged = { ...current, ...settings };
        const path = await getSettingsPath();
        await writeTextFile(path, JSON.stringify(merged, null, 2));
        return true;
    } catch (e) {
        console.error('Failed to save settings:', e);
        return false;
    }
}

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
