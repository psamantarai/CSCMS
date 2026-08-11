// Plain assert-based self-check, runnable directly: node src/lib/clientLog.test.ts
// No test framework, matching api.test.ts's convention.

import assert from "node:assert"
import { reportClientError } from "./clientLog.ts"

let calls = 0
globalThis.fetch = (async () => {
  calls++
  return new Response("{}", { status: 200 })
}) as typeof fetch

// PLAN 12.4: a render loop retrying the same throw must not hammer the
// endpoint past MAX_POSTS_PER_LOAD (10) and bury the first error.
for (let i = 0; i < 15; i++) reportClientError("boom")
await Promise.resolve() // let the fire-and-forget fetch calls enqueue

assert.strictEqual(calls, 10)
console.log("clientLog.test.ts: all assertions passed")
