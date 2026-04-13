# cabinetai — Deployment Manual

## Overview

`cabinetai` is the runtime CLI for Cabinet. It manages the app installation, creates cabinets, and starts the server — all from a single command.

**Architecture:** The Cabinet web app installs to `~/.cabinet/app/v{version}/` (auto-downloaded on first use). Cabinets are lightweight data directories anywhere on disk — just a `.cabinet` manifest + `.agents/` + `.jobs/` + content files.

## Quick Start

```bash
# Create a new cabinet
npx cabinetai create my-startup

# Start it
cd my-startup
npx cabinetai run
```

Or use the `create-cabinet` shortcut (creates + starts in one step):

```bash
npx create-cabinet my-startup
```

## Commands

### `cabinetai create [name]`

Creates a new cabinet directory in the current folder.

```bash
# Create a root cabinet
cabinetai create my-startup

# Inside an existing cabinet, creates a child cabinet
cd my-startup
cabinetai create engineering
```

**What it creates:**

```
my-startup/
  .cabinet          # YAML manifest (name, id, kind, version)
  .agents/          # Agent personas directory
  .jobs/            # Scheduled job definitions
  index.md          # Entry page with frontmatter
```

### `cabinetai run`

Starts Cabinet serving the current cabinet directory.

```bash
cd my-startup
cabinetai run
```

**What it does:**

1. Finds the nearest `.cabinet` file (walks up from cwd)
2. Auto-downloads the app to `~/.cabinet/app/v{version}/` if not installed
3. Runs `npm install` if dependencies are missing
4. Finds available ports (defaults: app=4000, daemon=4100)
5. Starts Next.js dev server + daemon, both pointing at the cabinet dir via `CABINET_DATA_DIR`
6. Opens the browser

**Options:**

| Flag | Description |
|---|---|
| `--app-version <ver>` | Use a specific app version |
| `--no-open` | Don't open the browser |

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `CABINET_APP_PORT` | 4000 | Preferred app port |
| `CABINET_DAEMON_PORT` | 4100 | Preferred daemon port |

### `cabinetai doctor`

Runs health checks on the environment.

```bash
cabinetai doctor
cabinetai doctor --fix    # Attempt auto-repair
cabinetai doctor --quiet  # Suppress output, auto-fix only
```

**Checks:**

- Node.js version (>= 18, recommends >= 20)
- Cabinet root found (`.cabinet` file exists)
- App installed at `~/.cabinet/app/v{version}/`
- App dependencies installed
- `.env.local` present in app directory
- Ports available

### `cabinetai update`

Downloads a newer app version.

```bash
cabinetai update
```

Fetches the latest release manifest from GitHub, compares with installed versions, and downloads if newer. Old versions stay cached.

### `cabinetai list`

Lists all cabinets in the current directory tree.

```bash
cabinetai list
```

```
  Name              Kind    Path              Agents  Jobs
  ────────────────  ─────  ────────────────  ──────  ────
  Text Your Mom     root   .                 4       4
  App Development   child  app-development   4       3
  Reddit Community  child  marketing/reddit  4       3
```

### `cabinetai import <template>`

Imports a cabinet template from the [hilash/cabinets](https://github.com/hilash/cabinets) registry.

```bash
cabinetai import saas-startup
cabinetai import text-your-mom
```

Downloads the template via sparse git clone and copies it to the current directory.

## File System Layout

### Global (`~/.cabinet/`)

```
~/.cabinet/
  app/
    v0.2.12/              # Version-pinned app install
      package.json
      node_modules/
      .next/
      server/
      src/
      .env.local
  state/
    runtime-ports.json    # Currently running server info
```

### Cabinet directory (anywhere on disk)

```
my-startup/
  .cabinet                # YAML manifest
  .cabinet-state/         # Runtime state (auto-created by app)
    runtime-ports.json
    install.json
    file-schema.json
  .agents/
    ceo/
      persona.md          # Agent definition (YAML frontmatter + markdown)
      tasks/
    cto/
      persona.md
  .jobs/
    weekly-brief.yaml     # Scheduled job definition
  index.md                # Entry page
  company/
    index.md
  engineering/
    .cabinet              # Child cabinet manifest
    .agents/
    .jobs/
    index.md
```

### `.cabinet` manifest format

```yaml
schemaVersion: 1
id: my-startup
name: My Startup
kind: root              # or "child"
version: 0.1.0
description: ""
entry: index.md

# Child cabinets only:
parent:
  shared_context:
    - /company/strategy/index.md
    - /company/goals/index.md

access:
  mode: subtree-plus-parent-brief
```

## Publishing

`cabinetai` is published to npm as part of the Cabinet release pipeline.

### Package location

```
cabinet/
  cabinetai/              # CLI source (TypeScript + esbuild)
    package.json          # name: "cabinetai"
    src/
    dist/index.js         # Single bundled file (gitignored)
  cli/                    # create-cabinet wrapper
    package.json          # name: "create-cabinet"
    index.cjs
```

### Build

```bash
cd cabinetai
npm install
npm run build     # Produces dist/index.js via esbuild
```

### Release

The release script (`scripts/release.sh`) bumps versions in all three package.json files:

```bash
./scripts/release.sh patch   # or minor, major
```

GitHub Actions (`.github/workflows/release.yml`) publishes on `vX.Y.Z` tags:

1. `release-assets` — Create GitHub release with manifest
2. `publish-cli` — Publish `create-cabinet` to npm
3. `publish-cabinetai` — Build and publish `cabinetai` to npm
4. `electron-macos` — Build and publish desktop app

### Version synchronization

Three packages must stay in sync:

| File | Package |
|---|---|
| `package.json` | `cabinet` (the app) |
| `cli/package.json` | `create-cabinet` |
| `cabinetai/package.json` | `cabinetai` |

The release script handles all three. The CLI version is injected at build time from `package.json` via esbuild `define`.

### Release manifest

`cabinet-release.json` now includes:

```json
{
  "npmPackage": "create-cabinet",
  "createCabinetVersion": "0.2.12",
  "cabinetaiPackage": "cabinetai",
  "cabinetaiVersion": "0.2.12"
}
```

## Relationship: `create-cabinet` vs `cabinetai`

| | `create-cabinet` | `cabinetai` |
|---|---|---|
| npm name | `create-cabinet` | `cabinetai` |
| Purpose | First-time setup shortcut | Full runtime CLI |
| Usage | `npx create-cabinet my-project` | `npx cabinetai <command>` |
| Implementation | Thin wrapper — delegates to cabinetai | All logic lives here |
| When to use | Creating a brand new cabinet + starting it | Day-to-day operations |

`npx create-cabinet my-project` is equivalent to `cabinetai create my-project && cd my-project && cabinetai run`.

## Known Limitations

- **`.cabinet` vs `.cabinet-state` conflict:** The released v0.2.12 app uses `.cabinet` as a directory name for internal state. The current codebase has already renamed this to `.cabinet-state`. The first release including `cabinetai` will have both fixes aligned.
- **Import relies on git sparse checkout:** The `import` command requires `git` to be installed. If the registry repo changes structure, the sparse checkout paths may need updating.
