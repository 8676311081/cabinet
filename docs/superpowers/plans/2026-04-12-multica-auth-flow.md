# Multica Auth Flow Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `@multica/core` auth store and `@multica/views` LoginPage into Cabinet so Multica features require authentication, with inline login instead of a dead redirect.

**Architecture:** The `@multica/core` package already provides a complete auth stack: `ApiClient` (token injection), `AuthStore` (Zustand, sendCode/verifyCode/logout), `AuthInitializer` (hydration), and `LoginPage` (email + OTP + Google OAuth). Cabinet's `MulticaAuthGuard` currently does a raw fetch and renders a dead link — we replace it to use the existing store and render `LoginPage` inline. We add `onLogin`/`onLogout` callbacks to `MulticaProvider` for optional cookie sync with Next.js middleware.

**Tech Stack:** React 19, Zustand (via @multica/core), Next.js 16, @multica/views LoginPage component

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/integrations/multica-auth-guard.tsx` | **Rewrite** | Use `useAuthStore` from `@multica/core`, render `LoginPage` from `@multica/views` when unauthenticated |
| `src/components/integrations/multica-provider.tsx` | **Modify** | Add `onLogin`/`onLogout` callbacks that set/clear `multica-authed` cookie |
| `src/components/integrations/multica-views.tsx` | **Modify** | Re-export `LoginPage` for easy access |
| `src/components/integrations/multica-auth-guard.test.tsx` | **Create** | Tests for auth guard behavior |

---

### Task 1: Rewrite MulticaAuthGuard to use @multica/core auth store

**Files:**
- Modify: `src/components/integrations/multica-auth-guard.tsx`

The current auth guard does a raw `fetch("/multica-api/me")` and shows a link to `/multica-auth/login`. Replace it to:
1. Read `user` and `isLoading` from `useAuthStore` (already hydrated by `AuthInitializer` in `CoreProvider`)
2. When unauthenticated, render `LoginPage` from `@multica/views` inline
3. When authenticated, render children

- [ ] **Step 1: Read the current file to confirm starting state**

Run: `cat src/components/integrations/multica-auth-guard.tsx`
Expected: The raw-fetch version shown in the plan context.

- [ ] **Step 2: Rewrite multica-auth-guard.tsx**

Replace the entire contents of `src/components/integrations/multica-auth-guard.tsx` with:

```tsx
"use client";

import { useAuthStore } from "@multica/core/auth";
import { LoginPage } from "@multica/views/auth";

export function MulticaAuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSuccess={() => {
          // AuthStore already updated — React will re-render and show children
        }}
      />
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/qwen/cabinet && npx next build --webpack 2>&1 | tail -20`
Expected: Build succeeds (or at least no errors in `multica-auth-guard.tsx`). Note: The component is currently unused so import errors won't block the build — but verify no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/integrations/multica-auth-guard.tsx
git commit -m "refactor(auth): rewrite MulticaAuthGuard to use @multica/core auth store

Replace raw fetch + dead redirect with useAuthStore integration.
Renders LoginPage from @multica/views inline when unauthenticated."
```

---

### Task 2: Add onLogin/onLogout cookie sync to MulticaProvider

**Files:**
- Modify: `src/components/integrations/multica-provider.tsx`

The `CoreProvider` accepts `onLogin` and `onLogout` callbacks. We use these to set/clear a simple `multica-authed=1` cookie that Next.js middleware can check (for future use — e.g., redirecting unauthenticated users away from Multica routes at the edge).

- [ ] **Step 1: Read the current file**

Run: `cat src/components/integrations/multica-provider.tsx`
Expected: Current version with no callbacks.

- [ ] **Step 2: Add onLogin/onLogout callbacks**

Replace the entire contents of `src/components/integrations/multica-provider.tsx` with:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, type ReactNode } from "react";

const CoreProvider = dynamic(
  () => import("@multica/core/platform").then((m) => m.CoreProvider),
  { ssr: false }
);

type MulticaProviderProps = {
  children: ReactNode;
};

export function MulticaProvider({ children }: MulticaProviderProps) {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_MULTICA_API_URL || "/multica-api";
  const wsUrl =
    process.env.NEXT_PUBLIC_MULTICA_WS_URL || "ws://localhost:8080/ws";

  const onLogin = useCallback(() => {
    document.cookie = "multica-authed=1; path=/; max-age=2592000; SameSite=Lax";
  }, []);

  const onLogout = useCallback(() => {
    document.cookie = "multica-authed=; path=/; max-age=0";
  }, []);

  return (
    <CoreProvider
      apiBaseUrl={apiBaseUrl}
      wsUrl={wsUrl}
      onLogin={onLogin}
      onLogout={onLogout}
    >
      {children}
    </CoreProvider>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/qwen/cabinet && npx next build --webpack 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/integrations/multica-provider.tsx
git commit -m "feat(auth): add onLogin/onLogout cookie sync to MulticaProvider

Sets multica-authed cookie on login, clears on logout.
Enables future Next.js middleware checks for Multica auth state."
```

---

### Task 3: Wire MulticaAuthGuard into Multica view routes

**Files:**
- Modify: `src/components/integrations/multica-views.tsx`
- Investigate: Where Multica views are rendered in the app (likely hash-routed views)

The auth guard needs to wrap Multica-specific views that require authentication (issues, agents, inbox, etc.). Cabinet uses hash-based routing, so we need to find where Multica views are rendered and wrap them.

- [ ] **Step 1: Find where Multica views are rendered**

Search for imports of `multica-views` components in the app:

Run: `grep -r "InboxPage\|MyIssuesPage\|MulticaAgentsPage\|IssuesPage\|RuntimesPage\|SkillsPage\|MulticaSettingsPage\|ProjectsPage" src/ --include="*.tsx" -l`

This will show which files render Multica views — those are the ones that need the auth guard.

- [ ] **Step 2: Wrap each Multica view usage with MulticaAuthGuard**

For each file found in Step 1, wrap the Multica view component with `<MulticaAuthGuard>`. The pattern is:

```tsx
import { MulticaAuthGuard } from "@/components/integrations/multica-auth-guard";

// Before:
<InboxPage />

// After:
<MulticaAuthGuard>
  <InboxPage />
</MulticaAuthGuard>
```

Apply this pattern to every Multica view rendering site. If all views are rendered through a single router/switch component, wrap at that level instead of wrapping each individually.

- [ ] **Step 3: Verify the app compiles and renders**

Run: `cd /Users/qwen/cabinet && npx next build --webpack 2>&1 | tail -20`
Expected: Build succeeds.

Then start dev server and verify:
1. Navigate to a Multica view (e.g., Issues) — should show login form if not authenticated
2. Enter email, get code (use `888888` in dev), verify — should show the view
3. Refresh page — should stay authenticated (token persisted in localStorage)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): wire MulticaAuthGuard into Multica view routes

Multica features (issues, agents, inbox, etc.) now require
authentication. Shows inline LoginPage when not signed in."
```

---

### Task 4: Handle Electron environment (CORS + localhost Go server)

**Files:**
- Modify: `src/components/integrations/multica-provider.tsx` (conditionally set apiBaseUrl for Electron)

In Electron, the Go server runs on `localhost:8080` while the Next.js app runs on a different port. The `NEXT_PUBLIC_MULTICA_API_URL` env var should handle this, but we need to verify:

1. In Electron, `window.CabinetDesktop` is set (see layout.tsx script tag)
2. The Go server is started by `electron/main.cjs` on a dynamic or fixed port
3. The rewrite proxy (`/multica-api/*` → `localhost:8080`) works in Electron's standalone mode

- [ ] **Step 1: Check Electron main process for Go server port**

Run: `grep -n "MULTICA\|8080\|multica.*port\|startMultica" electron/main.cjs | head -30`

Identify what port the Go server runs on and whether it's configurable.

- [ ] **Step 2: Verify apiBaseUrl works in Electron**

In Electron standalone mode, Next.js rewrites should still work because the app is served by the Next.js standalone server. Verify by checking:

Run: `grep -n "rewrite\|proxy\|MULTICA_API" next.config.ts`

If rewrites work in standalone mode, no changes needed — `/multica-api/*` will proxy to `localhost:8080` in both dev and Electron.

If rewrites DON'T work in standalone mode, we need to detect Electron and set `apiBaseUrl` to `http://localhost:8080`:

```tsx
const apiBaseUrl = typeof window !== "undefined" && (window as any).CabinetDesktop
  ? "http://localhost:8080"
  : (process.env.NEXT_PUBLIC_MULTICA_API_URL || "/multica-api");
```

- [ ] **Step 3: Test in Electron (if possible)**

Run: `cd /Users/qwen/cabinet && npm run electron:start`

Verify:
1. Go server starts (check console logs)
2. Multica views load behind auth guard
3. Login with `888888` master code works
4. After login, Multica API calls succeed (issues load, etc.)

- [ ] **Step 4: Commit if changes were needed**

```bash
git add src/components/integrations/multica-provider.tsx
git commit -m "fix(electron): ensure Multica API base URL works in Electron standalone"
```

---

### Task 5: Add logout button to Cabinet UI

**Files:**
- Modify: `src/components/settings/settings-page.tsx` or `src/components/layout/header-actions.tsx`

Users need a way to log out of Multica. Add a logout button in the settings or header area.

- [ ] **Step 1: Find the best place for a logout button**

Run: `grep -n "logout\|sign.out\|Multica.*setting" src/components/settings/settings-page.tsx src/components/layout/header-actions.tsx`

Check if there's already a Multica settings section or user menu.

- [ ] **Step 2: Add logout functionality**

The logout function is available from the auth store:

```tsx
import { useAuthStore } from "@multica/core/auth";

// In the component:
const user = useAuthStore((s) => s.user);
const logout = useAuthStore((s) => s.logout);

// Render a button when user is logged in:
{user && (
  <Button variant="ghost" size="sm" onClick={logout}>
    Sign out of Multica
  </Button>
)}
```

Place this in whichever location makes sense based on Step 1 findings. If there's a Multica settings tab, add it there. If not, add it to the header user menu or a general settings section.

- [ ] **Step 3: Verify logout works**

1. Log in to Multica
2. Click the logout button
3. Multica views should show the login form again
4. `multica-authed` cookie should be cleared
5. localStorage `multica_token` should be removed

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): add Multica logout button

Allows users to sign out of Multica from the settings/header."
```

---

## Testing Notes

- **Dev master code:** In non-production, the verification code `888888` always works (see `auth.go:275`)
- **JWT expiry:** Tokens last 30 days (`auth.go:182`)
- **Token storage:** `multica_token` in localStorage, auto-hydrated by `AuthInitializer`
- **API paths:** Auth endpoints are `/multica-auth/send-code` and `/multica-auth/verify-code` (proxied via Next.js rewrites to Go server)
- **401 handling:** `ApiClient.handleUnauthorized()` clears token and triggers `onUnauthorized` callback, which clears localStorage

## Dependencies

- `@multica/core` — already vendored at `packages/multica-core`
- `@multica/views` — already vendored at `packages/multica-views`
- `@multica/ui` — already vendored at `packages/multica-ui` (used by LoginPage for Card, Input, Button, InputOTP)
- Go server must be running for auth endpoints (dev: `npm run dev:daemon` or `MULTICA_API_URL` pointing to running instance)
