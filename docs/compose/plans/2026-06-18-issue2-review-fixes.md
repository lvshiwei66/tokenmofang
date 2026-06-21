# Issue #2 Code Review 第二轮修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 code review issues from issue #2 (setup command) second round.

**Architecture:** Refactor duplicate `getVersion()` into shared utility, fix root detection logic, add type validation, improve test coverage, clean up unused imports.

**Tech Stack:** TypeScript, vitest (same as existing codebase)

---

### Task 1: Extract common `getVersion` utility (I-1)

**Covers:** I-1 — 三个 detector 的 `getVersion()` 完全重复

**Files:**
- Create: `code/cli/src/utils/version.ts`
- Modify: `code/cli/src/detectors/codex.ts`
- Modify: `code/cli/src/detectors/claude-code.ts`
- Modify: `code/cli/src/detectors/openclaw.ts`

- [ ] **Step 1: Create shared getVersion utility**

Create `code/cli/src/utils/version.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getVersion(dir: string): string | undefined {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return undefined;

  try {
    const content = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Update codex.ts to use shared getVersion**

Replace the `private getVersion()` method and its import:

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Detector, AppConfig } from "./types.js";
import { getVersion } from "../utils/version.js";

export class CodexDetector implements Detector {
  name = "codex";

  detect(): AppConfig | null {
    const configDir = join(homedir(), ".codex");
    const configPath = join(configDir, "config.toml");

    if (!existsSync(configPath)) {
      return null;
    }

    const version = getVersion(configDir);

    return {
      name: "codex",
      version,
      path: configDir,
      configPath,
      configFormat: "toml",
    };
  }
}
```

- [ ] **Step 3: Update claude-code.ts to use shared getVersion**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Detector, AppConfig } from "./types.js";
import { getVersion } from "../utils/version.js";

export class ClaudeCodeDetector implements Detector {
  name = "claude-code";

  detect(): AppConfig | null {
    const configDir = join(homedir(), ".claude");
    const configPath = join(configDir, "settings.json");

    if (!existsSync(configPath)) {
      return null;
    }

    const version = getVersion(configDir);

    return {
      name: "claude-code",
      version,
      path: configDir,
      configPath,
      configFormat: "json",
    };
  }
}
```

- [ ] **Step 4: Update openclaw.ts to use shared getVersion**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Detector, AppConfig } from "./types.js";
import { getVersion } from "../utils/version.js";

export class OpenClawDetector implements Detector {
  name = "openclaw";

  detect(): AppConfig | null {
    const configDir = join(homedir(), ".openclaw");
    const configPath = join(configDir, "config.yaml");

    if (!existsSync(configPath)) {
      return null;
    }

    const version = getVersion(configDir);

    return {
      name: "openclaw",
      version,
      path: configDir,
      configPath,
      configFormat: "yaml",
    };
  }
}
```

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add code/cli/src/utils/version.ts code/cli/src/detectors/codex.ts code/cli/src/detectors/claude-code.ts code/cli/src/detectors/openclaw.ts
git commit -m "refactor(cli): extract shared getVersion utility from detectors"
```

---

### Task 2: Fix root detection prompt logic (I-2)

**Covers:** I-2 — root 用户不需要额外权限提示，应提示配置文件权限风险

**Files:**
- Modify: `code/cli/src/commands/setup.ts:9-11`

- [ ] **Step 1: Fix the root detection warning**

In `code/cli/src/commands/setup.ts`, replace lines 9-11:

**Before:**
```typescript
  if (userInfo().uid === 0) {
    console.warn("⚠️  正在以 root 权限运行，某些操作可能需要额外权限。");
    console.warn("   建议使用普通用户运行此命令。\n");
  }
```

**After:**
```typescript
  if (userInfo().uid === 0) {
    console.warn("⚠️  以 root 运行可能导致配置文件权限问题，建议使用普通用户。");
    console.warn("   部分应用配置文件可能被 root 所有，导致应用无法读取。\n");
  }
```

- [ ] **Step 2: Run tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add code/cli/src/commands/setup.ts
git commit -m "fix(cli): correct root detection warning message in setup"
```

---

### Task 3: Add detector test coverage for null return path (I-4)

**Covers:** I-4 — 未测试"应用未安装时返回 null"的路径

**Files:**
- Modify: `code/cli/src/__tests__/detectors.test.ts`

- [ ] **Step 1: Add null return tests for each detector**

Replace `code/cli/src/__tests__/detectors.test.ts` with:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectAllApps } from "../detectors/index.js";
import { CodexDetector } from "../detectors/codex.js";
import { ClaudeCodeDetector } from "../detectors/claude-code.js";
import { OpenClawDetector } from "../detectors/openclaw.js";
import * as fs from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

describe("App detectors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectAllApps", () => {
    it("returns array", () => {
      const apps = detectAllApps();
      expect(Array.isArray(apps)).toBe(true);
    });

    it("handles errors gracefully", () => {
      const apps = detectAllApps();
      expect(apps).toBeDefined();
    });
  });

  describe("CodexDetector", () => {
    it("detect function exists", () => {
      const detector = new CodexDetector();
      expect(typeof detector.detect).toBe("function");
    });

    it("returns null when config file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = new CodexDetector();
      const result = detector.detect();
      expect(result).toBeNull();
    });

    it("returns AppConfig with required fields when config exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const detector = new CodexDetector();
      const result = detector.detect();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("name", "codex");
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("configPath");
      expect(result).toHaveProperty("configFormat", "toml");
    });
  });

  describe("ClaudeCodeDetector", () => {
    it("detect function exists", () => {
      const detector = new ClaudeCodeDetector();
      expect(typeof detector.detect).toBe("function");
    });

    it("returns null when config file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = new ClaudeCodeDetector();
      const result = detector.detect();
      expect(result).toBeNull();
    });

    it("returns AppConfig with required fields when config exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const detector = new ClaudeCodeDetector();
      const result = detector.detect();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("name", "claude-code");
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("configPath");
      expect(result).toHaveProperty("configFormat", "json");
    });
  });

  describe("OpenClawDetector", () => {
    it("detect function exists", () => {
      const detector = new OpenClawDetector();
      expect(typeof detector.detect).toBe("function");
    });

    it("returns null when config file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = new OpenClawDetector();
      const result = detector.detect();
      expect(result).toBeNull();
    });

    it("returns AppConfig with required fields when config exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const detector = new OpenClawDetector();
      const result = detector.detect();

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("name", "openclaw");
      expect(result).toHaveProperty("path");
      expect(result).toHaveProperty("configPath");
      expect(result).toHaveProperty("configFormat", "yaml");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify new tests pass**

Run: `npx vitest run src/__tests__/detectors.test.ts`
Expected: All tests PASS (including new null-return tests)

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add code/cli/src/__tests__/detectors.test.ts
git commit -m "test(cli): add null return path coverage for detectors"
```

---

### Task 4: Remove unused import + stage vitest.config.ts (M-1, M-2)

**Covers:** M-1 (unused mkdirSync import), M-2 (vitest.config.ts not staged)

**Files:**
- Modify: `code/cli/src/__tests__/setup.test.ts:3`
- Stage: `code/cli/vitest.config.ts`

- [ ] **Step 1: Remove unused mkdirSync import**

In `code/cli/src/__tests__/setup.test.ts`, line 3:

**Before:**
```typescript
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
```

**After:**
```typescript
import { existsSync, readFileSync, unlinkSync } from "node:fs";
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit (including vitest.config.ts)**

```bash
git add code/cli/src/__tests__/setup.test.ts code/cli/vitest.config.ts
git commit -m "chore(cli): remove unused import and stage vitest.config.ts"
```

---

## Final Verification

### Task 5: Full verification

**Files:** None — verification only

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: All tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Lint**

Run: `npx eslint src/`
Expected: No errors

- [ ] **Step 4: Report completion on issue #2**

Update issue #2 with completion of all 2nd-round review tasks.

---

## Summary

| ID | Task | Files Changed |
|----|------|--------------|
| I-1 | Extract shared getVersion | +utils/version.ts, ~codex.ts, ~claude-code.ts, ~openclaw.ts |
| I-2 | Fix root detection prompt | ~setup.ts:9-11 |
| I-3 | (Covered by I-1 — shared getVersion includes type check) | (part of utils/version.ts) |
| I-4 | Detector null-return tests | ~detectors.test.ts |
| M-1 | Remove unused import | ~setup.test.ts:3 |
| M-2 | Stage vitest.config.ts | +vitest.config.ts |

**Note:** I-3 (getVersion return value type validation) is implemented as part of I-1 — the shared `getVersion()` in `utils/version.ts` already includes `typeof pkg.version === "string"` check. No separate task needed.
