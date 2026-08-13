// Plain assert-based self-check, runnable directly: node electron/datadirmark.test.cjs
// No test framework, matching writability.test.cjs convention.

const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { hideDataDir, writeNotice, NOTICE_NAME } = require("./datadirmark.cjs")

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cscms-datadirmark-test-"))
}

function testHideDataDirSetsHiddenAndSystemAttrs() {
  const dir = tmpDir()
  hideDataDir(dir)
  const attrs = require("node:child_process").execFileSync("attrib", [dir]).toString()
  assert.ok(attrs.includes("H"), `expected H in attrib output: ${attrs}`)
  assert.ok(attrs.includes("S"), `expected S in attrib output: ${attrs}`)
}

function testHideDataDirIsIdempotent() {
  const dir = tmpDir()
  hideDataDir(dir)
  hideDataDir(dir) // must not throw the second time
}

function testWriteNoticeCreatesFile() {
  const dir = tmpDir()
  writeNotice(dir)
  assert.ok(fs.existsSync(path.join(dir, NOTICE_NAME)))
}

function testWriteNoticeRecreatesDeletedFile() {
  const dir = tmpDir()
  writeNotice(dir)
  fs.unlinkSync(path.join(dir, NOTICE_NAME))
  writeNotice(dir)
  assert.ok(fs.existsSync(path.join(dir, NOTICE_NAME)))
}

function testWriteNoticeDoesNotClobberEditedFile() {
  const dir = tmpDir()
  writeNotice(dir)
  const noticePath = path.join(dir, NOTICE_NAME)
  fs.writeFileSync(noticePath, "operator's own note")
  writeNotice(dir)
  assert.strictEqual(fs.readFileSync(noticePath, "utf8"), "operator's own note")
}

testHideDataDirSetsHiddenAndSystemAttrs()
testHideDataDirIsIdempotent()
testWriteNoticeCreatesFile()
testWriteNoticeRecreatesDeletedFile()
testWriteNoticeDoesNotClobberEditedFile()
console.log("datadirmark.test.cjs: all assertions passed")
