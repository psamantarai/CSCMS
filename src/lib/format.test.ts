// Plain assert-based self-check, runnable directly: node src/lib/format.test.ts
// No test framework, matching backend/tests/ convention.

import assert from "node:assert"
import { fmt, formatDate, localDateISO, toPaise, fromPaise } from "./format.ts"

function testFmt() {
  // H.3: paise must never be dropped, even when they're .00 or a round number.
  assert.strictEqual(fmt(1500), "₹1,500.00")
  assert.strictEqual(fmt(0), "₹0.00")
  assert.strictEqual(fmt(fromPaise(123450)), "₹1,234.50")
  assert.strictEqual(fmt(fromPaise(100)), "₹1.00")
}

function testFormatDate() {
  assert.strictEqual(formatDate("2026-08-04"), "4 Aug 2026")
}

function testPaiseRoundTrip() {
  assert.strictEqual(toPaise(150), 15000)
  assert.strictEqual(fromPaise(15000), 150)
  // floating point rupees (e.g. 19.99) must round to whole paise
  assert.strictEqual(toPaise(19.99), 1999)
}

function testLocalDateISO() {
  // H.3: must be built from local date fields, not new Date().toISOString()
  // (which is UTC and rolls back a day before 05:30 IST). Can't fake the
  // clock without a new dependency, so this checks the YYYY-MM-DD shape and
  // cross-checks against the same local fields the browser would report.
  const d = new Date()
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  assert.strictEqual(localDateISO(), expected)
}

testFmt()
testFormatDate()
testPaiseRoundTrip()
testLocalDateISO()
console.log("format.test.ts: all assertions passed")
