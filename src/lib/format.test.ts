// Plain assert-based self-check, runnable directly: node src/lib/format.test.ts
// No test framework, matching backend/tests/ convention.

import assert from "node:assert"
import { fmt, formatDate, toPaise, fromPaise } from "./format.ts"

function testFmt() {
  assert.strictEqual(fmt(1500), "₹1,500")
  assert.strictEqual(fmt(0), "₹0")
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

testFmt()
testFormatDate()
testPaiseRoundTrip()
console.log("format.test.ts: all assertions passed")
