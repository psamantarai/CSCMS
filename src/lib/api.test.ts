// Plain assert-based self-check, runnable directly: node src/lib/api.test.ts
// No test framework, matching backend/tests/ and format.test.ts's convention.

import assert from "node:assert"
import { api } from "./api.ts"

function mockFetchOnce(status: number, statusText: string, body: unknown) {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, statusText })) as typeof fetch
  return () => { globalThis.fetch = original }
}

// H.18: request() used to throw only `${method} ${path} failed: ${status}
// ${statusText}`, discarding the response body's `detail` — two unrelated
// 400s were indistinguishable. Two different rejections must now surface
// two different, readable messages.
async function testDifferentRejectionsProduceDifferentMessages() {
  let restore = mockFetchOnce(400, "Bad Request", { detail: "amount exceeds the customer's outstanding balance" })
  let outstandingMessage = ""
  try {
    await api.post("/payments", {})
    assert.fail("expected a rejection")
  } catch (e) {
    outstandingMessage = (e as Error).message
  } finally {
    restore()
  }

  restore = mockFetchOnce(400, "Bad Request", { detail: "invalid business_date: 'not-a-date'" })
  let dateMessage = ""
  try {
    await api.post("/payments", {})
    assert.fail("expected a rejection")
  } catch (e) {
    dateMessage = (e as Error).message
  } finally {
    restore()
  }

  assert.match(outstandingMessage, /outstanding balance/)
  assert.match(dateMessage, /business_date/)
  assert.notStrictEqual(outstandingMessage, dateMessage)
}

async function testFallsBackToStatusWhenBodyHasNoDetail() {
  const restore = mockFetchOnce(500, "Internal Server Error", {})
  try {
    await api.get("/x")
    assert.fail("expected a rejection")
  } catch (e) {
    assert.match((e as Error).message, /GET \/x failed: 500 Internal Server Error/)
  } finally {
    restore()
  }
}

await testDifferentRejectionsProduceDifferentMessages()
await testFallsBackToStatusWhenBodyHasNoDetail()
console.log("api.test.ts: all assertions passed")
