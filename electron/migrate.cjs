// PLAN 13.4: pulled out of main.cjs as a pure function (dirs passed in, not
// resolved via app.getPath internally) purely so it's testable under plain
// node, same reasoning as logger.cjs and writability.cjs.
//
// v1.0.0 shipped before Phase 13, so an existing install has its ledger at
// oldDir (%APPDATA%\CSCMS). On first launch of a build with 13.1's new
// DATA_DIR, move the DB, backups\ and logs\ across, then remove oldDir so
// nothing of the app's is left outside newDir.
const fs = require("node:fs")
const path = require("node:path")

const DB_NAME = "cscms.db"
// SQLite sidecars: move with the database or move neither. A DB moved
// without its WAL loses the most recent committed transactions -- the worst
// possible outcome for this app. backup.py's VACUUM INTO handles the same
// suffixes; this is the Electron-side equivalent.
const DB_SUFFIXES = ["", "-wal", "-shm"]

function migrateOldData(oldDir, newDir) {
  const oldDb = path.join(oldDir, DB_NAME)
  const newDb = path.join(newDir, DB_NAME)

  if (!fs.existsSync(oldDir)) return

  if (fs.existsSync(newDb)) {
    // Already migrated. A prior run may have committed the DB (see below)
    // and then been interrupted before this cleanup step -- never re-copy
    // over a live database, just finish removing the stale old folder.
    fs.rmSync(oldDir, { recursive: true, force: true })
    return
  }

  if (!fs.existsSync(oldDb)) return // old folder exists but holds no DB

  fs.mkdirSync(newDir, { recursive: true })

  // backups\ and logs\ aren't the ledger itself -- a plain recursive copy is
  // enough, and harmless to redo if this run gets interrupted and retried.
  // Done before the DB commit below so a retry (which only re-runs while
  // newDb still doesn't exist) always redoes this too.
  for (const sub of ["backups", "logs"]) {
    const src = path.join(oldDir, sub)
    if (fs.existsSync(src)) fs.cpSync(src, path.join(newDir, sub), { recursive: true })
  }

  // Copy-then-verify-then-rename, never a bare rename that can half-complete
  // across volumes when the operator installed to a different drive. Staged
  // under a .migrating name so a same-named leftover from a prior
  // interrupted attempt never blocks a retry.
  const staged = []
  for (const suffix of DB_SUFFIXES) {
    const src = oldDb + suffix
    if (!fs.existsSync(src)) continue
    const tmp = newDb + suffix + ".migrating"
    fs.copyFileSync(src, tmp)
    if (fs.statSync(tmp).size !== fs.statSync(src).size) {
      throw new Error(`migration copy size mismatch for ${src}`)
    }
    staged.push({ tmp, final: newDb + suffix })
  }

  // Commit: rename the DB itself last. Its presence at newDb is the single
  // source of truth this function checks above, so an interruption at any
  // point before this loop finishes leaves newDir exactly as if migration
  // had never started -- the next launch retries from scratch.
  staged.sort((a, b) => (a.final === newDb) - (b.final === newDb))
  for (const { tmp, final } of staged) {
    fs.rmSync(final, { force: true }) // Windows rename doesn't overwrite
    fs.renameSync(tmp, final)
  }

  fs.rmSync(oldDir, { recursive: true, force: true })
}

module.exports = { migrateOldData }
