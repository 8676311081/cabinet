# Post-Auth Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Electron WebSocket port, update E2E tests for the new auth guard, and rebuild DMG.

**Architecture:** Three independent fixes: (1) Derive Multica WebSocket URL from the same dynamic port the Go server runs on, passed via Electron preload API. (2) Update E2E tests to expect the new LoginPage UI instead of the old "Connect Multica" text. (3) Rebuild DMG to include auth flow changes.

**Tech Stack:** Electron (preload.cjs, main.cjs), Playwright, Next.js, electron-forge

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/main.cjs` | **Modify** | Pass Multica WS port to preload via env + set `NEXT_PUBLIC_MULTICA_WS_URL` |
| `electron/preload.cjs` | **Modify** | Expose `multicaWsUrl` to renderer |
| `src/components/integrations/multica-provider.tsx` | **Modify** | Read wsUrl from `window.CabinetDesktop.multicaWsUrl` in Electron |
| `e2e/multica-integration.spec.ts` | **Modify** | Update auth guard assertions for new LoginPage text |
| `e2e/multica-navigation.spec.ts` | **Modify** | Account for auth guard on Multica routes |

---

### Task 1: Fix Electron WebSocket URL for Multica

**Files:**
- Modify: `electron/main.cjs:361-368`
- Modify: `electron/preload.cjs`
- Modify: `src/components/integrations/multica-provider.tsx`

**Problem:** In Electron, the Go server runs on a dynamic port (e.g., 52341). `MULTICA_API_URL` is set correctly for Next.js server-side rewrites, but `NEXT_PUBLIC_MULTICA_WS_URL` is never set — it defaults to `ws://localhost:8080/ws`. Since `NEXT_PUBLIC_*` env vars are baked in at build time, setting them at runtime doesn't work. We need to pass the dynamic port through the Electron preload bridge.

- [ ] **Step 1: Read current preload.cjs**

Run: `cat electron/preload.cjs`
Expected:
```js
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
});
```

- [ ] **Step 2: Update main.cjs to pass Multica WS URL via env**

In `electron/main.cjs`, in the `createWindow()` function (around line 361), after setting `MULTICA_API_URL`, also set `MULTICA_WS_URL`:

Find this block:
```js
  const multicaPort = await startMulticaServer();
  if (multicaPort) {
    const multicaUrl = `http://127.0.0.1:${multicaPort}`;
    process.env.MULTICA_API_URL = multicaUrl;
    console.log(`[multica] MULTICA_API_URL set to ${multicaUrl}`);
  }
```

Replace with:
```js
  const multicaPort = await startMulticaServer();
  if (multicaPort) {
    const multicaUrl = `http://127.0.0.1:${multicaPort}`;
    process.env.MULTICA_API_URL = multicaUrl;
    process.env.MULTICA_WS_URL = `ws://127.0.0.1:${multicaPort}/ws`;
    console.log(`[multica] MULTICA_API_URL set to ${multicaUrl}`);
  }
```

- [ ] **Step 3: Update preload.cjs to expose WS URL**

Replace the entire `electron/preload.cjs` with:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  multicaWsUrl: process.env.MULTICA_WS_URL || null,
});
```

- [ ] **Step 4: Update multica-provider.tsx to read from preload**

In `src/components/integrations/multica-provider.tsx`, change the `wsUrl` logic:

Find:
```tsx
  const wsUrl =
    process.env.NEXT_PUBLIC_MULTICA_WS_URL || "ws://localhost:8080/ws";
```

Replace with:
```tsx
  const wsUrl =
    (typeof window !== "undefined" && (window as Record<string, any>).CabinetDesktop?.multicaWsUrl) ||
    process.env.NEXT_PUBLIC_MULTICA_WS_URL ||
    "ws://localhost:8080/ws";
```

- [ ] **Step 5: Verify types pass**

Run: `cd /Users/qwen/cabinet && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/components/integrations/multica-provider.tsx
git commit -m "fix(electron): pass dynamic Multica WS port through preload bridge

NEXT_PUBLIC_* env vars are baked at build time so they can't carry
the runtime-assigned Go server port. Expose the WS URL via the
CabinetDesktop preload object instead."
```

---

### Task 2: Update E2E tests for new auth guard

**Files:**
- Modify: `e2e/multica-integration.spec.ts`
- Modify: `e2e/multica-navigation.spec.ts`

**Problem:** The old `MulticaAuthGuard` showed "Connect Multica" text. The new one renders `LoginPage` from `@multica/views/auth` which shows "Sign in to Multica". E2E tests that check for the old text will fail. Also, navigation tests that click Multica sidebar items now hit the auth guard instead of the views — they should verify they land on the auth guard (login page) since the Go server isn't running in E2E.

- [ ] **Step 1: Read current e2e/multica-integration.spec.ts**

Run: `cat e2e/multica-integration.spec.ts`

- [ ] **Step 2: Update multica-integration.spec.ts**

Replace the entire file with:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Multica integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/home", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=cabinet", { timeout: 10000 });
  });

  test("Issues page shows content or auth guard", async ({ page }) => {
    await page.goto("/#/issues", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.location.hash === "#/issues");

    // Either the issues list renders, or the auth guard shows LoginPage
    const issuesContent = page.locator("text=Issues").first();
    const authGuard = page.locator("text=Sign in to Multica").first();

    // Wait for either to appear
    await expect(issuesContent.or(authGuard)).toBeVisible({ timeout: 10000 });
  });

  test("AI panel has both Editor AI and Multica Chat tabs", async ({ page }) => {
    // Open AI panel if not already open — look for a toggle
    const editorTab = page.locator("text=Editor AI");
    const multicaTab = page.locator("text=Multica Chat");

    // Navigate to a page first to ensure AI panel has context
    await page.goto("/#/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // The AI panel tabs may only be visible when the panel is open
    // Try to find and verify them
    const editorTabVisible = await editorTab.isVisible().catch(() => false);
    const multicaTabVisible = await multicaTab.isVisible().catch(() => false);

    if (editorTabVisible || multicaTabVisible) {
      // At least one tab is visible — panel is open
      await expect(editorTab).toBeVisible();
      await expect(multicaTab).toBeVisible();
    }
    // If neither is visible, the AI panel is collapsed — that's acceptable
  });

  test("switching sections updates AI panel tab context", async ({ page }) => {
    // Extra wait for full hydration since this test is sensitive to timing
    await page.waitForTimeout(2000);
    const sidebar = page.locator("aside");

    // Go to Issues (multica section)
    await sidebar.getByRole("button", { name: "Issues", exact: true }).click();
    await page.waitForFunction(() => window.location.hash === "#/issues");
    await page.waitForTimeout(500);

    // Check if Multica Chat tab is active (if AI panel is visible)
    const multicaTab = page.locator("text=Multica Chat");
    const multicaTabVisible = await multicaTab.isVisible().catch(() => false);

    if (multicaTabVisible) {
      await expect(multicaTab).toBeVisible();
    }

    // Switch to home (KB section)
    await sidebar.getByText("cabinet").first().click();
    await page.waitForTimeout(300);

    const editorTab = page.locator("text=Editor AI");
    const editorTabVisible = await editorTab.isVisible().catch(() => false);

    if (editorTabVisible) {
      await expect(editorTab).toBeVisible();
    }
  });
});
```

The only change is line 15: `"Connect Multica"` → `"Sign in to Multica"`.

- [ ] **Step 3: Read current e2e/multica-navigation.spec.ts**

Run: `cat e2e/multica-navigation.spec.ts`

- [ ] **Step 4: Update multica-navigation.spec.ts**

The navigation tests click Multica sidebar buttons and verify the URL hash changes. The hash still changes correctly (the auth guard is rendered INSIDE the route, not blocking navigation). So the hash assertions should still pass. However, verify this by reading the test carefully.

If the tests already only check `window.location.hash` (not page content), no changes are needed. The auth guard wraps the view content but doesn't prevent the hash from changing — the sidebar navigation sets the hash independently.

If any test asserts on Multica view content (like "Issues list" or specific UI elements), update those assertions to also accept the auth guard text `"Sign in to Multica"`.

- [ ] **Step 5: Run E2E tests to verify**

Run: `cd /Users/qwen/cabinet && npx playwright test 2>&1 | tail -30`
Expected: All tests pass. If the Go server isn't running, Multica views will show the auth guard — tests should handle this gracefully.

- [ ] **Step 6: Commit**

```bash
git add e2e/multica-integration.spec.ts e2e/multica-navigation.spec.ts
git commit -m "fix(e2e): update tests for new MulticaAuthGuard LoginPage

Old guard showed 'Connect Multica', new one shows 'Sign in to Multica'
via the @multica/views LoginPage component."
```

---

### Task 3: Rebuild DMG with auth flow changes

**Files:**
- No code changes — build task only

- [ ] **Step 1: Verify Go binary exists**

Run: `ls -la /Users/qwen/cabinet/build/multica-server`
Expected: 16MB binary, darwin/arm64.

If missing, rebuild:
Run: `cd /Users/qwen/cabinet && npm run build:multica`

- [ ] **Step 2: Run full build + package**

Run: `cd /Users/qwen/cabinet && npm run electron:make 2>&1 | tail -30`

This runs: `build:multica` → `next build --webpack` → `electron:prep` → `electron-forge make`

Expected: DMG and ZIP created in `out/make/`.

- [ ] **Step 3: Verify output**

Run: `ls -lh /Users/qwen/cabinet/out/make/Cabinet-*.dmg /Users/qwen/cabinet/out/make/zip/darwin/arm64/Cabinet-*.zip`

Expected: Fresh DMG (~300MB) and ZIP (~320MB) with updated timestamps.

- [ ] **Step 4: No commit needed — build artifacts are gitignored**

---

## Testing Notes

- **E2E without Go server:** When the Go server isn't running, the auth guard's `LoginPage` will render (because `AuthInitializer` can't reach `/multica-api/me`). This is expected behavior — tests should accept either the view content or the login page.
- **Dev master code:** In non-production, verification code `888888` always works.
- **Electron WS URL:** After Task 1, the preload bridge passes the dynamic WS port. Verify by checking the browser console for WebSocket connection logs.
