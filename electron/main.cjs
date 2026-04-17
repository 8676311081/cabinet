/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog } = require("electron");

// Suppress EPIPE errors from broken pipes (e.g. after force-kill)
process.stdout.on("error", (err) => { if (err.code === "EPIPE") process.exit(0); });
process.stderr.on("error", (err) => { if (err.code === "EPIPE") process.exit(0); });

if (require("electron-squirrel-startup")) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const isDev = !app.isPackaged;
let missingConfiguredDataDir = null;
const managedDataDir = (() => {
  if (process.env.CABINET_DATA_DIR) return process.env.CABINET_DATA_DIR;
  // Read user-configured data dir from cabinet-data-dir.txt (set via Settings > Storage)
  try {
    const txtPath = path.join(app.getPath("userData"), "cabinet-data-dir.txt");
    const dir = fs.readFileSync(txtPath, "utf-8").trim();
    if (dir) {
      if (fs.existsSync(dir)) return dir;
      missingConfiguredDataDir = dir;
      console.warn(`[cabinet] Configured data directory does not exist: ${dir}`);
    }
  } catch {}
  return path.join(app.getPath("userData"), "cabinet-data");
})();
const updateStatusPath = path.join(managedDataDir, ".cabinet", "update-status.json");
let mainWindow = null;
let backendChildren = [];
let closingFromBackendFailure = false;

function writeUpdateStatus(status) {
  fs.mkdirSync(path.dirname(updateStatusPath), { recursive: true });
  fs.writeFileSync(updateStatusPath, JSON.stringify(status, null, 2), "utf8");
}

function tryPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      // TODO: This probe has an unavoidable TOCTOU gap between close() and the real bind.
      // Node.js does not provide an atomic loopback port reservation API for this handoff.
      server.close(() => resolve(port));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate a loopback port."));
      });
    });
    server.on("error", reject);
  });
}

async function waitForHealth(url, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for Cabinet at ${url}`);
}

function multicaPatFilePath() {
  return path.join(app.getPath("userData"), "multica-pat.json");
}

function readMulticaPatFromFile() {
  try {
    const patFile = multicaPatFilePath();
    if (!fs.existsSync(patFile)) return null;
    const raw = fs.readFileSync(patFile, "utf8");
    const data = JSON.parse(raw);
    const token = typeof data?.token === "string" ? data.token.trim() : "";
    return token || null;
  } catch {
    return null;
  }
}

function writeMulticaPatToFile(token) {
  const patFile = multicaPatFilePath();
  fs.writeFileSync(patFile, JSON.stringify({ token }), "utf8");
  fs.chmodSync(patFile, 0o600);
}

// readInitialPatFile polls for a PAT written by the multica server to a
// 0600 handoff file. The server writes the token after seeding; we read it
// here instead of parsing stdout so the secret never crosses the inherited
// stdio of agent children or OS log pipes.
async function readInitialPatFile(patPath, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (fs.existsSync(patPath)) {
        const token = fs.readFileSync(patPath, "utf8").trim();
        if (token) return token;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function waitForMulticaPat(timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const token = process.env.MULTICA_PAT || readMulticaPatFromFile();
    if (token) {
      process.env.MULTICA_PAT = token;
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

function spawnBackend(command, args, env) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });
  backendChildren.push(child);
  return child;
}

function spawnNodeBackend(args, env) {
  if (isDev) {
    return spawnBackend(process.execPath, args, env);
  }

  const bundledNodePath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ".next",
    "standalone",
    "bin",
    "node"
  );

  if (fs.existsSync(bundledNodePath)) {
    return spawnBackend(bundledNodePath, args, env);
  }

  return spawnBackend(process.execPath, args, {
    ...env,
    // Fallback for older packages that do not yet bundle a standalone Node
    // runtime alongside the embedded Next.js server.
    ELECTRON_RUN_AS_NODE: "1",
  });
}

function packagedStandalonePath(...parts) {
  return path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone", ...parts);
}

function getDarwinNodePtyPrebuildDir() {
  return path.join("prebuilds", `darwin-${process.arch}`);
}

/**
 * macOS Sequoia+ blocks execution of native binaries inside .app bundles.
 * Copy node-pty to a writable location outside the bundle so spawn-helper
 * can execute, and return the external node_modules path for NODE_PATH.
 */
function extractNativeModules() {
  const externalModulesDir = path.join(app.getPath("userData"), "native-modules");
  const externalNodePty = path.join(externalModulesDir, "node-pty");
  const bundledNodePty = packagedStandalonePath(".native", "node-pty");
  const prebuildDir = path.join(externalNodePty, getDarwinNodePtyPrebuildDir());

  // Check if bundled version has changed (by comparing package.json mtime)
  const bundledPkgPath = path.join(bundledNodePty, "package.json");
  const externalPkgPath = path.join(externalNodePty, "package.json");
  let needsCopy = true;

  if (fs.existsSync(externalPkgPath) && fs.existsSync(bundledPkgPath)) {
    const bundledMtime = fs.statSync(bundledPkgPath).mtimeMs;
    const externalMtime = fs.statSync(externalPkgPath).mtimeMs;
    needsCopy = bundledMtime > externalMtime;
  }

  if (needsCopy) {
    fs.rmSync(externalNodePty, { recursive: true, force: true });
    fs.mkdirSync(externalModulesDir, { recursive: true });
    fs.cpSync(bundledNodePty, externalNodePty, { recursive: true });

    // Remove quarantine flags and ad-hoc codesign native binaries so macOS allows execution
    for (const name of ["spawn-helper", "pty.node"]) {
      const target = path.join(prebuildDir, name);
      if (fs.existsSync(target)) {
        try {
          execFileSync("xattr", ["-dr", "com.apple.quarantine", target]);
        } catch {}
        try {
          execFileSync("codesign", ["--force", "--sign", "-", target]);
        } catch {}
      }
    }
  }

  return externalModulesDir;
}

/**
 * Copy bundled seed content (default pages, agent library, playbooks) into the
 * managed data directory.  Merges non-destructively: existing files are never
 * overwritten so user edits survive app updates.
 */
function seedDefaultContent() {
  const seedDir = packagedStandalonePath(".seed");
  if (!fs.existsSync(seedDir)) {
    return;
  }

  const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else if (!fs.existsSync(dest)) {
      // Only copy if the destination file doesn't already exist
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(seedDir, managedDataDir);
}

function ensureManagedData() {
  fs.mkdirSync(managedDataDir, { recursive: true });
  // Seed default content (pages, agent library, playbooks).
  // Non-destructive: never overwrites existing files, so user edits survive
  // and new templates from app updates are added automatically.
  seedDefaultContent();
}

async function startMulticaServer() {
  let binaryPath;

  if (isDev) {
    binaryPath = process.env.MULTICA_SERVER_PATH || path.resolve(__dirname, "..", "..", "multica", "server", "bin", "server");
  } else {
    binaryPath = path.join(process.resourcesPath, "multica-server");
  }

  if (!fs.existsSync(binaryPath)) {
    console.log(`[multica] Binary not found at ${binaryPath} — multica features will be offline`);
    return null;
  }

  const multicaPort = await tryPort(18080).catch(() => getFreePort());
  const multicaDbDir = path.join(app.getPath("userData"), "multica-db");
  fs.mkdirSync(multicaDbDir, { recursive: true });

  console.log(`[multica] Starting server on port ${multicaPort} (binary: ${binaryPath})`);

  const child = spawn(binaryPath, [], {
    env: {
      ...process.env,
      PORT: String(multicaPort),
      MULTICA_EMBEDDED_DB: "true",
      MULTICA_EMBEDDED_DB_DIR: multicaDbDir,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  backendChildren.push(child);

  // Forward server stdout to console. The PAT is handed off via a 0600 file
  // written by the server (see writeSecret in multica main.go) rather than
  // stdout, because stdout is inherited by agent children and can surface in
  // OS logs.
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    for (const line of text.split("\n").filter(Boolean)) {
      console.log(`[multica-server] ${line}`);
    }
  });

  const patFilePath = path.join(multicaDbDir, "initial-pat");

  child.on("exit", (code, signal) => {
    console.log(`[multica] Server exited (code=${code}, signal=${signal})`);
  });

  try {
    const baseUrl = `http://127.0.0.1:${multicaPort}`;
    try {
      await waitForHealth(`${baseUrl}/health`, 30_000);
    } catch (healthErr) {
      // Backward compatibility for older multica-server builds.
      await waitForHealth(`${baseUrl}/api/health`, 10_000);
      console.log("[multica] /health unavailable, using legacy /api/health check");
      void healthErr;
    }
    console.log(`[multica] Server is ready on port ${multicaPort}`);
    // Read the PAT from the on-disk handoff file (0600) rather than stdout.
    const token = await readInitialPatFile(patFilePath, 5_000);
    if (token) {
      process.env.MULTICA_PAT = token;
      writeMulticaPatToFile(token);
      console.log(`[multica] PAT loaded from ${patFilePath} (${token.length} chars)`);
    } else {
      const fallback = await waitForMulticaPat(2_000);
      if (!fallback) {
        console.warn("[multica] MULTICA_PAT not available yet; daemon may start without PAT");
      }
    }
    return multicaPort;
  } catch (err) {
    console.error(`[multica] Server failed to become healthy: ${err.message}`);
    child.kill("SIGTERM");
    return null;
  }
}

async function startEmbeddedCabinet() {
  if (isDev) {
    return {
      appUrl: process.env.ELECTRON_START_URL || "http://127.0.0.1:3000",
    };
  }

  ensureManagedData();

  const externalModulesDir = extractNativeModules();
  const [appPort, daemonPort] = await Promise.all([getFreePort(), getFreePort()]);
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const daemonOrigin = `http://127.0.0.1:${daemonPort}`;
  const daemonWsOrigin = `ws://127.0.0.1:${daemonPort}`;

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(appPort),
    CABINET_RUNTIME: "electron",
    CABINET_INSTALL_KIND: "electron-macos",
    CABINET_DATA_DIR: managedDataDir,
    CABINET_APP_PORT: String(appPort),
    CABINET_DAEMON_PORT: String(daemonPort),
    CABINET_APP_ORIGIN: appOrigin,
    CABINET_DAEMON_URL: daemonOrigin,
    CABINET_PUBLIC_DAEMON_ORIGIN: daemonWsOrigin,
  };
  const patForChildren = process.env.MULTICA_PAT || readMulticaPatFromFile();
  if (patForChildren) {
    env.MULTICA_PAT = patForChildren;
  }

  const serverEntry = packagedStandalonePath("server.js");
  const daemonEntry = packagedStandalonePath("server", "cabinet-daemon.cjs");

  // Daemon needs NODE_PATH to find node-pty outside the .app bundle
  const daemonEnv = {
    ...env,
    NODE_PATH: [externalModulesDir, env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };

  const serverChild = spawnNodeBackend([serverEntry], env);
  const daemonChild = spawnNodeBackend([daemonEntry], daemonEnv);

  serverChild.on("exit", (code, signal) => {
    handleCriticalBackendExit("Next.js server", code, signal, daemonChild);
  });
  daemonChild.on("exit", (code, signal) => {
    handleCriticalBackendExit("Cabinet daemon", code, signal, serverChild);
  });

  // Race: either health check succeeds or a backend crashes early
  const earlyExit = (label, child) =>
    new Promise((_, reject) => {
      child.on("exit", (code, signal) => {
        reject(new Error(`${label} exited unexpectedly (code=${code}, signal=${signal})`));
      });
      child.on("error", (err) => {
        reject(new Error(`${label} failed to spawn: ${err.message}`));
      });
    });

  await Promise.race([
    Promise.all([
      waitForHealth(`${appOrigin}/api/health`),
      waitForHealth(`${daemonOrigin}/health`),
    ]),
    earlyExit("Next.js server", serverChild),
    earlyExit("Cabinet daemon", daemonChild),
  ]);

  return { appUrl: appOrigin };
}

function configureAutoUpdates() {
  // Auto-update is intentionally disabled in this local build. The upstream
  // feed at hilash/cabinet is not controlled by this deployment, so enabling
  // auto-update would let that repo's releases replace this binary. Keep this
  // function as a no-op; the previous implementation was dead code after an
  // unconditional early return and has been removed.
  writeUpdateStatus({
    state: "disabled",
    completedAt: new Date().toISOString(),
    installKind: "electron-macos",
    message: "Auto-update disabled in this build.",
  });
}

function cleanupBackends() {
  for (const child of backendChildren) {
    child.kill("SIGTERM");
  }
  backendChildren = [];
}

function terminateChild(child) {
  if (!child || child.killed) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {}
}

function handleCriticalBackendExit(label, code, signal, peerChild) {
  if (closingFromBackendFailure || !app.isReady()) {
    return;
  }
  if (typeof code !== "number" || code === 0) {
    return;
  }

  closingFromBackendFailure = true;
  console.error(`[cabinet] ${label} exited unexpectedly (code=${code}, signal=${signal})`);
  terminateChild(peerChild);
  app.quit();
}

async function createWindow() {
  // If MULTICA_API_URL is already set (e.g. dev server on 8080), skip embedded server
  // so Cabinet shares the same database as the daemon.
  if (process.env.MULTICA_API_URL) {
    console.log(`[multica] Using external server: ${process.env.MULTICA_API_URL} (skipping embedded)`);
    if (!process.env.MULTICA_WS_URL) {
      const wsUrl = process.env.MULTICA_API_URL.replace(/^http/, "ws") + "/ws";
      process.env.MULTICA_WS_URL = wsUrl;
    }
  } else {
    // Start multica first so its URL can be passed to Cabinet's environment
    const multicaPort = await startMulticaServer();
    if (multicaPort) {
      const multicaUrl = `http://127.0.0.1:${multicaPort}`;
      process.env.MULTICA_API_URL = multicaUrl;
      process.env.MULTICA_WS_URL = `ws://127.0.0.1:${multicaPort}/ws`;
      console.log(`[multica] MULTICA_API_URL set to ${multicaUrl}`);
    }
  }

  const runtime = await startEmbeddedCabinet();

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  await mainWindow.loadURL(runtime.appUrl);
}

app.on("window-all-closed", () => {
  cleanupBackends();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  cleanupBackends();
});

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (missingConfiguredDataDir) {
    dialog.showMessageBox({
      type: "warning",
      title: "Storage Location Unavailable",
      message: "The configured Cabinet data directory does not exist.",
      detail: `Cabinet could not find:\n${missingConfiguredDataDir}\n\nCabinet will use the default local data directory instead. Update it in Settings > Storage if needed.`,
      buttons: ["OK"],
    }).catch(() => {});
  }
  await createWindow();
  configureAutoUpdates();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}).catch((err) => {
  console.error("[cabinet] Fatal startup error:", err);
  cleanupBackends();
  dialog.showErrorBox("Cabinet failed to start", err.message || String(err));
  app.quit();
});
