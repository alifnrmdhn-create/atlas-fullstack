#!/usr/bin/env node
/**
 * Merge per-file translation maps (returned by the i18n migration agents) into
 * the master Indonesian dictionary at resources/js/locales/id.json.
 *
 * Usage:
 *   node scripts/i18n-merge.mjs <map1.json> [map2.json ...]
 *
 * Policy:
 *  - The master id.json is the source of truth. Existing values are NEVER
 *    overwritten (so manual term tweaks survive). When an incoming map proposes
 *    a DIFFERENT value for a key that already exists, we keep the master value
 *    and print a CONFLICT line so it can be reviewed.
 *  - Brand-new keys are added.
 *  - Output is written sorted (case-insensitive) for stable diffs.
 *
 * First run seeds id.json from the legacy id.ts object literal if id.json is
 * absent.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const jsonPath = resolve(root, 'resources/js/locales/id.json')
const tsPath = resolve(root, 'resources/js/locales/id.ts')

function loadMaster() {
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, 'utf8'))
  }
  // Seed from id.ts object literal (valid JS — eval handles comments/trailing commas).
  if (existsSync(tsPath)) {
    const src = readFileSync(tsPath, 'utf8')
    const start = src.indexOf('{')
    const end = src.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      // eslint-disable-next-line no-eval
      return eval('(' + src.slice(start, end + 1) + ')')
    }
  }
  return {}
}

const mapFiles = process.argv.slice(2)
if (mapFiles.length === 0) {
  console.error('usage: node scripts/i18n-merge.mjs <map1.json> [map2.json ...]')
  process.exit(1)
}

const master = loadMaster()
let added = 0
const conflicts = []

for (const f of mapFiles) {
  const incoming = JSON.parse(readFileSync(resolve(f), 'utf8'))
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string') continue
    if (!(key in master)) {
      master[key] = value
      added++
    } else if (master[key] !== value) {
      conflicts.push({ key, kept: master[key], proposed: value, file: f })
    }
  }
}

// Sort keys case-insensitively for stable diffs.
const sorted = {}
for (const key of Object.keys(master).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) {
  sorted[key] = master[key]
}

writeFileSync(jsonPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8')

console.log(`i18n-merge: +${added} new keys, ${Object.keys(sorted).length} total → resources/js/locales/id.json`)
if (conflicts.length) {
  console.log(`\n${conflicts.length} CONFLICT(s) (master value kept):`)
  for (const c of conflicts) {
    console.log(`  "${c.key}"\n     kept:     "${c.kept}"\n     proposed: "${c.proposed}"  (${c.file.split('/').pop()})`)
  }
}
