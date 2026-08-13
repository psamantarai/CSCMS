// PLAN 16.1: hide + system-mark $INSTDIR\data so a human browsing in
// Explorer at default settings (hidden files off) doesn't see it sitting
// next to the exe, and drop a notice for whoever turns hidden files back on.
// Pulled out of main.cjs as pure functions, same reasoning as
// writability.cjs — no `electron` module needed, so it's require()-able and
// testable under plain node.
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const NOTICE_NAME = "DO NOT DELETE.txt"
const NOTICE_TEXT = `This folder holds CSCMS's live ledger database, backups and logs.

Deleting it deletes the shop's financial records. If you can see this
folder, hidden files are turned on in Explorer — turn them back off and
leave this folder alone.
`

// Windows-only; the app only runs on Windows (package.json's "win" target),
// so no cross-platform branch.
function hideDataDir(dir) {
  execFileSync("attrib", ["+h", "+s", dir])
}

function writeNotice(dir) {
  const noticePath = path.join(dir, NOTICE_NAME)
  if (!fs.existsSync(noticePath)) fs.writeFileSync(noticePath, NOTICE_TEXT)
}

module.exports = { hideDataDir, writeNotice, NOTICE_NAME }
