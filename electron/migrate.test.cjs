// Plain assert-based self-check, runnable directly: node electron/migrate.test.cjs
// No test framework, matching logger.test.cjs / writability.test.cjs convention.

const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { migrateOldData } = require("./migrate.cjs")

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cscms-migrate-test-"))
}

function seedOldDir() {
  const root = tmpDir()
  const oldDir = path.join(root, "old")
  fs.mkdirSync(oldDir, { recursive: true })
  fs.writeFileSync(path.join(oldDir, "cscms.db"), "db-bytes")
  fs.writeFileSync(path.join(oldDir, "cscms.db-wal"), "wal-bytes")
  fs.writeFileSync(path.join(oldDir, "cscms.db-shm"), "shm-bytes")
  fs.mkdirSync(path.join(oldDir, "backups"))
  fs.writeFileSync(path.join(oldDir, "backups", "2026-01-01.db"), "backup-bytes")
  fs.mkdirSync(path.join(oldDir, "logs"))
  fs.writeFileSync(path.join(oldDir, "logs", "electron-2026-01-01.log"), "log-bytes")
  return { root, oldDir, newDir: path.join(root, "new") }
}

function testMovesDbSidecarsBackupsAndLogsThenRemovesOldDir() {
  const { oldDir, newDir } = seedOldDir()
  migrateOldData(oldDir, newDir)

  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db"), "utf8"), "db-bytes")
  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db-wal"), "utf8"), "wal-bytes")
  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db-shm"), "utf8"), "shm-bytes")
  assert.strictEqual(fs.readFileSync(path.join(newDir, "backups", "2026-01-01.db"), "utf8"), "backup-bytes")
  assert.strictEqual(fs.readFileSync(path.join(newDir, "logs", "electron-2026-01-01.log"), "utf8"), "log-bytes")
  assert.strictEqual(fs.existsSync(oldDir), false)
}

function testNoOpWhenOldDirAbsent() {
  const newDir = path.join(tmpDir(), "new")
  migrateOldData(path.join(tmpDir(), "does-not-exist"), newDir)
  assert.strictEqual(fs.existsSync(newDir), false)
}

function testDoesNotOverwriteExistingNewDb() {
  const { oldDir, newDir } = seedOldDir()
  fs.mkdirSync(newDir, { recursive: true })
  fs.writeFileSync(path.join(newDir, "cscms.db"), "live-db-do-not-touch")

  migrateOldData(oldDir, newDir)

  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db"), "utf8"), "live-db-do-not-touch")
  // Old folder still gets cleaned up -- this is the "committed but the
  // cleanup step was interrupted" recovery path.
  assert.strictEqual(fs.existsSync(oldDir), false)
}

function testRerunAfterSuccessIsNoop() {
  const { oldDir, newDir } = seedOldDir()
  migrateOldData(oldDir, newDir)
  // oldDir is gone; calling again must not throw or touch newDir.
  migrateOldData(oldDir, newDir)
  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db"), "utf8"), "db-bytes")
}

function testMissingWalShmAreNotFabricated() {
  const root = tmpDir()
  const oldDir = path.join(root, "old")
  fs.mkdirSync(oldDir, { recursive: true })
  fs.writeFileSync(path.join(oldDir, "cscms.db"), "db-only")
  const newDir = path.join(root, "new")

  migrateOldData(oldDir, newDir)

  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db"), "utf8"), "db-only")
  assert.strictEqual(fs.existsSync(path.join(newDir, "cscms.db-wal")), false)
  assert.strictEqual(fs.existsSync(path.join(newDir, "cscms.db-shm")), false)
}

function testInterruptedBeforeCommitRetriesCleanlyAndOriginalStaysIntact() {
  const { oldDir, newDir } = seedOldDir()
  fs.mkdirSync(newDir, { recursive: true })
  // Simulate a kill between "copy staged" and "rename committed": a stray
  // .migrating temp file left behind, cscms.db itself never landed.
  fs.writeFileSync(path.join(newDir, "cscms.db.migrating"), "partial-garbage")

  migrateOldData(oldDir, newDir) // must not treat this as "already migrated"

  assert.strictEqual(fs.readFileSync(path.join(newDir, "cscms.db"), "utf8"), "db-bytes")
  assert.strictEqual(fs.existsSync(oldDir), false)
}

testMovesDbSidecarsBackupsAndLogsThenRemovesOldDir()
testNoOpWhenOldDirAbsent()
testDoesNotOverwriteExistingNewDb()
testRerunAfterSuccessIsNoop()
testMissingWalShmAreNotFabricated()
testInterruptedBeforeCommitRetriesCleanlyAndOriginalStaysIntact()
console.log("migrate.test.cjs: all assertions passed")
