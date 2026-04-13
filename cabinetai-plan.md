# Plan: `cabinetai` CLI Package

## Context

Cabinet currently bundles app + data together in one project directory. The user wants a new architecture where:
- The **app** (Next.js + daemon) lives at `~/.cabinet/app/v{version}/` — installed once, auto-downloaded on first use
- **Cabinets** are lightweight data directories anywhere on disk — just `.cabinet` + `.agents/` + `.jobs/` + content
- `cabinetai run` from any cabinet directory starts the app pointing at that directory
- `cabinetai create` creates new cabinets anywhere

No interactive shell prompts — the UI has its own onboarding wizard.

---

## Architecture

```
~/.cabinet/                               # Global Cabinet home
  config.json                             # Global config (port prefs, etc.)
  app/
    v0.2.12/                              # Version-pinned app install
      package.json
      .next/                              # Built Next.js app
      server/                             # Daemon server
      src/                                # Source (for dev server)
      scripts/                            # Dev scripts
      node_modules/
      .env.local                          # App-level env
  state/
    runtime-ports.json                    # Currently running server info

~/Development/my-startup/                 # A cabinet (this IS the data dir)
  .cabinet                                # Root manifest
  .agents/
    ceo/persona.md
  .jobs/
    weekly-brief.yaml
  index.md
  company/
    index.md
  engineering/
    .cabinet                              # Child cabinet
    .agents/
    index.md

~/Documents/personal-kb/                  # Another cabinet, anywhere else
  .cabinet
  .agents/
  index.md
```

**Key insight:** The cabinet directory IS what was previously `data/`. When the app starts, `CABINET_DATA_DIR` points at the cabinet directory. The app already supports this env var throughout — no changes needed to the Next.js app itself.

---

## Package Structure

```
cabinetai/
  package.json              # name: "cabinetai", bin: { "cabinetai": "./dist/index.js" }
  tsconfig.json
  esbuild.config.mjs
  src/
    index.ts                # Commander.js program, registers all commands
    commands/
      create.ts             # cabinetai create [name] — new cabinet directory
      run.ts                # cabinetai run — ensure app installed, start servers
      doctor.ts             # cabinetai doctor — health checks
      update.ts             # cabinetai update — download newer app version
      import.ts             # cabinetai import <template> — from hilash/cabinets
      list.ts               # cabinetai list — list cabinets in cwd
    lib/
      log.ts                # Colored console output (log, success, warning, error)
      process.ts            # npmCommand(), run() spawnSync wrapper, spawnChild()
      paths.ts              # CABINET_HOME (~/.cabinet), resolveAppDir(), findCabinetRoot()
      ports.ts              # isPortFree(), findAvailablePort(), runtime-ports.json I/O
      app-manager.ts        # ensureApp() — download + install app if missing
      cabinet-manifest.ts   # Read/write .cabinet YAML files
      health-checks.ts      # Individual doctor check implementations
```

### Dependencies
- `commander` — CLI framework
- `js-yaml` — YAML parsing
- `esbuild` (dev) — single-file bundler
- `typescript` (dev)

---

## Key Concepts

### `CABINET_HOME` (`~/.cabinet/`)
Global home directory for the Cabinet CLI. Contains the cached app installs, global config, and runtime state. Created automatically on first use.

### `findCabinetRoot(startDir)`
Walks up from `startDir` looking for a `.cabinet` file. Returns the directory containing it. This is how `cabinetai run` knows which cabinet to serve.

### `ensureApp(version)`
Checks if `~/.cabinet/app/v{version}/` exists and is ready. If not:
1. Downloads the release tarball from GitHub
2. Extracts to `~/.cabinet/app/v{version}/`
3. Runs `npm install`
4. Copies `.env.example` to `.env.local`
Returns the app directory path.

---

## Commands

### `cabinetai create [name]`
Creates a new cabinet directory.

**From anywhere:**
```bash
cd ~/Development
cabinetai create my-startup       # creates ./my-startup/ with cabinet structure
cd my-startup
cabinetai run                     # auto-installs app, starts server
```

**Inside an existing cabinet (creates sub-cabinet):**
```bash
cd ~/Development/my-startup
cabinetai create engineering      # creates ./engineering/ as child cabinet
```

**Flow:**
1. Determine if cwd has a `.cabinet` file (creating sub-cabinet) or not (creating new root)
2. Slugify name (lowercase, hyphens)
3. Create directory with:
   - `.cabinet` — YAML manifest:
     ```yaml
     schemaVersion: 1
     id: <slug>
     name: <Display Name>
     kind: root           # or "child" if inside existing cabinet
     version: 0.1.0
     description: ""
     entry: index.md
     ```
   - `.agents/` — empty directory
   - `.jobs/` — empty directory
   - `index.md` — entry page with frontmatter
4. If child cabinet, add `parent.shared_context` pointing to parent's key pages
5. Print success + next steps

### `cabinetai run`
Starts Cabinet serving the current cabinet directory.

**Flow:**
1. Find cabinet root — walk up from cwd looking for `.cabinet` file
2. If no `.cabinet` found, error: "No cabinet found. Run `cabinetai create` first."
3. Determine app version (from CLI package version, or `--app-version` flag)
4. **`ensureApp(version)`** — if `~/.cabinet/app/v{version}/` doesn't exist:
   - Print: "Installing Cabinet v{version}..."
   - Download release tarball from GitHub
   - Extract to `~/.cabinet/app/v{version}/`
   - Run `npm install` in the app dir
   - Copy `.env.example` to `.env.local`
   - Print: "Cabinet v{version} installed."
5. Run quick doctor (auto-fix what it can)
6. Find available ports — app (default 4000) and daemon (default 4100)
7. Start Next.js from `~/.cabinet/app/v{version}/` with env:
   - `CABINET_DATA_DIR=<cabinet root>`
   - `CABINET_APP_PORT=<port>`
   - `CABINET_APP_ORIGIN=http://127.0.0.1:<port>`
8. Start daemon from `~/.cabinet/app/v{version}/server/` with env:
   - `CABINET_DATA_DIR=<cabinet root>`
   - `CABINET_DAEMON_PORT=<port>`
9. Write runtime state to `~/.cabinet/state/runtime-ports.json`
10. Print: "Cabinet is running at http://127.0.0.1:<port>"
11. Open browser on macOS (`open`), Linux (`xdg-open`)
12. Handle SIGINT/SIGTERM: kill children, clean up state

**Port logic:** Ported from `scripts/dev-next.mjs` and `scripts/dev-daemon.mjs` — same algorithm (scan 200 ports from preferred, fallback to OS-assigned). Does NOT shell out to `npm run dev`.

**Server reuse:** Check `~/.cabinet/state/runtime-ports.json` — if a server is already running for this cabinet directory, reuse it (health check `/api/health` first).

### `cabinetai doctor`
Health checks:
1. Node version >= 18 (warn if < 20)
2. Cabinet root found (`.cabinet` file in cwd or ancestors)
3. App installed at `~/.cabinet/app/v{version}/`
4. App deps installed (`node_modules/next` exists in app dir)
5. `.env.local` exists in app dir
6. Ports available (4000/4100 or configured)

Flags: `--quiet` (suppress output, auto-fix only), `--fix` (attempt all fixes)

### `cabinetai update`
Downloads a newer app version.

**Flow:**
1. Fetch latest release manifest from GitHub (`cabinet-release.json`)
2. Compare with currently installed version(s) at `~/.cabinet/app/`
3. If newer available:
   - Download + install to `~/.cabinet/app/v{new}/`
   - Print: "Cabinet v{new} installed. Restart `cabinetai run` to use it."
4. If already up to date: "Cabinet is up to date (v{current})."

Old versions stay cached. `cabinetai run` uses the version matching the CLI's package version by default, or `--app-version` to override.

### `cabinetai list`
Lists cabinets in the current directory tree.

1. Walk cwd finding `.cabinet` files (same algorithm as `src/lib/cabinets/discovery.ts`)
2. Parse each, count agents (`.agents/*/persona.md`) and jobs (`.jobs/*.yaml`)
3. Print table:
   ```
   Name              Kind    Path                    Agents  Jobs
   My Startup        root    .                       3       2
   Engineering       child   engineering             2       1
   Marketing         child   marketing               1       3
   ```

### `cabinetai import <template>`
Imports a cabinet template from the `hilash/cabinets` GitHub registry.

1. Download template directory from `https://github.com/hilash/cabinets`
2. Extract into `./<template-slug>/` (or into cwd if inside existing cabinet)
3. Template contains `.cabinet`, `.agents/`, `.jobs/`, `index.md`, content pages
4. Fail gracefully if registry unreachable

---

## `create-cabinet` Refactor

`cli/index.cjs` becomes a thin wrapper that combines `create` + `run`:

```js
#!/usr/bin/env node
const { execSync } = require("child_process");
const args = process.argv.slice(2);
const dir = args[0] || "cabinet";

// npx create-cabinet my-project -> cabinetai create my-project + cabinetai run
try {
  execSync(`npx cabinetai@latest create ${dir}`, { stdio: "inherit" });
  execSync(`npx cabinetai@latest run`, { stdio: "inherit", cwd: dir });
} catch {
  process.exit(1);
}
```

`npx create-cabinet my-startup` = create the cabinet + auto-install app + start server + open browser.

### In-app update system

The current update system at `src/app/api/system/update/apply/route.ts:32` spawns `cli/index.cjs upgrade`. This needs rethinking for the new architecture:

- **For existing source installs** (users who already have Cabinet as a project): the update route continues working as-is — `cli/index.cjs` stays in the project and handles upgrades
- **For new `cabinetai` installs**: the web UI shows "New version available" with instructions to run `cabinetai update`. The apply endpoint detects the install kind and behaves accordingly.

We preserve backwards compatibility — `cli/index.cjs` keeps its current upgrade logic for source-managed installs. The new `cabinetai` model is additive.

---

## Global Config (`~/.cabinet/config.json`)

```json
{
  "schemaVersion": 1,
  "defaultAppPort": 4000,
  "defaultDaemonPort": 4100,
  "currentAppVersion": "0.2.12"
}
```

Minimal for now. Expanded later as needed.

---

## Release Pipeline Changes

### `scripts/release.sh`
Add version bump for `cabinetai/package.json`:
```bash
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" cabinetai/package.json
```
Add to git add: `cabinetai/package.json`

### `.github/workflows/release.yml`
Add `publish-cabinetai` job (parallel with `publish-cli`, after `release-assets`):
```yaml
publish-cabinetai:
  runs-on: ubuntu-latest
  needs: release-assets
  permissions:
    contents: read
    id-token: write
  defaults:
    run:
      working-directory: cabinetai
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        registry-url: https://registry.npmjs.org
    - run: npm ci
    - run: npm run build
    - run: npm publish --access public --provenance
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### `scripts/generate-release-manifest.mjs`
Add `cabinetaiPackage: "cabinetai"` and `cabinetaiVersion` fields to the manifest.

### `.gitignore`
Add: `cabinetai/dist/`, `cabinetai/node_modules/`

---

## Implementation Phases

### Phase 1: Scaffold + core lib
1. Create `cabinetai/` directory with `package.json`, `tsconfig.json`, `esbuild.config.mjs`
2. Implement `src/lib/log.ts` — colored console output
3. Implement `src/lib/process.ts` — spawn helpers, npmCommand()
4. Implement `src/lib/paths.ts` — `CABINET_HOME`, `resolveAppDir()`, `findCabinetRoot()`
5. Implement `src/lib/cabinet-manifest.ts` — read/write `.cabinet` YAML
6. Implement `src/index.ts` with Commander skeleton (stub commands)
7. Verify: `cd cabinetai && npm install && npm run build && node dist/index.js --help`

### Phase 2: `create` + `list`
8. Implement `src/commands/create.ts`
9. Implement `src/commands/list.ts`
10. Verify: `node dist/index.js create test-cabinet` creates correct structure
11. Verify: `node dist/index.js list` from inside a cabinet shows its tree

### Phase 3: `run` (the big one)
12. Implement `src/lib/app-manager.ts` — `ensureApp()`: download tarball, extract, npm install
13. Implement `src/lib/ports.ts` — port detection from `scripts/dev-next.mjs` and `scripts/dev-daemon.mjs`
14. Implement `src/commands/run.ts` — find cabinet, ensure app, start servers
15. Verify: `node dist/index.js run` from a cabinet dir starts both servers

### Phase 4: `doctor` + `update`
16. Implement `src/lib/health-checks.ts`
17. Implement `src/commands/doctor.ts`
18. Implement `src/commands/update.ts`
19. Verify: `node dist/index.js doctor` runs checks, `node dist/index.js update` fetches manifest

### Phase 5: `import`
20. Implement `src/commands/import.ts`
21. Verify: imports template from registry

### Phase 6: `create-cabinet` wrapper
22. Refactor `cli/index.cjs` to thin wrapper (create + run)
23. Verify: `node cli/index.cjs my-project` creates cabinet + starts server

### Phase 7: Release pipeline
24. Update `scripts/release.sh` — add cabinetai version bump
25. Update `.github/workflows/release.yml` — add publish-cabinetai job
26. Update `scripts/generate-release-manifest.mjs` — add cabinetai fields
27. Update `.gitignore`

---

## Critical Files

| File | Action |
|---|---|
| `cli/index.cjs` | Refactor to thin wrapper (Phase 6) |
| `src/app/api/system/update/apply/route.ts` | Preserved for source-managed installs; new cabinetai installs use `cabinetai update` |
| `scripts/dev-next.mjs` | Source for port detection + Next.js spawn logic (port to `cabinetai run`) |
| `scripts/dev-daemon.mjs` | Source for daemon spawn logic (port to `cabinetai run`) |
| `scripts/release.sh` | Add cabinetai version bump |
| `.github/workflows/release.yml` | Add publish-cabinetai job |
| `scripts/generate-release-manifest.mjs` | Add cabinetai fields |
| `src/lib/cabinets/discovery.ts` | Reference for `.cabinet` discovery algorithm (`list` command) |
| `src/types/cabinets.ts` | Reference for CabinetManifest type |

---

## Verification

1. **Build**: `cd cabinetai && npm run build` produces `dist/index.js`
2. **Help**: `node dist/index.js --help` shows all commands
3. **Create root**: `node dist/index.js create test-startup` in `/tmp` creates `/tmp/test-startup/` with `.cabinet`, `.agents/`, `.jobs/`, `index.md`
4. **Create child**: `cd /tmp/test-startup && node dist/index.js create engineering` creates child cabinet
5. **List**: `node dist/index.js list` from `/tmp/test-startup/` shows root + engineering
6. **Run**: `node dist/index.js run` from `/tmp/test-startup/`:
   - Downloads app to `~/.cabinet/app/v0.2.12/` (first time)
   - Starts Next.js + daemon
   - Opens browser at printed URL
   - `CABINET_DATA_DIR` points at `/tmp/test-startup/`
7. **Doctor**: `node dist/index.js doctor` reports app installed, cabinet found, ports available
8. **Update**: `node dist/index.js update` checks for newer version
9. **Wrapper**: `node cli/index.cjs my-project` creates cabinet + starts server (same as create + run)
