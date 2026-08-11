// PLAN 12.3: pulled out of main.cjs as pure functions (logDir passed in,
// not computed via app.getPath internally) purely so this logic is
// require()-able and testable under plain node — main.cjs itself can't be,
// since requiring it runs `require("electron")` and app.setName() at load
// time, which only work inside the Electron binary. Same reasoning as
// backend/app/logging_setup.py's log_dir parameter.
const fs = require("node:fs")
const path = require("node:path")

// A shop closed on Sunday writes no Sunday file, and a machine left off for
// a week rotates nothing at all — so retention here is an explicit mtime
// sweep at startup, not just "keep N files". See logging_setup.py's 12.1
// comment for the full reasoning; same rule, kept as a separate copy per
// process so neither can unlink a file the other is mid-write on.
const LOG_RETENTION_DAYS = 5

function log(logDir, ...args) {
  const line = `${new Date().toISOString()} ${args.join(" ")}\n`
  fs.mkdirSync(logDir, { recursive: true })
  fs.appendFileSync(path.join(logDir, `electron-${line.slice(0, 10)}.log`), line)
}

function sweepOldLogs(logDir) {
  if (!fs.existsSync(logDir)) return
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
  for (const name of fs.readdirSync(logDir)) {
    if (!name.startsWith("electron-") || !name.endsWith(".log")) continue
    const full = path.join(logDir, name)
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full)
  }
}

module.exports = { LOG_RETENTION_DAYS, log, sweepOldLogs }
