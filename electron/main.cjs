// PLAN 10.1-10.3: Electron shell. Spawns the FastAPI backend as a child
// process, waits for it to answer /api/health, then loads the built
// frontend from that same origin (backend/app/main.py serves it) so
// src/lib/api.ts's relative `/api` fetches work unchanged — no file://.
const { app, BrowserWindow, session, Notification } = require("electron")
const { autoUpdater } = require("electron-updater")
const { spawn } = require("node:child_process")
const crypto = require("node:crypto")
const http = require("node:http")
const path = require("node:path")

// PLAN 10.3: must run before any app.getPath() call — it's what makes
// getPath("userData") resolve to %APPDATA%\CSCMS instead of the package.json
// name.
app.setName("CSCMS")

const REPO_ROOT = path.join(__dirname, "..")
const PORT = process.env.CSCMS_PORT || "8000"
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`
// PLAN 11.2: one random secret per launch, handed to the backend as
// CSCMS_APP_SECRET and echoed back on every outgoing request via
// X-CSCMS-App so 11.1's gate lets this app (and only this app) through.
const APP_SECRET = crypto.randomUUID()

// PLAN 11.5: no dialog, no interruption — download in the background and
// apply on the next natural quit. Explicit even though they're
// electron-updater's own defaults, since this is the deliberate UX choice.
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.on("update-downloaded", () => {
  new Notification({
    title: "CSCMS update ready",
    body: "An update has been downloaded. It will be applied the next time you close CSCMS.",
  }).show()
})
// No-ops with a log warning in an unpacked dev run (no app-update.yml) —
// safe to call unconditionally.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours
function checkForUpdates() {
  autoUpdater.checkForUpdates().catch((err) => console.error("[electron] update check failed:", err.message))
}

let backendProcess = null
let mainWindow = null

function backendCommand() {
  if (app.isPackaged) {
    // PLAN 10.2: the PyInstaller --onedir build (backend/build_exe.bat),
    // placed under resources by the Phase 10.4 installer.
    return { cmd: path.join(process.resourcesPath, "backend", "cscms-backend.exe"), args: [] }
  }
  return {
    cmd: path.join(REPO_ROOT, "backend", ".venv", "Scripts", "python.exe"),
    args: [path.join(REPO_ROOT, "backend", "run.py")],
  }
}

function startBackend() {
  const { cmd, args } = backendCommand()
  backendProcess = spawn(cmd, args, {
    windowsHide: true,
    env: {
      ...process.env,
      // PLAN 10.3: DB and backups live under %APPDATA%\CSCMS, not next to
      // the source tree — same rule whether this is an installed build or
      // `npm run electron` in the checkout.
      CSCMS_DB_PATH: path.join(app.getPath("userData"), "cscms.db"),
      // PLAN 11.2
      CSCMS_APP_SECRET: APP_SECRET,
      // PLAN 10.2: run.py's dev branch defaults reload on for dev.bat;
      // Electron needs the single-process shape so killing the PID it
      // spawned doesn't orphan a reloader-managed server child.
      CSCMS_RELOAD: "false",
      // PLAN 10.4: packaged builds copy the frontend via extraResources
      // (package.json's "build" config) since it's served over HTTP by the
      // backend, not loaded via file:// — settings.py's default guess
      // (next to the exe's PyInstaller _internal/ dir) doesn't land there.
      ...(app.isPackaged ? { CSCMS_FRONTEND_DIST: path.join(process.resourcesPath, "frontend") } : {}),
    },
  })
  backendProcess.on("error", (err) => console.error("[electron] backend failed to start:", err))
  backendProcess.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`))
  backendProcess.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`))
}

function waitForBackend(timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      // PLAN 11.2: runs before any window (and so before the session hook
      // below) exists — it must carry the header itself.
      http
        .get(HEALTH_URL, { headers: { "X-CSCMS-App": APP_SECRET } }, (res) => {
          res.resume()
          if (res.statusCode === 200) return resolve()
          retry()
        })
        .on("error", retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("backend did not become healthy in time"))
      setTimeout(tryOnce, 300)
    }
    tryOnce()
  })
}

function stopBackend() {
  if (!backendProcess) return
  backendProcess.kill()
  backendProcess = null
}

async function createWindow() {
  // PLAN 11.2: every request the renderer's session makes (the app itself,
  // loaded from http://127.0.0.1:PORT) picks up the header here.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["X-CSCMS-App"] = APP_SECRET
    callback({ requestHeaders: details.requestHeaders })
  })

  mainWindow = new BrowserWindow({ width: 1280, height: 800, icon: path.join(REPO_ROOT, "electron", "icon.png") })
  try {
    await waitForBackend()
  } catch (err) {
    console.error("[electron]", err.message)
  }
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`)
}

// PLAN 11.3: without this, a second launch's backend fails to bind the port
// (11.1's gate then rejects its health poll for carrying a different
// secret), and its window sits on a 403 for the full waitForBackend timeout.
// Fail the second launch outright instead — focus the first instance.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    startBackend()
    createWindow()
    checkForUpdates()
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS)
  })
}

app.on("window-all-closed", () => {
  stopBackend()
  if (process.platform !== "darwin") app.quit()
})

// Belt-and-braces: window-all-closed already stops it, but app.quit() can
// also be triggered directly (Cmd+Q on macOS, external quit).
app.on("before-quit", stopBackend)
