#!/usr/bin/env node

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.NOTIFY_REGRESSION_BASE_URL || 'http://127.0.0.1:3000/api',
    adminToken: process.env.NOTIFY_REGRESSION_ADMIN_TOKEN || '',
    userToken: process.env.NOTIFY_REGRESSION_USER_TOKEN || '',
    bizDomain: process.env.NOTIFY_REGRESSION_BIZ_DOMAIN || 'project_management',
    bizLineId: Number(process.env.NOTIFY_REGRESSION_BIZ_LINE_ID || 1),
    timeoutMs: Number(process.env.NOTIFY_REGRESSION_TIMEOUT_MS || 12000),
    write: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const item = String(argv[i] || '').trim()
    if (!item) continue
    if (item === '--base-url') {
      args.baseUrl = String(argv[i + 1] || '').trim() || args.baseUrl
      i += 1
      continue
    }
    if (item === '--admin-token') {
      args.adminToken = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }
    if (item === '--user-token') {
      args.userToken = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }
    if (item === '--biz-domain') {
      args.bizDomain = String(argv[i + 1] || '').trim() || args.bizDomain
      i += 1
      continue
    }
    if (item === '--biz-line-id') {
      const value = Number(argv[i + 1] || args.bizLineId)
      args.bizLineId = Number.isInteger(value) && value > 0 ? value : args.bizLineId
      i += 1
      continue
    }
    if (item === '--timeout-ms') {
      const value = Number(argv[i + 1] || args.timeoutMs)
      args.timeoutMs = Number.isFinite(value) && value > 0 ? value : args.timeoutMs
      i += 1
      continue
    }
    if (item === '--write') {
      args.write = true
    }
  }

  return args
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function ensureLocalBaseUrl(baseUrl) {
  const allowNonLocal = String(process.env.NOTIFY_REGRESSION_ALLOW_NON_LOCAL || '').trim() === '1'
  if (allowNonLocal) return

  const normalized = normalizeBaseUrl(baseUrl)
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(`baseUrl 非法: ${normalized}`)
  }

  const host = String(parsed.hostname || '').trim().toLowerCase()
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (!isLocal) {
    throw new Error(
      `安全限制：仅允许本地回归（当前 host=${host}）。如确认需要非本地，请设置 NOTIFY_REGRESSION_ALLOW_NON_LOCAL=1`,
    )
  }
}

function buildUrl(baseUrl, pathName) {
  const normalized = normalizeBaseUrl(baseUrl)
  const path = String(pathName || '').trim()
  if (!path) return normalized
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${normalized}${path.startsWith('/') ? '' : '/'}${path}`
}

async function requestJson({
  baseUrl,
  pathName,
  method = 'GET',
  token = '',
  body,
  timeoutMs = 12000,
  bizLineId = 1,
}) {
  const targetUrl = buildUrl(baseUrl, pathName)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers = {
    Accept: 'application/json',
    'x-business-line-id': String(bizLineId),
  }

  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const startedAt = Date.now()

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { raw: text }
    }

    return {
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      payload,
      url: targetUrl,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      duration_ms: Date.now() - startedAt,
      payload: null,
      url: targetUrl,
      error: error?.message || String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function safeRun(name, fn) {
  const start = Date.now()
  try {
    const data = await fn()
    return { name, ok: true, duration_ms: Date.now() - start, data }
  } catch (error) {
    return {
      name,
      ok: false,
      duration_ms: Date.now() - start,
      error: error?.message || String(error),
    }
  }
}

function ensureHttpOk(result) {
  if (!result.ok) {
    throw new Error(`HTTP_${result.status}`)
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const checks = []
  ensureLocalBaseUrl(args.baseUrl)

  if (!args.adminToken) {
    throw new Error('缺少 admin token，请传入 --admin-token 或 NOTIFY_REGRESSION_ADMIN_TOKEN')
  }

  checks.push(
    await safeRun('admin.templates', async () => {
      const result = await requestJson({
        baseUrl: args.baseUrl,
        pathName: `/config/notifications/templates?biz_domain=${encodeURIComponent(args.bizDomain)}`,
        token: args.adminToken,
        timeoutMs: args.timeoutMs,
        bizLineId: args.bizLineId,
      })
      ensureHttpOk(result)
      return {
        status: result.status,
        count: Array.isArray(result.payload?.data) ? result.payload.data.length : 0,
      }
    }),
  )

  const rulesCheck = await safeRun('admin.rules', async () => {
    const result = await requestJson({
      baseUrl: args.baseUrl,
      pathName: `/config/notifications/rules?biz_domain=${encodeURIComponent(args.bizDomain)}`,
      token: args.adminToken,
      timeoutMs: args.timeoutMs,
      bizLineId: args.bizLineId,
    })
    ensureHttpOk(result)
    const rows = Array.isArray(result.payload?.data) ? result.payload.data : []
    return {
      status: result.status,
      count: rows.length,
      first_rule_id: Number(rows?.[0]?.id || 0) || null,
    }
  })
  checks.push(rulesCheck)

  const firstRuleId = Number(rulesCheck?.data?.first_rule_id || 0) || null

  if (firstRuleId) {
    checks.push(
      await safeRun('admin.rule_audits', async () => {
        const result = await requestJson({
          baseUrl: args.baseUrl,
          pathName: `/config/notifications/rules/${firstRuleId}/audits?page=1&page_size=20`,
          token: args.adminToken,
          timeoutMs: args.timeoutMs,
          bizLineId: args.bizLineId,
        })
        ensureHttpOk(result)
        return {
          status: result.status,
          total: Number(result.payload?.data?.total || 0),
        }
      }),
    )
  }

  checks.push(
    await safeRun('admin.metrics', async () => {
      const result = await requestJson({
        baseUrl: args.baseUrl,
        pathName: `/config/notifications/metrics/summary?biz_domain=${encodeURIComponent(args.bizDomain)}&days=7`,
        token: args.adminToken,
        timeoutMs: args.timeoutMs,
        bizLineId: args.bizLineId,
      })
      ensureHttpOk(result)
      return {
        status: result.status,
        window_days: Number(result.payload?.data?.window_days || 0),
        total_receivers: Number(result.payload?.data?.total_receivers || 0),
      }
    }),
  )

  if (args.write) {
    checks.push(
      await safeRun('admin.semantic_event_trigger', async () => {
        const result = await requestJson({
          baseUrl: args.baseUrl,
          pathName: '/notifications/events/semantic',
          method: 'POST',
          token: args.adminToken,
          timeoutMs: args.timeoutMs,
          bizLineId: args.bizLineId,
          body: {
            event_id: `TASK_OVERDUE_${Date.now()}`,
            biz_domain: args.bizDomain,
            event_type: args.bizDomain === 'efficiency' ? 'NO_FILL_REMINDER' : 'TASK_OVERDUE',
            biz_id: Number(Date.now().toString().slice(-8)),
            payload: {
              task_title: '通知中心回归测试任务',
              owner_user_id: 1,
              owner_name: '回归测试账号',
              due_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
              detail_url: '/notification-config',
            },
          },
        })
        ensureHttpOk(result)
        return {
          status: result.status,
          rules_hit: Number(result.payload?.data?.rules_hit || 0),
        }
      }),
    )
  } else {
    checks.push({
      name: 'admin.semantic_event_trigger',
      ok: true,
      duration_ms: 0,
      data: {
        skipped: true,
        reason: 'append --write to enable write checks',
      },
    })
  }

  if (args.userToken && firstRuleId) {
    checks.push(
      await safeRun('user.forbidden_update_rule', async () => {
        const result = await requestJson({
          baseUrl: args.baseUrl,
          pathName: `/config/notifications/rules/${firstRuleId}`,
          method: 'PUT',
          token: args.userToken,
          timeoutMs: args.timeoutMs,
          bizLineId: args.bizLineId,
          body: {
            biz_domain: args.bizDomain,
            rule_name: '用户无权限测试',
            enabled: true,
          },
        })
        if (result.status !== 403) {
          throw new Error(`expected_403_actual_${result.status}`)
        }
        return { status: result.status, message: result.payload?.message || '' }
      }),
    )
  }

  const failedCount = checks.filter((item) => !item.ok).length
  const output = {
    total: checks.length,
    failed: failedCount,
    passed: checks.length - failedCount,
    checks,
  }

  console.log(JSON.stringify(output, null, 2))
  process.exit(failedCount > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || String(error),
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
