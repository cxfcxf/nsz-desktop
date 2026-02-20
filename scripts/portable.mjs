/**
 * Assemble a portable folder from the Tauri build output.
 *
 * Run after `tauri build`:
 *   npm run dist:portable
 *
 * Output: release/NSCB Desktop/
 */
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PRODUCT_NAME = 'NSCB Desktop';
const RELEASE_DIR = 'release';
const OUT = join(RELEASE_DIR, PRODUCT_NAME);
const TARGET_DIR = join('src-tauri', 'target', 'release');

console.log('Assembling portable folder...');

if (existsSync(OUT)) {
    rmSync(OUT, { recursive: true });
}
mkdirSync(OUT, { recursive: true });

const exeCandidates = [
    `${PRODUCT_NAME}.exe`,
    `${PRODUCT_NAME.toLowerCase().replace(/\s+/g, '-')}.exe`,
];
let exeName = exeCandidates.find(name => existsSync(join(TARGET_DIR, name)));
if (!exeName) {
    exeName = readdirSync(TARGET_DIR).find(name => name.toLowerCase().endsWith('.exe'));
}
if (!exeName) {
    console.error(`ERROR: no .exe found in ${TARGET_DIR}. Did the build succeed?`);
    process.exit(1);
}

const exeSrc = join(TARGET_DIR, exeName);
cpSync(exeSrc, join(OUT, exeName));
console.log(`  ${exeName}`);

console.log(`\nPortable folder ready: ${OUT}/`);
console.log('Zip this folder to distribute.');
