import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:8000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const navPaths = (process.env.SMOKE_PATHS ?? [
  '/dashboard',
  '/roadmap',
  '/execution',
  '/penugasan',
  '/fokus',
  '/goals',
  '/activity',
  '/reports',
  '/jadwal',
  '/laporan-bulanan',
  '/laporan-risiko',
  '/search',
  '/presence',
  '/profile',
  '/settings',
  '/playbook',
  '/admin/orgs',
  '/admin/users',
  '/admin/positions',
  '/admin/roles',
  '/programs',
  '/channels',
].join(','))
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-dev-shm-usage',
  '--window-size=1440,1000',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let browserWSEndpoint
let stderr = ''

try {
  step('launch chrome')
  browserWSEndpoint = await waitForDevToolsEndpoint(chrome)
  const port = new URL(browserWSEndpoint).port
  step('create browser target')
  const target = await createTarget(port)
  step('connect devtools')
  const page = await connectCDP(target.webSocketDebuggerUrl)
  const issues = []

  page.on('event', (event) => {
    if (event.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(event.params.type)) {
      issues.push(`console ${event.params.type}: ${formatConsoleArgs(event.params.args)}`)
    }
    if (event.method === 'Runtime.exceptionThrown') {
      const details = event.params.exceptionDetails
      issues.push(`exception: ${details?.exception?.description ?? details?.exception?.value ?? details?.text ?? 'Runtime exception'}`)
    }
    if (event.method === 'Log.entryAdded' && ['error'].includes(event.params.entry?.level)) {
      issues.push(`log error: ${event.params.entry.text}`)
    }
    if (event.method === 'Network.responseReceived') {
      const { response } = event.params
      if (response.status >= 400 && shouldReportNetwork(response.url)) {
        issues.push(`network ${response.status}: ${response.url}`)
      }
    }
  })

  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Network.enable')

  step('open login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10_000, 'login form')
  step('submit login')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.evaluate(() => document.querySelector('button[type="submit"]')?.click())
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15_000, 'authenticated app shell')

  for (const path of navPaths) {
    step(`visit ${path}`)
    await navigate(page, `${baseUrl}${path}`)
    await waitFor(page, () => document.body && document.body.innerText.trim().length > 0, 10_000, path)
    await waitFor(page, () => !document.body.innerText.includes('Vite Error'), 1_000, `${path} without Vite Error`).catch(() => {})
  }

  step('run authenticated workflow mutations')
  const workflowResult = await evaluateWorkflow(page, workflowSmoke, { stamp: Date.now() })
  for (const item of workflowResult.steps) step(`ok ${item}`)

  if (issues.length > 0) {
    console.error('Browser smoke failed:')
    for (const issue of [...new Set(issues)]) console.error(`- ${issue}`)
    process.exitCode = 1
  } else {
    console.log(`Browser smoke passed: login + ${navPaths.length} pages + ${workflowResult.steps.length} workflow mutations`)
  }
} finally {
  chrome.kill('SIGTERM')
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    console.warn(`[smoke] could not remove temp Chrome profile: ${error.message}`)
  }
}

async function workflowSmoke({ stamp }) {
  const steps = []
  const suffix = String(stamp).slice(-8)
  const today = new Date().toISOString().slice(0, 10)
  const plusDays = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)

  function cookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  }

  async function api(path, method = 'GET', body) {
    const headers = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    }
    const xsrf = cookie('XSRF-TOKEN')
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 160)}`)
      }
    }
    if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${payload?.message ?? text}`)
    return payload
  }

  function requireId(payload, label) {
    const id = payload?.data?.id
    if (!id) throw new Error(`${label} did not return data.id`)
    return id
  }

  function remember(label) {
    steps.push(label)
  }

  async function choosePeriod(path, unitId) {
    const response = await api(path)
    const used = new Set((response?.data ?? [])
      .filter((row) => !unitId || Number(row.unitId) === Number(unitId))
      .map((row) => `${row.year}-${row.month}`))

    for (let year = 2090; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        if (!used.has(`${year}-${month}`)) return { year, month }
      }
    }
    throw new Error(`No unused period available for ${path}`)
  }

  const profile = await api('/profile')
  const me = profile.user
  if (!me?.id || !me?.unitId) throw new Error('Authenticated smoke user must have id and unitId')
  const users = await api('/users?active=1')
  const teammate = users.data.find((user) => user.id !== me.id) ?? me
  remember('profile/users')

  const programId = requireId(await api('/programs', 'POST', {
    code: `BRW-${suffix}`,
    name: `Browser Workflow ${suffix}`,
    description: 'Created by browser workflow smoke.',
    priority: 'HIGH',
    startDate: today,
    targetEndDate: plusDays(30),
    ownerId: me.id,
    hasNoApmsKpi: true,
  }), 'program')
  await api(`/programs/${programId}`, 'PUT', { description: 'Updated by browser workflow smoke.' })
  remember('program:create-update')

  const workstreamId = requireId(await api('/workstreams', 'POST', {
    programId,
    name: `Browser Workstream ${suffix}`,
    priority: 'HIGH',
    targetCompletion: plusDays(21),
    ownerId: me.id,
  }), 'workstream')
  remember('workstream:create')

  const phaseId = requireId(await api(`/workstreams/${workstreamId}/phases`, 'POST', {
    name: `Browser Phase ${suffix}`,
    description: 'Created by browser workflow smoke.',
    status: 'PLANNING',
  }), 'phase')
  await api(`/phases/${phaseId}`, 'PUT', { status: 'IN_PROGRESS' })
  remember('phase:create-update')

  const taskId = requireId(await api('/tasks', 'POST', {
    workstreamId,
    title: `Browser Task ${suffix}`,
    description: 'Created by browser workflow smoke.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    targetCompletion: plusDays(7),
    assignedTo: teammate.id,
    phaseId,
  }), 'task')
  await api(`/tasks/${taskId}`, 'PATCH', { description: 'Updated by browser workflow smoke.' })
  remember('task:create-update')

  const subTaskId = requireId(await api(`/tasks/${taskId}/subtasks`, 'POST', {
    title: `Browser Subtask ${suffix}`,
  }), 'subtask')
  await api(`/tasks/${taskId}/subtasks/${subTaskId}/toggle`, 'PATCH', {})
  remember('subtask:create-toggle')

  const blockerId = requireId(await api('/blockers', 'POST', {
    taskId,
    title: `Browser Blocker ${suffix}`,
    description: 'Created by browser workflow smoke.',
    severity: 'HIGH',
  }), 'blocker')
  await api(`/blockers/${blockerId}/status`, 'PUT', {
    status: 'RESOLVED',
    resolution: 'Resolved by browser workflow smoke.',
  })
  remember('blocker:create-resolve')

  const commentId = requireId(await api(`/tasks/${taskId}/comments`, 'POST', {
    commentText: `Browser comment ${suffix}`,
  }), 'comment')
  await api(`/comments/${commentId}`, 'PUT', { commentText: `Edited browser comment ${suffix}` })
  await api(`/comments/${commentId}/reactions`, 'POST', { emoji: ':thumbsup:' })
  await api(`/comments/${commentId}`, 'DELETE')
  remember('comment:create-edit-react-delete')

  const channelId = requireId(await api('/channels', 'POST', {
    name: `browser-workflow-${suffix}`,
    description: 'Created by browser workflow smoke.',
    type: 'PUBLIC',
  }), 'channel')
  const messageId = requireId(await api(`/channels/${channelId}/messages`, 'POST', {
    content: `Browser message ${suffix}`,
  }), 'message')
  await api(`/channels/${channelId}/messages/${messageId}/reactions`, 'POST', { emoji: ':thumbsup:' })
  await api(`/channels/${channelId}/messages/${messageId}/pin`, 'PUT')
  await api(`/channels/${channelId}/messages/${messageId}`, 'PUT', { content: `Edited browser message ${suffix}` })
  await api(`/channels/${channelId}/messages/${messageId}`, 'DELETE', { scope: 'everyone' })
  await api(`/channels/${channelId}`, 'DELETE')
  remember('channel/message:create-react-pin-edit-delete')

  const meetingId = requireId(await api('/meetings', 'POST', {
    title: `Browser Meeting ${suffix}`,
    description: 'Created by browser workflow smoke.',
    meetingType: 'RAPAT_TIM',
    startAt: new Date(Date.now() + 3600_000).toISOString(),
    endAt: new Date(Date.now() + 7200_000).toISOString(),
    attendees: [{ userId: teammate.id, attendeeRole: 'REQUIRED' }],
  }), 'meeting')
  const decisionId = requireId(await api(`/meetings/${meetingId}/decisions`, 'POST', {
    decision: `Browser decision ${suffix}`,
  }), 'decision')
  const actionItemId = requireId(await api(`/meetings/${meetingId}/action-items`, 'POST', {
    title: `Browser action item ${suffix}`,
    assignedToId: teammate.id,
    dueDate: plusDays(1),
  }), 'action item')
  await api(`/meetings/${meetingId}/action-items/${actionItemId}`, 'PATCH', { status: 'COMPLETED' })
  await api(`/meetings/${meetingId}/decisions/${decisionId}`, 'DELETE')
  await api(`/meetings/${meetingId}/action-items/${actionItemId}`, 'DELETE')
  await api(`/meetings/${meetingId}`, 'DELETE')
  remember('meeting:create-decision-action-cancel')

  const kpiId = requireId(await api('/kpis', 'POST', {
    code: `KPI-BRW-${suffix}`,
    name: `Browser KPI ${suffix}`,
    metricType: 'PERCENTAGE',
    targetValue: 100,
    unitOfMeasure: '%',
    reviewFrequency: 'MONTHLY',
    isLeadingIndicator: true,
    isActive: true,
  }), 'kpi')
  await api(`/kpis/${kpiId}`, 'PATCH', { targetValue: 95 })
  await api(`/kpis/${kpiId}/values`, 'POST', {
    measurementDate: today,
    actualValue: 96,
  })
  await api(`/kpis/${kpiId}`, 'DELETE')
  remember('kpi:create-update-value-delete')

  const assignmentId = requireId(await api('/assignments', 'POST', {
    title: `Browser Assignment ${suffix}`,
    description: 'Created by browser workflow smoke.',
    priority: 'HIGH',
    assigneeId: teammate.id,
    watcherIds: [],
    evidenceRequired: false,
    isPrivate: false,
  }), 'assignment')
  const attachmentId = requireId(await api(`/assignments/${assignmentId}/attachments`, 'POST', {
    type: 'NOTE',
    description: `Browser evidence note ${suffix}`,
  }), 'assignment attachment')
  await api(`/assignments/${assignmentId}/attachments/${attachmentId}`, 'DELETE')
  await api(`/assignments/${assignmentId}/transition`, 'POST', { action: 'ACKNOWLEDGE' })
  await api(`/assignments/${assignmentId}`, 'DELETE')
  remember('assignment:create-evidence-transition-delete')

  const monthlyPeriod = await choosePeriod('/monthly-reports', me.unitId)
  const monthlyReportId = requireId(await api('/monthly-reports', 'POST', {
    ...monthlyPeriod,
    narrativeSummary: `Browser monthly report ${suffix}`,
  }), 'monthly report')
  await api(`/monthly-reports/${monthlyReportId}`, 'PUT', {
    narrativeSummary: `Updated browser monthly report ${suffix}`,
  })
  await api(`/monthly-reports/${monthlyReportId}`, 'DELETE')
  remember('monthly-report:create-update-delete')

  const riskPeriod = await choosePeriod('/risk-reports', me.unitId)
  const riskReportId = requireId(await api('/risk-reports', 'POST', {
    ...riskPeriod,
    unitId: me.unitId,
  }), 'risk report')
  await api(`/risk-reports/${riskReportId}`, 'PUT', {
    compositeRating: 'LOW',
    rmiScore: 3.5,
  })
  await api(`/risk-reports/${riskReportId}`, 'DELETE')
  remember('risk-report:create-update-delete')

  await api(`/tasks/${taskId}/subtasks/${subTaskId}`, 'DELETE')
  await api(`/tasks/${taskId}`, 'DELETE')
  await api(`/phases/${phaseId}`, 'DELETE')
  await api(`/workstreams/${workstreamId}`, 'DELETE')
  await api(`/programs/${programId}`, 'DELETE')
  remember('cleanup:program-workboard')

  return { steps }
}

async function evaluateWorkflow(page, fn, arg) {
  const result = await page.send('Runtime.evaluate', {
    expression: `(${fn.toString()})(${JSON.stringify(arg)})`,
    awaitPromise: true,
    returnByValue: true,
  })

  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    throw new Error(details.exception?.description ?? details.text ?? 'Workflow evaluation failed')
  }

  return result.result?.value
}

async function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome did not expose DevTools endpoint.\n${stderr}`)), 10_000)
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome exited before DevTools was ready (${code}).\n${stderr}`))
    })
  })
}

async function createTarget(port) {
  const response = await withTimeout(
    fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }),
    10_000,
    'create Chrome target',
  )
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`)
  return response.json()
}

function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const listeners = { event: [] }

  ws.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data)
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id)
      pending.delete(payload.id)
      if (payload.error) reject(new Error(payload.error.message))
      else resolve(payload.result)
      return
    }
    for (const listener of listeners.event) listener(payload)
  })

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(event, listener) {
        listeners[event].push(listener)
      },
      send(method, params = {}) {
        const requestId = ++id
        ws.send(JSON.stringify({ id: requestId, method, params }))
        return withTimeout(
          new Promise((res, rej) => pending.set(requestId, { resolve: res, reject: rej })),
          10_000,
          method,
        )
      },
      evaluate(expression) {
        return this.send('Runtime.evaluate', {
          expression: `(${expression.toString()})()`,
          awaitPromise: true,
          returnByValue: true,
        })
      },
    }))
    ws.addEventListener('error', reject)
  })
}

async function navigate(page, url) {
  step(`navigate ${url}`)
  await page.send('Page.navigate', { url })
  await waitForEvent(page, 'Page.loadEventFired', 15_000)
}

function waitForEvent(page, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs)
    page.on('event', function listener(event) {
      if (event.method === method) {
        clearTimeout(timer)
        resolve(event)
      }
    })
  })
}

async function waitFor(page, predicate, timeoutMs, label = 'condition') {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.send('Runtime.evaluate', {
      expression: `Boolean((${predicate.toString()})())`,
      returnByValue: true,
    })
    if (result.result?.value) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`)
}

async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `,
  })
}

function formatConsoleArgs(args = []) {
  return args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
}

function shouldReportNetwork(url) {
  if (url.endsWith('/favicon.ico')) return false
  if (url.includes('/@vite/')) return false
  if (url.includes('/node_modules/.vite/')) return false
  return true
}

function step(message) {
  console.log(`[smoke] ${message}`)
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out during ${label} after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
