import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const jsRoot = join(root, 'resources/js')
const php = process.env.PHP_BIN ?? '/Applications/MAMP/bin/php/php8.3.30/bin/php'

const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path)
    else if (/\.(tsx?|jsx?)$/.test(name)) files.push(path)
  }
}
walk(jsRoot)

const calls = []
const callRe = /\bapi\.(get|post|put|patch|delete|upload)\s*<[^>]*>?\s*\(\s*([`'"])(\/[^`'"]+)\2|\bapi\.(get|post|put|patch|delete|upload)\s*\(\s*([`'"])(\/[^`'"]+)\5|\bfetch\s*\(\s*([`'"])(\/[^`'"]+)\7(?<fetchOptions>[\s\S]{0,300}?\))|\bhref=\{?([`'"])(\/[^`'"]+)\9/g

for (const file of files) {
  if (file.endsWith('resources/js/lib/api.ts')) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(callRe)) {
    const apiMethod = match[1] ?? match[4]
    const fetchMethod = match.groups?.fetchOptions?.match(/\bmethod\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i)?.[1]
    const method = apiMethod ?? fetchMethod ?? 'get'
    const raw = match[3] ?? match[6] ?? match[8] ?? match[10]
    if (!raw) continue
    if (!raw.startsWith('/')) continue
    if (raw.startsWith('/docs/') || raw.startsWith('/storage/') || raw.includes('.md')) continue
    calls.push({
      file: relative(root, file),
      method: method.toUpperCase(),
      raw,
      normalized: normalize(raw),
    })
  }
}

let routes = []
try {
  routes = JSON.parse(execFileSync(php, ['artisan', 'route:list', '--json'], { cwd: root, encoding: 'utf8' }))
} catch (error) {
  console.error(`Could not run artisan route:list with ${php}`)
  console.error(error.message)
  process.exit(2)
}

const routePatterns = new Set()
for (const route of routes) {
  const uri = `/${route.uri}`.replace(/\/+$/, '') || '/'
  const methods = String(route.method ?? '').split('|')
  for (const method of methods) {
    routePatterns.add(`${method}:${normalizeRoute(uri)}`)
  }
}

const missing = []
const seen = new Set()
for (const call of calls) {
  const key = `${call.method}:${call.normalized}:${call.file}`
  if (seen.has(key)) continue
  seen.add(key)
  if (call.raw.includes('${')) continue
  if (call.raw === '/') continue
  if (matchesRoute(call.method, call.normalized, routePatterns)) continue
  missing.push(call)
}

const uniqueCalls = [...new Set(calls.map((c) => `${c.method} ${c.normalized}`))].sort()

console.log(`Frontend route calls: ${uniqueCalls.length}`)
console.log(`Potential missing literal routes: ${missing.length}`)
for (const item of missing.sort((a, b) => a.normalized.localeCompare(b.normalized))) {
  console.log(`${item.method.padEnd(6)} ${item.normalized.padEnd(36)} ${item.file}`)
}

function normalize(raw) {
  return raw
    .replace(/\?.*$/, '')
    .replace(/\$\{[^}]+\}/g, '*')
    .replace(/\/+$/, '') || '/'
}

function normalizeRoute(uri) {
  return uri
    .replace(/\{[^}]+\}/g, '*')
    .replace(/\/+$/, '') || '/'
}

function matchesRoute(method, path, routeSet) {
  if (routeSet.has(`${method}:${path}`) || routeSet.has(`ANY:${path}`)) return true
  if (method === 'GET' && routeSet.has(`HEAD:${path}`)) return true
  return false
}
