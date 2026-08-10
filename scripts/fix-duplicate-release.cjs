#!/usr/bin/env node
// electron-builder's PublishManager has a check-then-act race
// (getOrCreatePublisher reads its cache Map, then awaits createPublisher
// before writing it back) that fires when nsis emits the .exe and
// .blockmap as near-simultaneous artifactBuildCompleted events: both see
// "no publisher yet" and both create one, so two draft GitHub releases
// end up tagged with the same version. This merges them back into one.
// ponytail: dedups after the fact instead of patching electron-builder's
// PublishManager; revisit if a future electron-builder release fixes the race.
const fs = require("fs")
const path = require("path")

function loadEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([\w.-]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const env = loadEnvFile(path.join(__dirname, "..", "electron-builder.env"))
const token = process.env.GH_TOKEN || env.GH_TOKEN
if (!token) {
  console.error("fix-duplicate-release: no GH_TOKEN found, skipping")
  process.exit(0)
}

const pkg = require("../package.json")
const { owner, repo } = pkg.build.publish[0]
const tag = `v${pkg.version}`
const api = "https://api.github.com"
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }

async function main() {
  const releases = await fetch(`${api}/repos/${owner}/${repo}/releases`, { headers }).then(r => r.json())
  const dupes = releases.filter(r => r.tag_name === tag)
  if (dupes.length <= 1) {
    console.log(`fix-duplicate-release: ${dupes.length} release(s) for ${tag}, nothing to merge`)
    return
  }

  dupes.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const [survivor, ...extras] = dupes
  const desiredNames = new Set(dupes.flatMap(r => r.assets.map(a => a.name)))
  console.log(`fix-duplicate-release: found ${dupes.length} releases for ${tag}, merging into #${survivor.id}`)

  for (const extra of extras) {
    await fetch(`${api}/repos/${owner}/${repo}/releases/${extra.id}`, { method: "DELETE", headers })
    console.log(`  deleted duplicate release #${extra.id}`)
  }

  const existingNames = new Set(survivor.assets.map(a => a.name))
  const releaseDir = path.join(__dirname, "..", "release")
  for (const name of desiredNames) {
    if (existingNames.has(name)) continue
    const filePath = path.join(releaseDir, name)
    if (!fs.existsSync(filePath)) {
      console.warn(`  missing local file for ${name}, skipping`)
      continue
    }
    const data = fs.readFileSync(filePath)
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${survivor.id}/assets?name=${encodeURIComponent(name)}`
    const res = await fetch(uploadUrl, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: data })
    console.log(`  uploaded ${name}: ${res.status}`)
  }
}

main()
