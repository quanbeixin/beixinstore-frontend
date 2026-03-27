import { getBeijingTodayDateString } from './datetime'

export const UNIFIED_WORK_STATUS = {
  RISK: 'RISK',
  OVERDUE: 'OVERDUE',
  DUE_TODAY: 'DUE_TODAY',
  LATE_DONE: 'LATE_DONE',
  ON_TIME_DONE: 'ON_TIME_DONE',
  NORMAL: 'NORMAL',
}

const UNIFIED_WORK_STATUS_META = {
  [UNIFIED_WORK_STATUS.RISK]: { label: '风险', color: 'warning' },
  [UNIFIED_WORK_STATUS.OVERDUE]: { label: '逾期', color: 'error' },
  [UNIFIED_WORK_STATUS.DUE_TODAY]: { label: '今日到期', color: 'gold' },
  [UNIFIED_WORK_STATUS.LATE_DONE]: { label: '逾期完成', color: 'volcano' },
  [UNIFIED_WORK_STATUS.ON_TIME_DONE]: { label: '按期完成', color: 'success' },
  [UNIFIED_WORK_STATUS.NORMAL]: { label: '正常', color: 'default' },
}

function normalizeDatePrefix(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text)) return text.slice(0, 10)
  return ''
}

export function getUnifiedStatusCode(record, { todayDate = getBeijingTodayDateString() } = {}) {
  const statusText = String(record?.unified_status || '').trim().toUpperCase()
  if (UNIFIED_WORK_STATUS_META[statusText]) return statusText

  const lifecycleStatus = String(record?.log_status || 'IN_PROGRESS')
    .trim()
    .toUpperCase()
  const expectedDate = normalizeDatePrefix(record?.expected_completion_date)
  const completedDate = normalizeDatePrefix(record?.log_completed_at) || normalizeDatePrefix(record?.updated_at)
  const risky = Boolean(record?.progress_risk)

  if (lifecycleStatus !== 'DONE' && risky) return UNIFIED_WORK_STATUS.RISK
  if (lifecycleStatus !== 'DONE') {
    if (expectedDate && expectedDate < todayDate) return UNIFIED_WORK_STATUS.OVERDUE
    if (expectedDate && expectedDate === todayDate) return UNIFIED_WORK_STATUS.DUE_TODAY
    return UNIFIED_WORK_STATUS.NORMAL
  }
  if (expectedDate && completedDate && completedDate > expectedDate) return UNIFIED_WORK_STATUS.LATE_DONE
  return UNIFIED_WORK_STATUS.ON_TIME_DONE
}

export function getUnifiedStatusMeta(record, options) {
  const code = getUnifiedStatusCode(record, options)
  return {
    code,
    ...(UNIFIED_WORK_STATUS_META[code] || UNIFIED_WORK_STATUS_META[UNIFIED_WORK_STATUS.NORMAL]),
  }
}

