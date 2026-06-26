import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const SETTINGS_DIR = join(homedir(), ".tokenmofang");
const SETTINGS_PATH = join(SETTINGS_DIR, "settings.json");
function ensureDir() {
    if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true });
    }
}
export function readSettings() {
    try {
        const raw = readFileSync(SETTINGS_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function writeSettings(settings) {
    ensureDir();
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}
//# sourceMappingURL=settings.js.map