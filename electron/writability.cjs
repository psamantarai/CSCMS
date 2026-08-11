// PLAN 13.2: pulled out of main.cjs as a pure function, same reasoning as
// logger.cjs — this needs no `electron` module, so it's require()-able and
// testable under plain node.
const fs = require("node:fs")
const path = require("node:path")

function isWritable(dir) {
  const probe = path.join(dir, ".write-test")
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(probe, "")
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

module.exports = { isWritable }
