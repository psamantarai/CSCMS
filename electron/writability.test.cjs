// Plain assert-based self-check, runnable directly: node electron/writability.test.cjs
// No test framework, matching logger.test.cjs convention.

const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { isWritable } = require("./writability.cjs")

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cscms-writability-test-"))
}

function testWritableDirReturnsTrue() {
  const dir = tmpDir()
  assert.strictEqual(isWritable(dir), true)
}

function testCreatesMissingDirAndReturnsTrue() {
  const dir = path.join(tmpDir(), "nested", "data")
  assert.strictEqual(isWritable(dir), true)
  assert.ok(fs.existsSync(dir))
}

function testProbeFileDoesNotLinger() {
  const dir = tmpDir()
  isWritable(dir)
  assert.deepStrictEqual(fs.readdirSync(dir), [])
}

function testUnwritableDirReturnsFalse() {
  // A file can't be a directory: mkdirSync(recursive) inside it fails.
  const dir = tmpDir()
  const blocked = path.join(dir, "not-a-dir")
  fs.writeFileSync(blocked, "x")
  assert.strictEqual(isWritable(path.join(blocked, "data")), false)
}

testWritableDirReturnsTrue()
testCreatesMissingDirAndReturnsTrue()
testProbeFileDoesNotLinger()
testUnwritableDirReturnsFalse()
console.log("writability.test.cjs: all assertions passed")
