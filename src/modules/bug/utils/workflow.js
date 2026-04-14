export const DEFAULT_BUG_WORKFLOW_TRANSITIONS = Object.freeze([
  {
    from_status_code: 'NEW',
    to_status_code: 'PROCESSING',
    action_key: 'start',
    action_name: '开始处理',
    enabled: 1,
    sort_order: 10,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'REOPENED',
    to_status_code: 'PROCESSING',
    action_key: 'start',
    action_name: '重新处理',
    enabled: 1,
    sort_order: 20,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'PROCESSING',
    to_status_code: 'FIXED',
    action_key: 'fix',
    action_name: '修复完成',
    enabled: 1,
    sort_order: 30,
    require_remark: 0,
    require_fix_solution: 1,
    require_verify_result: 0,
  },
  {
    from_status_code: 'PROCESSING',
    to_status_code: 'CLOSED',
    action_key: 'reject',
    action_name: '打回并关闭',
    enabled: 1,
    sort_order: 40,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'FIXED',
    to_status_code: 'CLOSED',
    action_key: 'verify',
    action_name: '验证通过',
    enabled: 1,
    sort_order: 50,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'FIXED',
    to_status_code: 'REOPENED',
    action_key: 'reopen',
    action_name: '重新打开',
    enabled: 1,
    sort_order: 60,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'CLOSED',
    to_status_code: 'REOPENED',
    action_key: 'reopen',
    action_name: '重新打开',
    enabled: 1,
    sort_order: 70,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
])

export function normalizeBugWorkflowTransitions(rows = []) {
  const source = Array.isArray(rows) ? rows : []
  const normalized = source
    .map((item, index) => ({
      from_status_code: String(item?.from_status_code || '').trim().toUpperCase(),
      to_status_code: String(item?.to_status_code || '').trim().toUpperCase(),
      action_key: String(item?.action_key || '').trim().toLowerCase(),
      action_name: String(item?.action_name || '').trim(),
      enabled:
        item?.enabled === false ||
        item?.enabled === 0 ||
        item?.enabled === '0' ||
        String(item?.enabled || '').toLowerCase() === 'false'
          ? 0
          : 1,
      sort_order: Number.isInteger(Number(item?.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
      require_remark:
        item?.require_remark === true ||
        item?.require_remark === 1 ||
        item?.require_remark === '1' ||
        String(item?.require_remark || '').toLowerCase() === 'true'
          ? 1
          : 0,
      require_fix_solution:
        item?.require_fix_solution === true ||
        item?.require_fix_solution === 1 ||
        item?.require_fix_solution === '1' ||
        String(item?.require_fix_solution || '').toLowerCase() === 'true'
          ? 1
          : 0,
      require_verify_result:
        item?.require_verify_result === true ||
        item?.require_verify_result === 1 ||
        item?.require_verify_result === '1' ||
        String(item?.require_verify_result || '').toLowerCase() === 'true'
          ? 1
          : 0,
    }))
    .filter((item) => item.from_status_code && item.to_status_code && item.action_key)

  if (normalized.length > 0) {
    return normalized.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  }
  return DEFAULT_BUG_WORKFLOW_TRANSITIONS.slice()
}

export function buildWorkflowTransitionMap(transitions = []) {
  const map = new Map()
  normalizeBugWorkflowTransitions(transitions).forEach((item) => {
    if (!item.enabled) return
    const fromStatusCode = String(item.from_status_code || '').trim().toUpperCase()
    if (!fromStatusCode) return
    if (!map.has(fromStatusCode)) map.set(fromStatusCode, [])
    map.get(fromStatusCode).push(item)
  })

  map.forEach((items, key) => {
    map.set(
      key,
      items.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    )
  })
  return map
}
