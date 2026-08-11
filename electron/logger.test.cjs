// Plain assert-based self-check, runnable directly: node electron/logger.test.cjs
// No test framework, matching src/lib/format.test.ts and backend/tests/ convention.

const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { LOG_RETENTION_DAYS, log, sweepOldLogs } = require("./logger.cjs")

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cscms-logger-test-"))
}

function testLogWritesTodaysFile() {
  const dir = tmpDir()
  log(dir, "hello", "world")
  const today = new Date().toISOString().slice(0, 10)
  const file = path.join(dir, `electron-${today}.log`)
  assert.ok(fs.existsSync(file))
  assert.match(fs.readFileSync(file, "utf8"), /hello world\n$/)
}

function testLogAppendsNotTruncates() {
  const dir = tmpDir()
  log(dir, "first")
  log(dir, "second")
  const today = new Date().toISOString().slice(0, 10)
  const content = fs.readFileSync(path.join(dir, `electron-${today}.log`), "utf8")
  assert.match(content, /first/)
  assert.match(content, /second/)
}

function testSweepDeletesOnlyOldMatchingFiles() {
  const dir = tmpDir()
  const ages = { "electron-2day.log": 2, "electron-6day.log": 6, "electron-30day.log": 30 }
  for (const [name, days] of Object.entries(ages)) {
    const f = path.join(dir, name)
    fs.writeFileSync(f, "x")
    const mtime = Date.now() / 1000 - days * 86400
    fs.utimesSync(f, mtime, mtime)
  }
  // non-matching filename must survive the sweep regardless of age
  fs.writeFileSync(path.join(dir, "not-a-log-file.txt"), "x")
  fs.utimesSync(path.join(dir, "not-a-log-file.txt"), 1, 1)

  sweepOldLogs(dir)

  const remaining = fs.readdirSync(dir).sort()
  assert.deepStrictEqual(remaining, ["electron-2day.log", "not-a-log-file.txt"])
}

function testSweepOnMissingDirIsNoop() {
  sweepOldLogs(path.join(tmpDir(), "does-not-exist"))
}

function testRetentionConstant() {
  assert.strictEqual(LOG_RETENTION_DAYS, 5)
}

testLogWritesTodaysFile()
testLogAppendsNotTruncates()
testSweepDeletesOnlyOldMatchingFiles()
testSweepOnMissingDirIsNoop()
testRetentionConstant()
console.log("logger.test.cjs: all assertions passed")
