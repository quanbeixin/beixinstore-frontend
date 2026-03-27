import {
  ArrowRightOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LeftOutlined,
  ReloadOutlined,
  SaveOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createWorkLogApi,
  createLogDailyEntryApi,
  deleteWorkLogApi,
  getLogDailyEntriesApi,
  getLogDailyPlansApi,
  getMyWorkbenchApi,
  getMyWeeklyReportApi,
  getWorkDemandsApi,
  getWorkItemTypesApi,
  getWorkPhaseTypesApi,
  getWorkLogsApi,
  updateWorkLogApi,
} from '../api/work'
import { hasPermission } from '../utils/access'
import { formatBeijingDate, getBeijingTodayDateString } from '../utils/datetime'
import { getUnifiedStatusMeta } from '../utils/workStatus'

const { Text } = Typography
const ITEM_STATUS_OPTIONS = [
  { label: '待开始', value: 'TODO' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
]
const UNIFIED_STATUS_OPTIONS = [
  { label: '风险', value: 'RISK' },
  { label: '逾期', value: 'OVERDUE' },
  { label: '今日到期', value: 'DUE_TODAY' },
  { label: '逾期完成', value: 'LATE_DONE' },
  { label: '按期完成', value: 'ON_TIME_DONE' },
  { label: '正常', value: 'NORMAL' },
]
const STATUS_FILTER_VALUE_PREFIX = {
  LIFECYCLE: 'LIFECYCLE:',
  UNIFIED: 'UNIFIED:',
}
function makeLifecycleFilterValue(status) {
  return `${STATUS_FILTER_VALUE_PREFIX.LIFECYCLE}${String(status || '').trim().toUpperCase()}`
}
function makeUnifiedFilterValue(status) {
  return `${STATUS_FILTER_VALUE_PREFIX.UNIFIED}${String(status || '').trim().toUpperCase()}`
}
function parseStatusFilterValue(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value || value === 'ALL') return { kind: 'all', value: '' }
  if (value.startsWith(STATUS_FILTER_VALUE_PREFIX.LIFECYCLE)) {
    return {
      kind: 'lifecycle',
      value: value.slice(STATUS_FILTER_VALUE_PREFIX.LIFECYCLE.length).toUpperCase(),
    }
  }
  if (value.startsWith(STATUS_FILTER_VALUE_PREFIX.UNIFIED)) {
    return {
      kind: 'unified',
      value: value.slice(STATUS_FILTER_VALUE_PREFIX.UNIFIED.length).toUpperCase(),
    }
  }
  return { kind: 'all', value: '' }
}
const ACTIVE_ITEM_STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  { label: '待开始', value: makeLifecycleFilterValue('TODO') },
  { label: '进行中', value: makeLifecycleFilterValue('IN_PROGRESS') },
  { label: '风险', value: makeUnifiedFilterValue('RISK') },
  { label: '逾期', value: makeUnifiedFilterValue('OVERDUE') },
  { label: '今日到期', value: makeUnifiedFilterValue('DUE_TODAY') },
  { label: '正常', value: makeUnifiedFilterValue('NORMAL') },
]
const ACTIVE_ITEM_VISIBLE_COUNT = 2
const ACTIVE_ITEM_CARD_ESTIMATED_HEIGHT = 330
const ACTIVE_ITEM_CARD_GAP = 12
const ACTIVE_ITEM_LIST_VIEW_HEIGHT = `calc(${ACTIVE_ITEM_VISIBLE_COUNT} * ${ACTIVE_ITEM_CARD_ESTIMATED_HEIGHT}px + ${(ACTIVE_ITEM_VISIBLE_COUNT - 1) * ACTIVE_ITEM_CARD_GAP}px)`
const HISTORY_VIEW_STATE_KEY = 'work_log_history_view_state'
const HISTORY_DATE_PRESET_OPTIONS = [
  { label: '全部时间', value: 'ALL' },
  { label: '近7天', value: 'LAST_7_DAYS' },
  { label: '近30天', value: 'LAST_30_DAYS' },
  { label: '本周', value: 'THIS_WEEK' },
  { label: '本月', value: 'THIS_MONTH' },
  { label: '自定义', value: 'CUSTOM' },
]
const LOG_STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  ...ITEM_STATUS_OPTIONS.map((item) => ({
    label: item.label,
    value: makeLifecycleFilterValue(item.value),
  })),
  ...UNIFIED_STATUS_OPTIONS.map((item) => ({
    label: item.label,
    value: makeUnifiedFilterValue(item.value),
  })),
]
const MUTED_TEXT_COLOR = '#667085'
const WARNING_TEXT_COLOR = '#dc2626'
const WARNING_BORDER_COLOR = '#ffccc7'
const WARNING_BG_COLOR = '#fff1f0'
const SURFACE_TEXT_COLOR = '#475467'
const SURFACE_CARD_STYLE = {
  border: '1px solid #e4e7ec',
  borderRadius: 8,
  padding: '8px 10px',
  background: '#f8fafc',
}
const SURFACE_CARD_COMPACT_STYLE = {
  border: '1px solid #e4e7ec',
  borderRadius: 8,
  padding: '5px 7px',
  background: '#f8fafc',
}
const WARNING_SURFACE_CARD_STYLE = {
  border: `1px solid ${WARNING_BORDER_COLOR}`,
  borderRadius: 8,
  padding: 8,
  background: WARNING_BG_COLOR,
}
const SURFACE_LABEL_STYLE = { fontSize: 12, color: MUTED_TEXT_COLOR }
const SURFACE_VALUE_STYLE = { fontSize: 18, fontWeight: 700 }
const COMPACT_SURFACE_LABEL_STYLE = { fontSize: 11, color: MUTED_TEXT_COLOR }
const ACTION_TRANSITION = 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)'
const ACTIVE_CARD_BASE_STYLE = {
  borderRadius: 10,
  padding: 10,
  transition: ACTION_TRANSITION,
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06)',
}
const HISTORY_HEADER_CARD_STYLE = {
  border: '1px solid #dbe7ff',
  borderRadius: 14,
  background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
}

function getTodayDateString() {
  return getBeijingTodayDateString()
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + Number(days || 0))
  return next
}

function formatDateInput(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfWeek(date) {
  const source = new Date(date)
  const weekday = source.getDay()
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1
  return addDays(source, -offsetToMonday)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function resolveHistoryDatePresetRange(preset) {
  const today = new Date()
  const normalizedPreset = String(preset || 'ALL').trim().toUpperCase()

  if (normalizedPreset === 'LAST_7_DAYS') {
    return {
      startDate: formatDateInput(addDays(today, -6)),
      endDate: formatDateInput(today),
    }
  }

  if (normalizedPreset === 'LAST_30_DAYS') {
    return {
      startDate: formatDateInput(addDays(today, -29)),
      endDate: formatDateInput(today),
    }
  }

  if (normalizedPreset === 'THIS_WEEK') {
    return {
      startDate: formatDateInput(startOfWeek(today)),
      endDate: formatDateInput(today),
    }
  }

  if (normalizedPreset === 'THIS_MONTH') {
    return {
      startDate: formatDateInput(startOfMonth(today)),
      endDate: formatDateInput(today),
    }
  }

  return {
    startDate: '',
    endDate: '',
  }
}

function getDefaultWeeklyRange() {
  const now = new Date()
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekday = localToday.getDay()
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1
  const thisWeekMonday = addDays(localToday, -offsetToMonday)
  return {
    start_date: formatDateInput(thisWeekMonday),
    end_date: formatDateInput(localToday),
  }
}

function getLastWeeklyRange() {
  const now = new Date()
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekday = localToday.getDay()
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1
  const thisWeekMonday = addDays(localToday, -offsetToMonday)
  const lastWeekMonday = addDays(thisWeekMonday, -7)
  const lastWeekSunday = addDays(thisWeekMonday, -1)
  return {
    start_date: formatDateInput(lastWeekMonday),
    end_date: formatDateInput(lastWeekSunday),
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatDateOnly(value) {
  return formatBeijingDate(value)
}

function toDateInputValue(value) {
  const date = formatDateOnly(value)
  return date === '-' ? undefined : date
}

function buildDetailDateRangeParams(record) {
  const startDate = toDateInputValue(record?.expected_start_date) || toDateInputValue(record?.log_date)
  const endDate = toDateInputValue(record?.expected_completion_date)
  if (!startDate && !endDate) return {}
  if (startDate && endDate && startDate > endDate) {
    return {
      start_date: startDate,
      end_date: startDate,
    }
  }
  return {
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
  }
}

function isDemandFollowupItem(item) {
  const typeKey = String(item?.item_type_key || '')
    .trim()
    .toUpperCase()
  const typeName = String(item?.item_type_name || '').replace(/\s+/g, '')
  if (typeKey.includes('DEMAND') && typeKey.includes('FOLLOW')) return true
  return typeName.includes('需求跟进')
}

function isDemandFollowupItemType(itemType) {
  const typeKey = String(itemType?.type_key || '')
    .trim()
    .toUpperCase()
  const typeName = String(itemType?.name || '').replace(/\s+/g, '')
  if (typeKey.includes('DEMAND') && typeKey.includes('FOLLOW')) return true
  return typeName.includes('需求跟进')
}

function splitHoursAcrossCount(totalHours, count) {
  const total = Math.max(0, Number(toNumber(totalHours, 0)))
  const safeCount = Math.max(1, Number(count || 1))
  const totalTicks = Math.round(total * 10)
  const baseTicks = Math.floor(totalTicks / safeCount)
  const remainderTicks = Math.max(0, totalTicks - baseTicks * safeCount)
  return Array.from({ length: safeCount }).map((_, index) => {
    const ticks = baseTicks + (index < remainderTicks ? 1 : 0)
    return Number((ticks / 10).toFixed(1))
  })
}

function openDemandDetailInNewTab(demandId) {
  const normalizedDemandId = String(demandId || '').trim()
  if (!normalizedDemandId) return
  const nextUrl = `/work-demands/${encodeURIComponent(normalizedDemandId)}`
  window.open(nextUrl, '_blank', 'noopener,noreferrer')
}

function getItemStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  return 'default'
}

function getItemStatusLabel(status) {
  const matched = ITEM_STATUS_OPTIONS.find((item) => item.value === status)
  return matched?.label || status || '进行中'
}

function getDisplayStatusMeta(record) {
  return getUnifiedStatusMeta(record)
}

function isOverdueDate(value) {
  const date = formatDateOnly(value)
  if (!date || date === '-') return false
  return date < getTodayDateString()
}

function truncateText(value, maxLength = 8) {
  const text = String(value || '').trim()
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return `${chars.slice(0, maxLength).join('')}...`
}

function formatRateText(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
}

function calcRemainingWorkload(item) {
  const estimate = toNumber(item?.personal_estimate_hours, 0)
  const completed = toNumber(item?.cumulative_actual_hours, 0)
  return Math.max(estimate - completed, 0)
}

function readHistoryViewState() {
  if (typeof window === 'undefined') {
    return {
      page: 1,
      pageSize: 10,
      logStatusFilter: 'ALL',
      datePreset: 'ALL',
      customStartDate: '',
      customEndDate: '',
    }
  }

  try {
    const rawValue = window.sessionStorage.getItem(HISTORY_VIEW_STATE_KEY)
    if (!rawValue) {
      return {
        page: 1,
        pageSize: 10,
        logStatusFilter: 'ALL',
        datePreset: 'ALL',
        customStartDate: '',
        customEndDate: '',
      }
    }

    const parsed = JSON.parse(rawValue)
    return {
      page: Math.max(1, Number(parsed?.page) || 1),
      pageSize: Math.max(1, Number(parsed?.pageSize) || 10),
      logStatusFilter: String(parsed?.logStatusFilter || 'ALL'),
      datePreset: String(parsed?.datePreset || 'ALL'),
      customStartDate: String(parsed?.customStartDate || ''),
      customEndDate: String(parsed?.customEndDate || ''),
    }
  } catch {
    return {
      page: 1,
      pageSize: 10,
      logStatusFilter: 'ALL',
      datePreset: 'ALL',
      customStartDate: '',
      customEndDate: '',
    }
  }
}

function writeHistoryViewState(nextState) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(HISTORY_VIEW_STATE_KEY, JSON.stringify(nextState))
  } catch {
    // noop
  }
}

function getStatusActionButtonStyle(status, isCurrent) {
  if (isCurrent) return undefined
  if (status === 'DONE') {
    return {
      borderColor: '#b7eb8f',
      color: '#389e0d',
      background: '#f6ffed',
    }
  }
  if (status === 'IN_PROGRESS') {
    return {
      borderColor: '#91caff',
      color: '#0958d9',
      background: '#e6f4ff',
    }
  }
  return {
    borderColor: '#d9d9d9',
    color: '#595959',
    background: '#fafafa',
  }
}

function getActiveCardStatusPanelStyle(status) {
  if (status === 'DONE') return { borderColor: '#d9f7be', background: '#f6ffed' }
  if (status === 'IN_PROGRESS') return { borderColor: '#bae0ff', background: '#f0f5ff' }
  return { borderColor: '#d9d9d9', background: '#fafafa' }
}

function getActiveCardAccentColor(status) {
  if (status === 'DONE') return '#52c41a'
  if (status === 'IN_PROGRESS') return '#1677ff'
  return '#8c8c8c'
}

function getActiveCardContainerStyle(item, currentStatus) {
  const overdue = isOverdueDate(item?.expected_completion_date)
  const leftAccentColor = overdue ? WARNING_TEXT_COLOR : getActiveCardAccentColor(currentStatus)
  return {
    ...ACTIVE_CARD_BASE_STYLE,
    border: overdue ? `1px solid ${WARNING_BORDER_COLOR}` : '1px solid #e4e7ec',
    borderLeft: `4px solid ${leftAccentColor}`,
    background: overdue ? WARNING_BG_COLOR : '#fff',
    boxShadow: overdue ? '0 2px 8px rgba(220, 38, 38, 0.14)' : ACTIVE_CARD_BASE_STYLE.boxShadow,
  }
}

function DemandTagButton({ demandId, label }) {
  return (
    <button
      type="button"
      aria-label={`查看需求 ${label}`}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
        textDecoration: 'underline dotted',
        lineHeight: 1.3,
      }}
      onClick={(event) => {
        event.stopPropagation()
        openDemandDetailInNewTab(demandId)
      }}
    >
      {label}
    </button>
  )
}

function buildDailyTimeline(plans = [], entries = []) {
  const dateMap = new Map()

  ;(plans || []).forEach((item) => {
    const date = formatDateOnly(item?.plan_date)
    if (!date || date === '-') return
    if (!dateMap.has(date)) {
      dateMap.set(date, {
        date,
        planned_hours: 0,
        actual_hours: 0,
        entry_count: 0,
        entry_details: [],
      })
    }
    const target = dateMap.get(date)
    target.planned_hours = toNumber(target.planned_hours, 0) + toNumber(item?.planned_hours, 0)
  })

  ;(entries || []).forEach((item) => {
    const date = formatDateOnly(item?.entry_date)
    if (!date || date === '-') return
    if (!dateMap.has(date)) {
      dateMap.set(date, {
        date,
        planned_hours: 0,
        actual_hours: 0,
        entry_count: 0,
        entry_details: [],
      })
    }
    const target = dateMap.get(date)
    const actualHours = toNumber(item?.actual_hours, 0)
    target.actual_hours = toNumber(target.actual_hours, 0) + actualHours
    target.entry_count = toNumber(target.entry_count, 0) + 1
    target.entry_details.push({
      id: item?.id,
      actual_hours: actualHours,
      description: String(item?.description || '').trim(),
      created_at: item?.created_at || '',
    })
  })

  return Array.from(dateMap.values())
    .map((item) => ({
      ...item,
      planned_hours: toNumber(item.planned_hours, 0),
      actual_hours: toNumber(item.actual_hours, 0),
      entry_count: toNumber(item.entry_count, 0),
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

function WorkLogs({ mode = 'dashboard' }) {
  const navigate = useNavigate()
  const isHistoryPage = mode === 'history'
  const initialHistoryViewState = useMemo(() => readHistoryViewState(), [])
  const canCreate = hasPermission('worklog.create')
  const canView = hasPermission('worklog.view.self')
  const canUpdate = hasPermission('worklog.update.self')

  const [form] = Form.useForm()
  const [actualForm] = Form.useForm()
  const [dailyEntryForm] = Form.useForm()

  const [itemTypes, setItemTypes] = useState([])
  const [demands, setDemands] = useState([])
  const [phaseDictItems, setPhaseDictItems] = useState([])
  const [logs, setLogs] = useState([])
  const [workbench, setWorkbench] = useState({
    today: {
      log_count_today: 0,
      personal_estimate_hours_today: 0,
      actual_hours_today: 0,
      remaining_hours_today: 0,
    },
    active_items: [],
    recent_logs: [],
  })

  const [loadingBase, setLoadingBase] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actualSubmitting, setActualSubmitting] = useState(false)
  const [statusSubmittingId, setStatusSubmittingId] = useState(null)
  const [deletingLogId, setDeletingLogId] = useState(null)
  const [actualModalOpen, setActualModalOpen] = useState(false)
  const [dailyEntryModalOpen, setDailyEntryModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [dailyEntrySubmitting, setDailyEntrySubmitting] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [operatingLog, setOperatingLog] = useState(null)
  const [detailLog, setDetailLog] = useState(null)
  const [detailTimeline, setDetailTimeline] = useState([])
  const [activeItemKeyword, setActiveItemKeyword] = useState('')
  const [activeItemStatusFilter, setActiveItemStatusFilter] = useState('ALL')
  const [weeklyModalOpen, setWeeklyModalOpen] = useState(false)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyRange, setWeeklyRange] = useState(() => getDefaultWeeklyRange())
  const [weeklyReport, setWeeklyReport] = useState(null)
  const [historyDatePreset, setHistoryDatePreset] = useState(() =>
    isHistoryPage ? initialHistoryViewState.datePreset : 'ALL',
  )
  const [historyCustomStartDate, setHistoryCustomStartDate] = useState(() =>
    isHistoryPage ? initialHistoryViewState.customStartDate : '',
  )
  const [historyCustomEndDate, setHistoryCustomEndDate] = useState(() =>
    isHistoryPage ? initialHistoryViewState.customEndDate : '',
  )
  const [logStatusFilter, setLogStatusFilter] = useState(() =>
    isHistoryPage ? initialHistoryViewState.logStatusFilter : 'ALL',
  )
  const [isQuickCompletionDateTouched, setIsQuickCompletionDateTouched] = useState(false)
  const quickCompletionDateAutoSyncRef = useRef(false)

  const [page, setPage] = useState(() => (isHistoryPage ? initialHistoryViewState.page : 1))
  const [pageSize, setPageSize] = useState(() => (isHistoryPage ? initialHistoryViewState.pageSize : 10))
  const [total, setTotal] = useState(0)

  const selectedTypeId = Form.useWatch('item_type_id', form)
  const selectedDemandId = Form.useWatch('demand_id', form)
  const selectedQuickPhaseValue = Form.useWatch('phase_key', form)
  const selectedActualTypeId = Form.useWatch('item_type_id', actualForm)
  const selectedActualDemandId = Form.useWatch('demand_id', actualForm)
  const selectedActualPhaseKey = Form.useWatch('phase_key', actualForm)

  const selectedItemType = useMemo(
    () => itemTypes.find((item) => Number(item.id) === Number(selectedTypeId)) || null,
    [itemTypes, selectedTypeId],
  )
  const selectedActualItemType = useMemo(
    () => itemTypes.find((item) => Number(item.id) === Number(selectedActualTypeId)) || null,
    [itemTypes, selectedActualTypeId],
  )

  const itemTypeOptions = useMemo(
    () =>
      itemTypes.map((item) => ({
        value: item.id,
        label: `${item.name}${Number(item.require_demand) === 1 ? '（需关联需求）' : ''}`,
      })),
    [itemTypes],
  )

  const demandOptions = useMemo(
    () =>
      demands.map((item) => ({
        value: item.id,
        label: item.name || item.id,
      })),
    [demands],
  )

  const quickDemandOptions = useMemo(
    () =>
      demands.map((item) => {
        const fullLabel = String(item?.name || item?.id || '').trim()
        const shortLabel = truncateText(fullLabel, 28)
        return {
          value: item.id,
          fullLabel,
          label: shortLabel === fullLabel ? fullLabel : <span title={fullLabel}>{shortLabel}</span>,
        }
      }),
    [demands],
  )

  const phaseOptions = useMemo(
    () =>
      phaseDictItems.map((item) => ({
        value: item.phase_key,
        label: item.phase_name || item.phase_key,
      })),
    [phaseDictItems],
  )

  const isQuickBatchPhaseMode = Boolean(selectedDemandId) && isDemandFollowupItemType(selectedItemType)
  const normalizedSelectedQuickPhaseKeys = useMemo(() => {
    const rawValues = Array.isArray(selectedQuickPhaseValue)
      ? selectedQuickPhaseValue
      : selectedQuickPhaseValue
        ? [selectedQuickPhaseValue]
        : []
    const unique = []
    const seen = new Set()
    rawValues.forEach((item) => {
      const normalized = String(item || '').trim().toUpperCase()
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      unique.push(normalized)
    })
    return unique
  }, [selectedQuickPhaseValue])

  const quickPhaseOptions = phaseOptions
  const actualPhaseOptions = phaseOptions

  const quickPhaseOptionsWithSelected = useMemo(() => {
    if (normalizedSelectedQuickPhaseKeys.length === 0) return quickPhaseOptions
    const merged = [...quickPhaseOptions]
    const existingSet = new Set(merged.map((item) => String(item.value || '').toUpperCase()))
    normalizedSelectedQuickPhaseKeys.forEach((selected) => {
      if (existingSet.has(selected)) return
      const fallback = phaseOptions.find((item) => String(item.value || '').toUpperCase() === selected)
      if (!fallback) return
      merged.push({ ...fallback, label: `${fallback.label}（非本部门）` })
      existingSet.add(selected)
    })
    return merged
  }, [quickPhaseOptions, phaseOptions, normalizedSelectedQuickPhaseKeys])

  const actualPhaseOptionsWithSelected = useMemo(() => {
    if (!selectedActualPhaseKey) return actualPhaseOptions
    const selected = String(selectedActualPhaseKey).trim().toUpperCase()
    if (!selected) return actualPhaseOptions
    if (actualPhaseOptions.some((item) => String(item.value || '').toUpperCase() === selected)) return actualPhaseOptions
    const fallback = phaseOptions.find((item) => String(item.value || '').toUpperCase() === selected)
    if (!fallback) return actualPhaseOptions
    return [...actualPhaseOptions, { ...fallback, label: `${fallback.label}（非本部门）` }]
  }, [actualPhaseOptions, phaseOptions, selectedActualPhaseKey])

  const activeItems = useMemo(() => {
    const rows = Array.isArray(workbench?.active_items) ? workbench.active_items : []
    return rows.filter((item) => (item?.log_status || 'IN_PROGRESS') !== 'DONE')
  }, [workbench])

  const activeItemSummary = useMemo(() => {
    return activeItems.reduce(
      (acc, item) => {
        const status = item?.log_status || 'IN_PROGRESS'
        if (status === 'TODO') acc.todo += 1
        if (status === 'IN_PROGRESS') acc.inProgress += 1
        if (isOverdueDate(item?.expected_completion_date)) acc.overdue += 1
        if (!item?.expected_completion_date) acc.noDeadline += 1
        return acc
      },
      { todo: 0, inProgress: 0, overdue: 0, noDeadline: 0 },
    )
  }, [activeItems])

  // 提醒统计
  const reminderStats = useMemo(() => {
    const today = getTodayDateString()
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')

    let overdueCount = 0
    let dueSoonCount = 0
    let missingActualCount = 0

    activeItems.forEach(item => {
      const completionDate = item?.expected_completion_date
      const status = item?.log_status || 'IN_PROGRESS'

      // 已超期
      if (completionDate && completionDate < today && status !== 'DONE') {
        overdueCount++
      }
      // 即将到期
      if (completionDate && (completionDate === today || completionDate === tomorrow) && status !== 'DONE') {
        dueSoonCount++
      }
      // 今日有计划但未记录实际
      const todayPlanned = toNumber(item?.today_planned_hours, 0)
      const todayActual = toNumber(item?.today_actual_hours, 0)
      if (todayPlanned > 0 && todayActual === 0) {
        missingActualCount++
      }
    })

    return { overdueCount, dueSoonCount, missingActualCount }
  }, [activeItems])

  const activeSummaryQuickFilterValues = useMemo(
    () => ({
      todo: makeLifecycleFilterValue('TODO'),
      inProgress: makeLifecycleFilterValue('IN_PROGRESS'),
      overdue: makeUnifiedFilterValue('OVERDUE'),
    }),
    [],
  )

  const workflowNodeByDemandId = useMemo(() => {
    const todos = Array.isArray(workbench?.workflow_todos) ? workbench.workflow_todos : []
    const map = new Map()
    todos.forEach((todo) => {
      const demandId = String(todo?.demand_id || '').trim()
      if (!demandId || map.has(demandId)) return
      const nodeName = String(todo?.node_name || todo?.task_title || '').trim()
      if (!nodeName) return
      map.set(demandId, nodeName)
    })
    return map
  }, [workbench])

  const filteredActiveItems = useMemo(() => {
    const keyword = activeItemKeyword.trim().toLowerCase()
    const statusFilter = parseStatusFilterValue(activeItemStatusFilter)

    const list = activeItems
      .filter((item) => {
        if (statusFilter.kind === 'lifecycle' && (item?.log_status || 'IN_PROGRESS') !== statusFilter.value) return false
        if (statusFilter.kind === 'unified' && getDisplayStatusMeta(item).code !== statusFilter.value) return false
        if (!keyword) return true
        const demandId = String(item?.demand_id || '').trim()
        const workflowNodeName = demandId ? workflowNodeByDemandId.get(demandId) || '' : ''
        const followupNodeLabel = isDemandFollowupItem(item) && workflowNodeName ? workflowNodeName : ''
        const text = `${item?.item_type_name || ''} ${item?.demand_id || ''} ${item?.phase_name || ''} ${
          item?.description || ''
        } ${item?.assigned_by_name || ''} ${
          item?.task_source || ''
        } ${item?.expected_start_date || ''} ${item?.expected_completion_date || ''} ${followupNodeLabel}`.toLowerCase()
        return text.includes(keyword)
      })
      .sort((a, b) => {
        const aDate = formatDateOnly(a?.expected_completion_date)
        const bDate = formatDateOnly(b?.expected_completion_date)
        const aHasDate = aDate && aDate !== '-'
        const bHasDate = bDate && bDate !== '-'
        if (aHasDate && bHasDate) {
          if (aDate !== bDate) return aDate.localeCompare(bDate)
        } else if (aHasDate && !bHasDate) {
          return -1
        } else if (!aHasDate && bHasDate) {
          return 1
        }
        return Number(b?.id || 0) - Number(a?.id || 0)
      })

    return list
  }, [activeItems, activeItemKeyword, activeItemStatusFilter, workflowNodeByDemandId])

  const weeklySummary = useMemo(() => weeklyReport?.summary || {}, [weeklyReport])
  const weeklyTopItems = useMemo(
    () => (Array.isArray(weeklyReport?.top_items) ? weeklyReport.top_items : []),
    [weeklyReport],
  )
  const weeklyDailyRows = useMemo(
    () => (Array.isArray(weeklyReport?.daily_breakdown) ? weeklyReport.daily_breakdown : []),
    [weeklyReport],
  )
  const historyDateRange = useMemo(() => {
    if (String(historyDatePreset || '').trim().toUpperCase() === 'CUSTOM') {
      return {
        startDate: String(historyCustomStartDate || '').trim(),
        endDate: String(historyCustomEndDate || '').trim(),
      }
    }
    return resolveHistoryDatePresetRange(historyDatePreset)
  }, [historyCustomEndDate, historyCustomStartDate, historyDatePreset])
  const currentHistoryFilterLabel = useMemo(() => {
    const matched = LOG_STATUS_FILTER_OPTIONS.find((item) => item.value === logStatusFilter)
    return matched?.label || '全部状态'
  }, [logStatusFilter])
  const currentHistoryDatePresetLabel = useMemo(() => {
    const matched = HISTORY_DATE_PRESET_OPTIONS.find((item) => item.value === historyDatePreset)
    return matched?.label || '全部时间'
  }, [historyDatePreset])
  const currentHistoryDateRangeText = useMemo(() => {
    if (historyDateRange.startDate && !historyDateRange.endDate) return `${historyDateRange.startDate} ~ 至今`
    if (!historyDateRange.startDate && historyDateRange.endDate) return `最早 ~ ${historyDateRange.endDate}`
    if (!historyDateRange.startDate && !historyDateRange.endDate) return '全部时间'
    return `${historyDateRange.startDate} ~ ${historyDateRange.endDate}`
  }, [historyDateRange.endDate, historyDateRange.startDate])
  const isHistoryDateRangeInvalid = useMemo(() => {
    return (
      Boolean(historyDateRange.startDate) &&
      Boolean(historyDateRange.endDate) &&
      historyDateRange.startDate > historyDateRange.endDate
    )
  }, [historyDateRange.endDate, historyDateRange.startDate])

  const weeklySummaryText = useMemo(() => {
    if (!weeklyReport) return ''

    const range = weeklyReport.range || {}
    const topLines = weeklyTopItems
      .slice(0, 5)
      .map((item, index) => {
        const demandName = String(item?.demand_name || item?.demand_id || '').trim()
        const phaseName = String(item?.phase_name || item?.phase_key || '').trim()
        const label = demandName ? `${item.item_type_name || '事项'}｜${demandName}` : item.item_type_name || '事项'
        const phaseText = phaseName ? `｜需求任务:${phaseName}` : ''
        return `${index + 1}. ${label}${phaseText}｜计划:${toNumber(item?.planned_hours, 0).toFixed(1)}h｜实际:${toNumber(
          item?.actual_hours,
          0,
        ).toFixed(1)}h`
      })
      .join('\n')

    const rangeText = `${range.start_date || weeklyRange.start_date} ~ ${range.end_date || weeklyRange.end_date}`
    return [
      `【个人周报】${rangeText}`,
      `事项总数: ${toNumber(weeklySummary.item_count, 0)}（待开始 ${toNumber(weeklySummary.todo_count, 0)} / 进行中 ${toNumber(
        weeklySummary.in_progress_count,
        0,
      )} / 已完成 ${toNumber(weeklySummary.done_count, 0)}）`,
      `计划用时: ${toNumber(weeklySummary.planned_hours, 0).toFixed(1)}h`,
      `实际用时: ${toNumber(weeklySummary.actual_hours, 0).toFixed(1)}h`,
      `偏差: ${toNumber(weeklySummary.variance_hours, 0).toFixed(1)}h（${formatRateText(weeklySummary.variance_rate)}）`,
      `活跃天数: ${toNumber(weeklySummary.active_days, 0)} / 填报天数: ${toNumber(weeklySummary.filled_days, 0)}`,
      `超期事项: ${toNumber(weeklySummary.overdue_count, 0)}`,
      '本周投入Top事项:',
      topLines || '无',
    ].join('\n')
  }, [weeklyReport, weeklyRange.end_date, weeklyRange.start_date, weeklySummary, weeklyTopItems])

  const loadBase = useCallback(async () => {
    setLoadingBase(true)
    try {
      const requests = [
        getWorkItemTypesApi({ enabled_only: 1 }),
        getWorkDemandsApi({ page: 1, pageSize: 1000 }),
        getWorkPhaseTypesApi({ enabled_only: 1 }),
      ]
      if (!isHistoryPage) {
        requests.push(getMyWorkbenchApi())
      }

      const [typeResult, demandResult, phaseResult, benchResult] = await Promise.all(requests)

      if (!typeResult?.success) {
        message.error(typeResult?.message || '获取事项类型失败')
        return
      }

      if (!demandResult?.success) {
        message.error(demandResult?.message || '获取需求列表失败')
        return
      }

      if (!phaseResult?.success) {
        message.error(phaseResult?.message || '获取需求任务字典失败')
        return
      }

      if (!isHistoryPage && !benchResult?.success) {
        message.error(benchResult?.message || '获取工作台数据失败')
        return
      }

      setItemTypes(typeResult.data || [])
      setDemands(demandResult.data?.list || [])
      setPhaseDictItems(
        (phaseResult.data || []).map((item) => ({
          phase_key: item.phase_key,
          phase_name: item.phase_name,
        })),
      )
      if (!isHistoryPage) {
        setWorkbench(benchResult?.data || {})
      }
    } catch (error) {
      message.error(error?.message || '加载基础数据失败')
    } finally {
      setLoadingBase(false)
    }
  }, [isHistoryPage])

  const loadLogs = useCallback(async () => {
    if (!canView || !isHistoryPage) return
    if (isHistoryDateRangeInvalid) {
      message.warning('开始日期不能晚于结束日期')
      setLogs([])
      setTotal(0)
      return
    }

    setLoadingLogs(true)
    try {
      const statusFilter = parseStatusFilterValue(logStatusFilter)
      const result = await getWorkLogsApi({
        page,
        pageSize,
        ...(historyDateRange.startDate ? { start_date: historyDateRange.startDate } : {}),
        ...(historyDateRange.endDate ? { end_date: historyDateRange.endDate } : {}),
        ...(statusFilter.kind === 'lifecycle' ? { log_status: statusFilter.value } : {}),
        ...(statusFilter.kind === 'unified' ? { unified_status: statusFilter.value } : {}),
      })
      if (!result?.success) {
        message.error(result?.message || '获取工作记录失败')
        return
      }

      setLogs(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取工作记录失败')
    } finally {
      setLoadingLogs(false)
    }
  }, [
    canView,
    historyDateRange.endDate,
    historyDateRange.startDate,
    isHistoryDateRangeInvalid,
    isHistoryPage,
    page,
    pageSize,
    logStatusFilter,
  ])

  const fetchWeeklyReport = useCallback(
    async (rangeInput = weeklyRange) => {
      const startDate = String(rangeInput?.start_date || '').trim()
      const endDate = String(rangeInput?.end_date || '').trim()
      if (!startDate || !endDate) {
        message.warning('请先选择完整的周报时间范围')
        return
      }
      if (startDate > endDate) {
        message.warning('开始日期不能晚于结束日期')
        return
      }

      setWeeklyLoading(true)
      try {
        const result = await getMyWeeklyReportApi({
          start_date: startDate,
          end_date: endDate,
        })
        if (!result?.success) {
          message.error(result?.message || '获取个人周报失败')
          return
        }
        setWeeklyReport(result.data || null)
      } catch (error) {
        message.error(error?.message || '获取个人周报失败')
      } finally {
        setWeeklyLoading(false)
      }
    },
    [weeklyRange],
  )

  const openWeeklyModal = async () => {
    setWeeklyModalOpen(true)
    await fetchWeeklyReport(weeklyRange)
  }

  const closeWeeklyModal = () => {
    setWeeklyModalOpen(false)
  }

  const handleWeeklyRangeChange = (field, value) => {
    setWeeklyRange((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleWeeklySwitchToThisWeek = async () => {
    const next = getDefaultWeeklyRange()
    setWeeklyRange(next)
    await fetchWeeklyReport(next)
  }

  const handleWeeklySwitchToLastWeek = async () => {
    const next = getLastWeeklyRange()
    setWeeklyRange(next)
    await fetchWeeklyReport(next)
  }

  const handleCopyWeeklySummary = async () => {
    if (!weeklySummaryText) {
      message.warning('暂无可复制的周报内容')
      return
    }
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(weeklySummaryText)
        message.success('周报文案已复制')
        return
      } catch {
        // 继续走降级方案
      }
    }
    const textarea = document.createElement('textarea')
    textarea.value = weeklySummaryText
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      document.execCommand('copy')
      message.success('周报文案已复制')
    } catch {
      message.error('复制失败，请手动复制')
    } finally {
      document.body.removeChild(textarea)
    }
  }

  useEffect(() => {
    form.setFieldsValue({
      log_date: getTodayDateString(),
      expected_start_date: getTodayDateString(),
      expected_completion_date: getTodayDateString(),
      personal_estimate_hours: 1,
    })
    setIsQuickCompletionDateTouched(false)
    loadBase()
  }, [form, loadBase])

  useEffect(() => {
    if (!isHistoryPage) return
    loadLogs()
  }, [isHistoryPage, loadLogs])

  useEffect(() => {
    if (!isHistoryPage) return
    writeHistoryViewState({
      page,
      pageSize,
      logStatusFilter,
      datePreset: historyDatePreset,
      customStartDate: historyCustomStartDate,
      customEndDate: historyCustomEndDate,
    })
  }, [
    historyCustomEndDate,
    historyCustomStartDate,
    historyDatePreset,
    isHistoryPage,
    logStatusFilter,
    page,
    pageSize,
  ])

  useEffect(() => {
    if (!selectedDemandId || normalizedSelectedQuickPhaseKeys.length === 0) return
    const visibleSet = new Set(quickPhaseOptions.map((item) => String(item.value || '').toUpperCase()))
    const rawValue = form.getFieldValue('phase_key')
    if (Array.isArray(rawValue)) {
      const next = rawValue.filter((item) => visibleSet.has(String(item || '').trim().toUpperCase()))
      if (next.length !== rawValue.length) {
        form.setFieldValue('phase_key', next.length > 0 ? next : undefined)
      }
      return
    }

    const selected = normalizedSelectedQuickPhaseKeys[0]
    if (!visibleSet.has(selected)) {
      form.setFieldValue('phase_key', undefined)
    }
  }, [selectedDemandId, normalizedSelectedQuickPhaseKeys, quickPhaseOptions, form])

  useEffect(() => {
    if (isQuickBatchPhaseMode) return
    const rawValue = form.getFieldValue('phase_key')
    if (!Array.isArray(rawValue)) return
    form.setFieldValue('phase_key', rawValue[0] || undefined)
  }, [isQuickBatchPhaseMode, form])

  useEffect(() => {
    if (!actualModalOpen || !editingLog) return
    actualForm.setFieldsValue({
      item_type_id: editingLog.item_type_id,
      demand_id: editingLog.demand_id || undefined,
      phase_key: editingLog.phase_key || undefined,
      log_status: editingLog.log_status || 'IN_PROGRESS',
      description: String(editingLog.description || ''),
      personal_estimate_hours: toNumber(editingLog.personal_estimate_hours, 0),
      actual_hours: toNumber(editingLog.actual_hours, 0),
      expected_start_date: toDateInputValue(editingLog.expected_start_date),
      expected_completion_date: toDateInputValue(editingLog.expected_completion_date),
      log_completed_at: toDateInputValue(editingLog.log_completed_at),
    })
  }, [actualForm, actualModalOpen, editingLog])

  const reloadCurrentPageData = useCallback(async () => {
    if (isHistoryPage) {
      await Promise.all([loadBase(), loadLogs()])
      return
    }
    await loadBase()
  }, [isHistoryPage, loadBase, loadLogs])

  const handleRefresh = async () => {
    await reloadCurrentPageData()
  }

  const handleCreateLog = async (values) => {
    if (!canCreate) return

    const requireDemand = Number(selectedItemType?.require_demand) === 1
    if (requireDemand && !values.demand_id) {
      message.warning('当前事项类型必须关联需求')
      return
    }

    const rawPhaseValue = values.phase_key
    const selectedPhaseKeys = (Array.isArray(rawPhaseValue) ? rawPhaseValue : rawPhaseValue ? [rawPhaseValue] : [])
      .map((item) => String(item || '').trim())
      .filter((item) => item)
    const uniquePhaseKeys = [...new Set(selectedPhaseKeys)]

    if (values.demand_id && uniquePhaseKeys.length === 0) {
      message.warning('关联需求时必须选择需求任务')
      return
    }

    const phaseKeysForCreate = values.demand_id ? (isQuickBatchPhaseMode ? uniquePhaseKeys : [uniquePhaseKeys[0]]) : [null]

    try {
      setSubmitting(true)
      const totalEstimateHours = toNumber(values.personal_estimate_hours, 0)
      const estimateHoursList =
        phaseKeysForCreate.length > 1
          ? splitHoursAcrossCount(totalEstimateHours, phaseKeysForCreate.length)
          : [totalEstimateHours]
      const basePayload = {
        log_date: values.log_date,
        item_type_id: values.item_type_id,
        demand_id: values.demand_id || null,
        expected_start_date: values.expected_start_date || values.log_date || getTodayDateString(),
        expected_completion_date: values.expected_completion_date || null,
        description: values.description,
      }
      let successCount = 0
      let failedMessage = ''

      for (let index = 0; index < phaseKeysForCreate.length; index += 1) {
        const phaseKey = phaseKeysForCreate[index]
        const result = await createWorkLogApi({
          ...basePayload,
          phase_key: phaseKey || null,
          personal_estimate_hours: estimateHoursList[index] ?? totalEstimateHours,
        })
        if (!result?.success) {
          failedMessage = result?.message || '提交失败'
          break
        }
        successCount += 1
      }

      if (successCount === 0) {
        message.error(failedMessage || '提交失败')
        return
      }

      if (phaseKeysForCreate.length > 1) {
        if (successCount === phaseKeysForCreate.length) {
          message.success(`已批量创建 ${successCount} 条事项`)
        } else {
          message.warning(`已创建 ${successCount}/${phaseKeysForCreate.length} 条，剩余创建失败：${failedMessage || '请重试'}`)
        }
      } else {
        message.success('工作记录已提交')
      }

      form.setFieldsValue({
        description: '',
        expected_start_date: getTodayDateString(),
        expected_completion_date: getTodayDateString(),
        personal_estimate_hours: 1,
      })
      setIsQuickCompletionDateTouched(false)
      await reloadCurrentPageData()
    } catch (error) {
      message.error(error?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openHistoryPage = () => {
    navigate('/work-log-history')
  }

  const backToWorkbench = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/work-logs')
  }

  const openActualModal = (record) => {
    setEditingLog(record)
    setActualModalOpen(true)
  }

  const closeActualModal = () => {
    actualForm.resetFields()
    setActualModalOpen(false)
    setEditingLog(null)
  }

  const openDailyEntryModal = (record) => {
    const hasTodayActual = Number.isFinite(Number(record?.today_actual_hours))
    const defaultActualHours = hasTodayActual
      ? toNumber(record?.today_actual_hours, 0)
      : toNumber(record?.today_planned_hours, 0) > 0
        ? toNumber(record?.today_planned_hours, 0)
        : 0

    setOperatingLog(record)
    dailyEntryForm.setFieldsValue({
      entry_date: getTodayDateString(),
      actual_hours: defaultActualHours,
      description: '',
    })
    setDailyEntryModalOpen(true)
  }

  const closeDailyEntryModal = () => {
    dailyEntryForm.resetFields()
    setDailyEntryModalOpen(false)
    setOperatingLog(null)
  }

  const openDetailModal = async (record) => {
    if (!record?.id) return
    setDetailLog(record)
    setDetailTimeline([])
    setDetailModalOpen(true)
    setDetailLoading(true)
    try {
      const rangeParams = buildDetailDateRangeParams(record)
      const [planResult, entryResult] = await Promise.all([
        getLogDailyPlansApi(record.id, rangeParams),
        getLogDailyEntriesApi(record.id, rangeParams),
      ])

      if (!planResult?.success) {
        message.error(planResult?.message || '获取事项日计划失败')
        return
      }
      if (!entryResult?.success) {
        message.error(entryResult?.message || '获取事项日投入失败')
        return
      }

      const timeline = buildDailyTimeline(planResult.data || [], entryResult.data || [])
      setDetailTimeline(timeline)
    } catch (error) {
      message.error(error?.message || '获取事项日明细失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetailModal = () => {
    setDetailModalOpen(false)
    setDetailLoading(false)
    setDetailLog(null)
    setDetailTimeline([])
  }

  const handleCreateDailyEntry = async () => {
    if (!operatingLog?.id) return
    try {
      setDailyEntrySubmitting(true)
      const values = await dailyEntryForm.validateFields()
      const result = await createLogDailyEntryApi(operatingLog.id, {
        entry_date: values.entry_date || getTodayDateString(),
        actual_hours: values.actual_hours,
        description: values.description || '',
      })
      if (!result?.success) {
        message.error(result?.message || '登记今日投入失败')
        return
      }

      const savedEntryDate = String(values.entry_date || getTodayDateString()).trim()
      const todayDate = getTodayDateString()
      if (savedEntryDate && savedEntryDate !== todayDate) {
        message.success('投入已登记（仅填报日期为今天时会联动今日汇总）')
      } else {
        message.success('今日投入已登记')
      }
      closeDailyEntryModal()
      await reloadCurrentPageData()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '登记今日投入失败')
      }
    } finally {
      setDailyEntrySubmitting(false)
    }
  }

  const handleUpdateActual = async () => {
    if (!editingLog?.id) return

    try {
      setActualSubmitting(true)
      const values = await actualForm.validateFields()
      const requireDemand = Number(selectedActualItemType?.require_demand) === 1
      if (requireDemand && !values.demand_id) {
        message.warning('当前事项类型必须关联需求')
        return
      }
      if (values.demand_id && !values.phase_key) {
        message.warning('关联需求时必须选择需求任务')
        return
      }
      const selectedStatus = String(values.log_status || editingLog.log_status || 'IN_PROGRESS').toUpperCase()

      // 状态转换验证：TODO → IN_PROGRESS 需要填写个人预估
      const previousStatus = String(editingLog.log_status || 'TODO').toUpperCase()
      if (previousStatus === 'TODO' && selectedStatus === 'IN_PROGRESS') {
        if (!values.personal_estimate_hours || values.personal_estimate_hours <= 0) {
          message.error('开始工作前必须填写个人预估用时')
          return
        }
      }
      let nextCompletedAt = values.log_completed_at || null

      if (selectedStatus === 'DONE' && !nextCompletedAt) {
        nextCompletedAt = getTodayDateString()
      }

      const resolvedActualHours =
        values.actual_hours === undefined || values.actual_hours === null || values.actual_hours === ''
          ? 0
          : values.actual_hours

      const payload = {
        item_type_id: values.item_type_id,
        demand_id: values.demand_id || null,
        phase_key: values.demand_id ? values.phase_key : null,
        log_status: selectedStatus,
        description: values.description,
        personal_estimate_hours: values.personal_estimate_hours,
        actual_hours: resolvedActualHours,
        expected_start_date: values.expected_start_date || null,
        expected_completion_date: values.expected_completion_date || null,
        log_completed_at: nextCompletedAt,
      }

      const result = await updateWorkLogApi(editingLog.id, {
        ...payload,
      })

      if (!result?.success) {
        message.error(result?.message || '实际用时登记失败')
        return
      }

      message.success('事项进展已更新')
      closeActualModal()
      await reloadCurrentPageData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查实际用时表单输入')
      } else {
        message.error(error?.message || '实际用时登记失败')
      }
    } finally {
      setActualSubmitting(false)
    }
  }

  const handleUpdateItemStatus = async (record, nextStatus) => {
    if (!record?.id || !nextStatus) return
    if (!canUpdate) return

    try {
      setStatusSubmittingId(record.id)
      const result = await updateWorkLogApi(record.id, {
        log_status: nextStatus,
      })

      if (!result?.success) {
        message.error(result?.message || '更新事项状态失败')
        return
      }

      message.success('事项状态已更新')
      await reloadCurrentPageData()
    } catch (error) {
      message.error(error?.message || '更新事项状态失败')
    } finally {
      setStatusSubmittingId(null)
    }
  }

  const handleDeleteLog = async (record) => {
    if (!record?.id || !canUpdate) return

    try {
      setDeletingLogId(record.id)
      const result = await deleteWorkLogApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除工作记录失败')
        return
      }

      message.success('工作记录已删除')
      await reloadCurrentPageData()
    } catch (error) {
      message.error(error?.message || '删除工作记录失败')
    } finally {
      setDeletingLogId(null)
    }
  }

  const handleLogStatusFilterChange = (next) => {
    setLogStatusFilter(next)
    if (page !== 1) {
      setPage(1)
    }
  }

  const handleSummaryQuickFilterClick = (nextFilterValue) => {
    setActiveItemStatusFilter((prev) => (prev === nextFilterValue ? 'ALL' : nextFilterValue))
  }

  const handleHistoryDatePresetChange = (next) => {
    setHistoryDatePreset(next)
    const normalizedNext = String(next || '').trim().toUpperCase()
    if (normalizedNext === 'CUSTOM') {
      // 保留当前输入，便于继续调整
    } else {
      const nextRange = resolveHistoryDatePresetRange(normalizedNext)
      setHistoryCustomStartDate(nextRange.startDate || '')
      setHistoryCustomEndDate(nextRange.endDate || '')
    }
    if (page !== 1) {
      setPage(1)
    }
  }

  const handleHistoryCustomDateChange = (field, value) => {
    setHistoryDatePreset('CUSTOM')
    if (field === 'start_date') {
      setHistoryCustomStartDate(value || '')
    }
    if (field === 'end_date') {
      setHistoryCustomEndDate(value || '')
    }
    if (page !== 1) {
      setPage(1)
    }
  }

  const handleResetHistoryFilters = () => {
    setLogStatusFilter('ALL')
    setHistoryDatePreset('ALL')
    setHistoryCustomStartDate('')
    setHistoryCustomEndDate('')
    if (page !== 1) {
      setPage(1)
    }
  }

  const logColumns = [
    {
      title: '创建日期',
      dataIndex: 'log_date',
      key: 'log_date',
      width: 120,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '事项状态',
      dataIndex: 'log_status',
      key: 'log_status',
      width: 120,
      render: (_, record) => {
        const meta = getDisplayStatusMeta(record)
        return (
          <Tag color={meta.color}>
            {meta.label}
          </Tag>
        )
      },
    },
    {
      title: '生命周期',
      dataIndex: 'log_status',
      key: 'log_status_lifecycle',
      width: 120,
      render: (value) => (
        <Tag color={getItemStatusColor(value)}>
          {getItemStatusLabel(value)}
        </Tag>
      ),
    },
    {
      title: '需求任务',
      dataIndex: 'phase_name',
      key: 'phase_name',
      width: 150,
      render: (_, record) => (record.phase_name || record.phase_key || '-'),
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: {
        showTitle: false,
      },
      render: (value) => {
        const text = String(value || '').trim()
        if (!text) return '-'
        return (
          <Tooltip title={text}>
            <span style={{ fontWeight: 600, color: '#101828' }}>{text}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '关联需求',
      dataIndex: 'demand_id',
      key: 'demand_id',
      width: 220,
      render: (_, record) => record?.demand_name || '-',
    },
    {
      title: '指派人',
      dataIndex: 'assigned_by_name',
      key: 'assigned_by_name',
      width: 120,
      render: (_, record) => record.assigned_by_name || '-',
    },
    {
      title: '预计开始日期',
      dataIndex: 'expected_start_date',
      key: 'expected_start_date',
      width: 140,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '预计完成日期',
      dataIndex: 'expected_completion_date',
      key: 'expected_completion_date',
      width: 140,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '实际完成日期',
      dataIndex: 'log_completed_at',
      key: 'log_completed_at',
      width: 130,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '预计整体用时(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 140,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际用时(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 140,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, record) =>
        canUpdate ? (
          <Space size={4}>
            <Button type='link' icon={<EditOutlined />} onClick={() => openActualModal(record)}>
              修改记录
            </Button>
            <Popconfirm
              title="确认删除该工作记录？"
              description="删除后不可恢复，请谨慎操作。"
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: deletingLogId === record.id }}
              onConfirm={() => handleDeleteLog(record)}
            >
              <Button type='link' danger icon={<DeleteOutlined />} loading={deletingLogId === record.id}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ]

  const detailSummary = useMemo(() => {
    return detailTimeline.reduce(
      (acc, item) => {
        acc.days += 1
        acc.totalPlanned += toNumber(item?.planned_hours, 0)
        acc.totalActual += toNumber(item?.actual_hours, 0)
        acc.totalEntries += toNumber(item?.entry_count, 0)
        return acc
      },
      { days: 0, totalPlanned: 0, totalActual: 0, totalEntries: 0 },
    )
  }, [detailTimeline])

  const detailColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '计划(h)',
      dataIndex: 'planned_hours',
      key: 'planned_hours',
      width: 110,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 110,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '投入记录',
      dataIndex: 'entry_count',
      key: 'entry_count',
      width: 100,
      render: (value) => `${toNumber(value, 0)} 条`,
    },
    {
      title: '投入说明',
      dataIndex: 'entry_details',
      key: 'entry_details',
      render: (value) => {
        const rows = Array.isArray(value) ? value : []
        if (rows.length === 0) return <Text type="secondary">-</Text>
        const merged = rows
          .map((item) => {
            const desc = String(item?.description || '').trim()
            return desc ? `${toNumber(item?.actual_hours, 0).toFixed(1)}h ${desc}` : `${toNumber(item?.actual_hours, 0).toFixed(1)}h`
          })
          .join('；')

        if (Array.from(merged).length <= 30) return merged
        return (
          <Tooltip title={merged}>
            <span>{truncateText(merged, 30)}</span>
          </Tooltip>
        )
      },
    },
  ]

  const weeklyDailyColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '计划用时(h)',
      dataIndex: 'planned_hours',
      key: 'planned_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际用时(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '事项数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      render: (value) => toNumber(value, 0),
    },
    {
      title: '填报条数',
      dataIndex: 'entry_count',
      key: 'entry_count',
      width: 110,
      render: (value) => toNumber(value, 0),
    },
  ]

  const weeklyTopColumns = [
    {
      title: '事项ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (value) => `#${value}`,
    },
    {
      title: '状态',
      dataIndex: 'log_status',
      key: 'log_status',
      width: 90,
      render: (_, record) => {
        const meta = getDisplayStatusMeta(record)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 130,
    },
    {
      title: '需求',
      dataIndex: 'demand_name',
      key: 'demand_name',
      width: 210,
      render: (_, record) => record?.demand_name || record?.demand_id || '-',
    },
    {
      title: '需求任务',
      dataIndex: 'phase_name',
      key: 'phase_name',
      width: 140,
      render: (_, record) => record?.phase_name || record?.phase_key || '-',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '计划(h)',
      dataIndex: 'planned_hours',
      key: 'planned_hours',
      width: 100,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 100,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '偏差(h)',
      dataIndex: 'variance_hours',
      key: 'variance_hours',
      width: 110,
      render: (value) => {
        const num = toNumber(value, 0)
        return <Text type={num > 0 ? 'danger' : 'success'}>{num.toFixed(1)}</Text>
      },
    },
  ]

  return (
    <div style={{ padding: 12, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      {!isHistoryPage ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={4}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space>
                  <UnorderedListOutlined />
                  <Text type="secondary">今日应完成事项</Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                  {toNumber(workbench?.today?.scheduled_item_count_today, 0)}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space>
                  <CheckCircleOutlined />
                  <Text type="secondary">今日已填报事项</Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                  {toNumber(workbench?.today?.filled_item_count_today, 0)}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space>
                  <ClockCircleOutlined />
                  <Text type="secondary">今日计划用时(h)</Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                  {toNumber(workbench?.today?.planned_hours_today, 0).toFixed(1)}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space>
                  <FileTextOutlined />
                  <Text type="secondary">今日实际用时(h)</Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                  {toNumber(workbench?.today?.actual_hours_today, 0).toFixed(1)}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={24} lg={6}>
              <Card variant="borderless" style={{ height: '100%' }}>
                <Space>
                  <ClockCircleOutlined />
                  <Text type="secondary">今日可指派用时(h)</Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#0958d9' }}>
                  {toNumber(workbench?.today?.assignable_hours_today, 0).toFixed(1)}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
            <Col xs={24} lg={10} style={{ display: 'flex' }}>
              <Card
                title="快速填报"
                variant="borderless"
                style={{ width: '100%', height: '100%' }}
                extra={
                  <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loadingBase || loadingLogs}>
                    重置
                  </Button>
                }
              >
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleCreateLog}
                  onValuesChange={(changedValues) => {
                    if (Object.prototype.hasOwnProperty.call(changedValues, 'expected_completion_date')) {
                      if (quickCompletionDateAutoSyncRef.current) {
                        quickCompletionDateAutoSyncRef.current = false
                      } else {
                        setIsQuickCompletionDateTouched(true)
                      }
                    }

                    if (
                      Object.prototype.hasOwnProperty.call(changedValues, 'expected_start_date') &&
                      !isQuickCompletionDateTouched
                    ) {
                      quickCompletionDateAutoSyncRef.current = true
                      form.setFieldValue('expected_completion_date', changedValues.expected_start_date || undefined)
                    }
                  }}
                  disabled={!canCreate || loadingBase}
                >
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item label="填报日期" name="log_date" rules={[{ required: true, message: '请选择日期' }]}>
                        <Input type="date" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="事项类型"
                        name="item_type_id"
                        rules={[{ required: true, message: '请选择事项类型' }]}
                      >
                        <Select options={itemTypeOptions} placeholder="请选择事项类型" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="关联需求"
                        name="demand_id"
                        rules={
                          Number(selectedItemType?.require_demand) === 1
                            ? [{ required: true, message: '当前事项类型需关联需求' }]
                            : []
                        }
                      >
                        <Select
                          allowClear
                          showSearch
                          options={quickDemandOptions}
                          placeholder="请选择需求池中的需求（可选）"
                          optionFilterProp="fullLabel"
                          onChange={(next) => {
                            if (!next) {
                              form.setFieldValue('phase_key', undefined)
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="需求任务"
                        name="phase_key"
                        rules={selectedDemandId ? [{ required: true, message: '请选择需求任务' }] : []}
                        extra={isQuickBatchPhaseMode ? '可多选；提交时会按预计整体用时平均拆分为多条事项' : undefined}
                      >
                        <Select
                          allowClear
                          showSearch
                          mode={isQuickBatchPhaseMode ? 'multiple' : undefined}
                          options={quickPhaseOptionsWithSelected}
                          placeholder={selectedDemandId ? '请选择需求任务' : '请先选择关联需求'}
                          optionFilterProp="label"
                          disabled={!selectedDemandId}
                          maxTagCount="responsive"
                        />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="预计开始日期"
                        name="expected_start_date"
                        rules={[{ required: true, message: '请选择预计开始日期' }]}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="预计完成日期"
                        name="expected_completion_date"
                        rules={[{ required: true, message: '请选择预计完成日期' }]}
                      >
                        <Input type="date" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item
                        label="预计整体用时(h)"
                        name="personal_estimate_hours"
                        rules={[{ required: true, message: '请输入预计整体用时' }]}
                      >
                        <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    label="工作描述"
                    name="description"
                    rules={[{ required: true, message: '请填写工作描述' }]}
                  >
                    <Input.TextArea
                      rows={3}
                      maxLength={2000}
                      placeholder="建议写清楚：做了什么、产出了什么、是否有风险"
                    />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={submitting}
                    disabled={!canCreate}
                  >
                    提交记录
                  </Button>
                </Form>
              </Card>
            </Col>

            <Col xs={24} lg={14} style={{ display: 'flex' }}>
              <Card
                title="我的进行中事项"
                variant="borderless"
                style={{ width: '100%' }}
                extra={
                  <Button
                    type="default"
                    icon={<ArrowRightOutlined />}
                    onClick={openHistoryPage}
                    style={{
                      borderColor: '#c7d7fe',
                      color: '#1d4ed8',
                      background: '#eff6ff',
                      fontWeight: 600,
                    }}
                  >
                    查看历史记录
                  </Button>
                }
                styles={{
                  body: {
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    paddingTop: 10,
                  },
                }}
              >
                {activeItems.length === 0 ? (
                  <Empty description="暂无未完成事项" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                    {/* 提醒区域 */}
                    {(reminderStats.overdueCount > 0 || reminderStats.dueSoonCount > 0 || reminderStats.missingActualCount > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {reminderStats.overdueCount > 0 && (
                          <Alert
                            message={`有 ${reminderStats.overdueCount} 项工作已超期`}
                            type="error"
                            showIcon
                            closable
                          />
                        )}
                        {reminderStats.dueSoonCount > 0 && (
                          <Alert
                            message={`有 ${reminderStats.dueSoonCount} 项工作即将到期`}
                            type="warning"
                            showIcon
                            closable
                          />
                        )}
                        {reminderStats.missingActualCount > 0 && (
                          <Alert
                            message={`有 ${reminderStats.missingActualCount} 项工作今日有计划但未记录实际用时`}
                            type="info"
                            showIcon
                            closable
                          />
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSummaryQuickFilterClick(activeSummaryQuickFilterValues.todo)}
                        style={{
                          ...SURFACE_CARD_STYLE,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.todo
                              ? '1px solid #91caff'
                              : SURFACE_CARD_STYLE.border,
                          background:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.todo ? '#e6f4ff' : SURFACE_CARD_STYLE.background,
                        }}
                      >
                        <div style={SURFACE_LABEL_STYLE}>待开始</div>
                        <div style={SURFACE_VALUE_STYLE}>{activeItemSummary.todo}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSummaryQuickFilterClick(activeSummaryQuickFilterValues.inProgress)}
                        style={{
                          ...SURFACE_CARD_STYLE,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.inProgress
                              ? '1px solid #91caff'
                              : SURFACE_CARD_STYLE.border,
                          background:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.inProgress
                              ? '#e6f4ff'
                              : SURFACE_CARD_STYLE.background,
                        }}
                      >
                        <div style={SURFACE_LABEL_STYLE}>进行中</div>
                        <div style={SURFACE_VALUE_STYLE}>{activeItemSummary.inProgress}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSummaryQuickFilterClick(activeSummaryQuickFilterValues.overdue)}
                        style={{
                          ...WARNING_SURFACE_CARD_STYLE,
                          cursor: 'pointer',
                          textAlign: 'left',
                          border:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.overdue
                              ? '1px solid #ff4d4f'
                              : WARNING_SURFACE_CARD_STYLE.border,
                          boxShadow:
                            activeItemStatusFilter === activeSummaryQuickFilterValues.overdue
                              ? '0 0 0 2px rgba(255, 77, 79, 0.15)'
                              : 'none',
                        }}
                      >
                        <div style={{ fontSize: 12, color: WARNING_TEXT_COLOR }}>已超期</div>
                        <div style={{ ...SURFACE_VALUE_STYLE, color: WARNING_TEXT_COLOR }}>{activeItemSummary.overdue}</div>
                      </button>
                      <div style={SURFACE_CARD_STYLE}>
                        <div style={SURFACE_LABEL_STYLE}>未设截止日</div>
                        <div style={SURFACE_VALUE_STYLE}>{activeItemSummary.noDeadline}</div>
                      </div>
                    </div>

                    <Row gutter={[8, 8]}>
                      <Col xs={24} sm={15}>
                        <Input
                          allowClear
                          aria-label="搜索进行中事项"
                          placeholder="搜索事项类型 / 需求ID / 需求任务 / 描述"
                          value={activeItemKeyword}
                          onChange={(e) => setActiveItemKeyword(e.target.value)}
                        />
                      </Col>
                      <Col xs={24} sm={9}>
                        <Select
                          style={{ width: '100%' }}
                          aria-label="按状态筛选进行中事项"
                          value={activeItemStatusFilter}
                          options={ACTIVE_ITEM_STATUS_FILTER_OPTIONS}
                          onChange={(next) => setActiveItemStatusFilter(next)}
                        />
                      </Col>
                    </Row>

                    <div
                      style={{
                        flex: '0 0 auto',
                        maxHeight: ACTIVE_ITEM_LIST_VIEW_HEIGHT,
                        minHeight: 0,
                        overflowY: 'auto',
                        paddingRight: 4,
                        overscrollBehavior: 'contain',
                      }}
                    >
                      {filteredActiveItems.length === 0 ? (
                        <Empty description="没有匹配的进行中事项" />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {filteredActiveItems.map((item) => {
                            const currentStatus = item.log_status || 'IN_PROGRESS'
                            const isStatusSubmitting = statusSubmittingId === item.id
                            const disableStatusActions = !canUpdate || isStatusSubmitting
                            const demandId = String(item?.demand_id || '').trim()
                            const followupNodeLabel = demandId ? String(workflowNodeByDemandId.get(demandId) || '').trim() : ''
                            const logPhaseLabel = String(item?.phase_name || item?.phase_key || '').trim()
                            const activePhaseLabel = logPhaseLabel || (isDemandFollowupItem(item) ? followupNodeLabel : '')
                            const statusPanelStyle = getActiveCardStatusPanelStyle(currentStatus)
                            const demandFullName = String(item.demand_name || item.demand_id || '').trim()
                            const demandTagLabel = item?.demand_id ? `需求#${item.demand_id}` : ''
                            const cardTopic = activePhaseLabel || item.item_type_name || '事项'
                            const isOverdue = isOverdueDate(item.expected_completion_date)
                            const remainingWorkload = calcRemainingWorkload(item)

                            return (
                              <div
                                key={item.id}
                                style={getActiveCardContainerStyle(item, currentStatus)}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                    marginBottom: 12,
                                  }}
                                >
                                  <Space wrap size={[6, 6]}>
                                    <Tag color="blue">#{item.id}</Tag>
                                    {(() => {
                                      const meta = getDisplayStatusMeta(item)
                                      return <Tag color={meta.color}>{meta.label}</Tag>
                                    })()}
                                    <Tag color="geekblue">{item.item_type_name || '事项'}</Tag>
                                    {item.demand_id ? (
                                      <Tooltip title={demandFullName || demandTagLabel}>
                                        <Tag color="gold">
                                          <DemandTagButton demandId={item.demand_id} label={demandTagLabel} />
                                        </Tag>
                                      </Tooltip>
                                    ) : null}
                                  </Space>
                                  <Space size={6} wrap>
                                    <Tag color={isOverdue ? 'error' : 'default'}>
                                      截止：{formatDateOnly(item.expected_completion_date)}
                                    </Tag>
                                    <Tag color={remainingWorkload > 0 ? 'processing' : 'success'}>
                                      {`剩余 ${remainingWorkload.toFixed(1)}h`}
                                    </Tag>
                                  </Space>
                                </div>

                                <div
                                  style={{
                                    marginBottom: 12,
                                    borderRadius: 10,
                                    border: `1px solid ${isOverdue ? WARNING_BORDER_COLOR : '#dbeafe'}`,
                                    background: isOverdue
                                      ? 'linear-gradient(180deg, #fff5f5 0%, #fff1f0 100%)'
                                      : 'linear-gradient(180deg, #f8fbff 0%, #f4f8ff 100%)',
                                    padding: '10px 12px 12px',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 12,
                                      marginBottom: 6,
                                      color: isOverdue ? '#b42318' : '#3662d8',
                                      fontWeight: 700,
                                      letterSpacing: '0.03em',
                                    }}
                                  >
                                    {cardTopic}
                                  </div>
                                  <div
                                    style={{
                                      color: '#0f172a',
                                      fontSize: 16,
                                      lineHeight: 1.7,
                                      fontWeight: 700,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {item.description || '（暂无工作描述）'}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <Space wrap>
                                    <Button
                                      type="default"
                                      onClick={() => openDetailModal(item)}
                                      style={{ minHeight: 34 }}
                                    >
                                      查看日明细
                                    </Button>
                                    <Button
                                      type="primary"
                                      onClick={() => openDailyEntryModal(item)}
                                      disabled={!canUpdate}
                                      style={{ minHeight: 34 }}
                                    >
                                      填报今日投入
                                    </Button>
                                  </Space>
                                  <Space wrap size={6} align="center">
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 8px',
                                        borderRadius: 8,
                                        border: `1px solid ${statusPanelStyle.borderColor}`,
                                        background: statusPanelStyle.background,
                                      }}
                                    >
                                      <Text style={{ fontSize: 12, fontWeight: 600, color: '#1d39c4' }}>
                                        状态调整
                                      </Text>
                                      {ITEM_STATUS_OPTIONS.map((option) => {
                                        const isCurrent = option.value === currentStatus
                                        const buttonStyle = getStatusActionButtonStyle(option.value, isCurrent)

                                        if (option.value === 'DONE' && currentStatus !== 'DONE') {
                                          return (
                                            <Popconfirm
                                              key={option.value}
                                              title="确认标记为已完成？"
                                              description="后续如有需要，仍可再改回待开始或进行中。"
                                              okText="确认"
                                              cancelText="取消"
                                              onConfirm={() => handleUpdateItemStatus(item, option.value)}
                                              disabled={disableStatusActions}
                                            >
                                              <Button
                                                size="small"
                                                type={isCurrent ? 'primary' : 'default'}
                                                disabled={disableStatusActions || isCurrent}
                                                style={{ ...buttonStyle, transition: ACTION_TRANSITION }}
                                              >
                                                {option.label}
                                              </Button>
                                            </Popconfirm>
                                          )
                                        }

                                        return (
                                          <Button
                                            key={option.value}
                                            size="small"
                                            type={isCurrent ? 'primary' : 'default'}
                                            disabled={disableStatusActions || isCurrent}
                                            onClick={() => handleUpdateItemStatus(item, option.value)}
                                            style={{ ...buttonStyle, transition: ACTION_TRANSITION }}
                                          >
                                            {option.label}
                                          </Button>
                                        )
                                      })}
                                      {isStatusSubmitting ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          更新中...
                                        </Text>
                                      ) : null}
                                    </div>
                                  </Space>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      {isHistoryPage ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <Card variant="borderless" style={HISTORY_HEADER_CARD_STYLE}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                        历史工作记录
                      </div>
                      <Text style={{ color: '#475467', fontSize: 14 }}>
                        集中查看、筛选、维护个人历史记录，也可以直接在这里生成周报。
                      </Text>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Tag color="blue">当前筛选：{currentHistoryFilterLabel}</Tag>
                      <Tag color="purple">时间：{currentHistoryDatePresetLabel}</Tag>
                      <Tag>{currentHistoryDateRangeText}</Tag>
                      <Tag color="cyan">共 {total} 条</Tag>
                      <Tag color="geekblue">第 {page} 页</Tag>
                      <Tag>每页 {pageSize} 条</Tag>
                    </div>
                  </div>

                  <Space wrap>
                    <Button icon={<LeftOutlined />} onClick={backToWorkbench}>
                      返回个人工作台
                    </Button>
                    <Button type="primary" onClick={openWeeklyModal} loading={weeklyLoading && weeklyModalOpen}>
                      周报
                    </Button>
                  </Space>
                </div>
              </Card>
            </Col>

            <Col span={24}>
              <Card
                variant="borderless"
                style={{ borderRadius: 12, border: '1px solid #eef2f6' }}
                styles={{ body: { padding: 14 } }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <Space wrap size={10}>
                    <Text type="secondary">时间范围</Text>
                    <Select
                      style={{ width: 160, minWidth: 140 }}
                      aria-label="按时间范围筛选工作记录"
                      value={historyDatePreset}
                      options={HISTORY_DATE_PRESET_OPTIONS}
                      onChange={handleHistoryDatePresetChange}
                    />
                    <Input
                      type="date"
                      value={historyCustomStartDate}
                      onChange={(e) => handleHistoryCustomDateChange('start_date', e.target.value)}
                      style={{ width: 150 }}
                      aria-label="工作记录开始日期"
                      placeholder="开始日期"
                    />
                    <Input
                      type="date"
                      value={historyCustomEndDate}
                      onChange={(e) => handleHistoryCustomDateChange('end_date', e.target.value)}
                      style={{ width: 150 }}
                      aria-label="工作记录结束日期"
                      placeholder="结束日期"
                    />
                    <Text type="secondary">状态筛选</Text>
                    <Select
                      style={{ width: 180, minWidth: 140 }}
                      aria-label="按状态筛选工作记录"
                      value={logStatusFilter}
                      options={LOG_STATUS_FILTER_OPTIONS}
                      onChange={handleLogStatusFilterChange}
                    />
                  </Space>

                  <Space wrap size={10}>
                    <Text type="secondary">已自动保留上一次筛选和分页状态</Text>
                    {isHistoryDateRangeInvalid ? <Text type="danger">开始日期不能晚于结束日期</Text> : null}
                    <Button onClick={handleResetHistoryFilters}>清空筛选</Button>
                    <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loadingBase || loadingLogs}>
                      刷新
                    </Button>
                  </Space>
                </div>
              </Card>
            </Col>

            <Col span={24}>
              <Card variant="borderless">
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <Table
                    rowKey="id"
                    loading={loadingLogs}
                    columns={logColumns}
                    dataSource={logs}
                    size="middle"
                    scroll={{ x: 1280 }}
                    pagination={{
                      current: page,
                      pageSize,
                      total,
                      showSizeChanger: true,
                      showTotal: (t) => `共 ${t} 条`,
                    }}
                    onChange={(pagination) => {
                      setPage(pagination.current || 1)
                      setPageSize(pagination.pageSize || 10)
                    }}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      {isHistoryPage ? (
        <Modal
        title="个人周报（V1）"
        open={weeklyModalOpen}
        onCancel={closeWeeklyModal}
        width={1080}
        destroyOnHidden
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={handleCopyWeeklySummary}
            disabled={!weeklySummaryText}
          >
            复制周报文案
          </Button>,
          <Button key="close" type="primary" onClick={closeWeeklyModal}>
            关闭
          </Button>,
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <Text type="secondary">开始日期</Text>
            <Input
              type="date"
              value={weeklyRange.start_date}
              onChange={(e) => handleWeeklyRangeChange('start_date', e.target.value)}
            />
          </div>
          <div>
            <Text type="secondary">结束日期</Text>
            <Input
              type="date"
              value={weeklyRange.end_date}
              onChange={(e) => handleWeeklyRangeChange('end_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Button type="primary" loading={weeklyLoading} onClick={() => fetchWeeklyReport(weeklyRange)}>
              生成周报
            </Button>
            <Button onClick={handleWeeklySwitchToThisWeek} disabled={weeklyLoading}>
              本周周报
            </Button>
            <Button onClick={handleWeeklySwitchToLastWeek} disabled={weeklyLoading}>
              上周周报
            </Button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>事项总数</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.item_count, 0)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>待开始</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.todo_count, 0)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>进行中</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.in_progress_count, 0)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>已完成</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.done_count, 0)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>计划用时(h)</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.planned_hours, 0).toFixed(1)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>实际用时(h)</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{toNumber(weeklySummary.actual_hours, 0).toFixed(1)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>偏差(h)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: toNumber(weeklySummary.variance_hours, 0) > 0 ? '#d4380d' : '#389e0d' }}>
              {toNumber(weeklySummary.variance_hours, 0).toFixed(1)}
            </div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>偏差率</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatRateText(weeklySummary.variance_rate)}</div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #e4e7ec',
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
            background: '#fcfcfd',
          }}
        >
          <Text strong>周报文案预览</Text>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: SURFACE_TEXT_COLOR, lineHeight: 1.7 }}>
            {weeklySummaryText || '暂无可展示内容'}
          </div>
        </div>

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={10}>
            <Card size="small" title="每日投入分布">
              <Table
                rowKey="date"
                size="small"
                columns={weeklyDailyColumns}
                dataSource={weeklyDailyRows}
                loading={weeklyLoading}
                pagination={false}
                scroll={{ x: 520, y: 280 }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card size="small" title="投入 Top 事项">
              <Table
                rowKey="id"
                size="small"
                columns={weeklyTopColumns}
                dataSource={weeklyTopItems}
                loading={weeklyLoading}
                pagination={false}
                scroll={{ x: 900, y: 280 }}
              />
            </Card>
          </Col>
        </Row>
        </Modal>
      ) : null}

      <Modal
        title={detailLog ? `事项详情与日明细：#${detailLog.id}` : '事项详情与日明细'}
        open={detailModalOpen}
        onCancel={closeDetailModal}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>覆盖天数</div>
            <div style={SURFACE_VALUE_STYLE}>{detailSummary.days}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>累计计划(h)</div>
            <div style={SURFACE_VALUE_STYLE}>{toNumber(detailSummary.totalPlanned, 0).toFixed(1)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>累计实际(h)</div>
            <div style={SURFACE_VALUE_STYLE}>{toNumber(detailSummary.totalActual, 0).toFixed(1)}</div>
          </div>
          <div style={SURFACE_CARD_STYLE}>
            <div style={SURFACE_LABEL_STYLE}>投入记录数</div>
            <div style={SURFACE_VALUE_STYLE}>{detailSummary.totalEntries}</div>
          </div>
        </div>

        {detailLog ? (
          <div
            style={{
              border: '1px solid #eef2f6',
              borderRadius: 8,
              background: '#fcfcfd',
              padding: '8px 10px',
              marginBottom: 12,
              color: SURFACE_TEXT_COLOR,
              fontSize: 13,
            }}
          >
            <div>事项类型: {detailLog.item_type_name || '-'}</div>
            <div>
              需求:{' '}
              {detailLog.demand_id ? (
                <a
                  href={`/work-demands/${encodeURIComponent(String(detailLog.demand_id).trim())}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {detailLog.demand_name || detailLog.demand_id}
                </a>
              ) : (
                '无需求'
              )}
            </div>
            <div>需求任务: {detailLog.phase_name || detailLog.phase_key || '-'}</div>
            <div>
              明细范围: {toDateInputValue(detailLog.expected_start_date) || toDateInputValue(detailLog.log_date) || '-'}
              {' ~ '}
              {toDateInputValue(detailLog.expected_completion_date) || '至今'}
            </div>
            <div>描述: {detailLog.description || '-'}</div>
          </div>
        ) : null}

        {detailLoading ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: MUTED_TEXT_COLOR }}>正在加载日明细...</div>
        ) : detailTimeline.length === 0 ? (
          <Empty description="暂无日计划/日投入数据" />
        ) : (
          <Table
            rowKey="date"
            size="small"
            pagination={false}
            columns={detailColumns}
            dataSource={detailTimeline}
            scroll={{ x: 760 }}
          />
        )}
      </Modal>

      {isHistoryPage ? (
        <Modal
        title={editingLog ? `修改记录：#${editingLog.id}` : '修改记录'}
        open={actualModalOpen}
        onCancel={closeActualModal}
        onOk={handleUpdateActual}
        confirmLoading={actualSubmitting}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnHidden
      >
        <Form form={actualForm} layout="vertical" style={{ marginTop: 8 }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="事项类型"
                name="item_type_id"
                rules={[{ required: true, message: '请选择事项类型' }]}
              >
                <Select options={itemTypeOptions} placeholder="请选择事项类型" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="事项状态"
                name="log_status"
                rules={[{ required: true, message: '请选择事项状态' }]}
              >
                <Select options={ITEM_STATUS_OPTIONS} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="关联需求"
                name="demand_id"
                rules={
                  Number(selectedActualItemType?.require_demand) === 1
                    ? [{ required: true, message: '当前事项类型需关联需求' }]
                    : []
                }
              >
                <Select
                  allowClear
                  showSearch
                  options={demandOptions}
                  placeholder="请选择需求池中的需求（可选）"
                  optionFilterProp="label"
                  onChange={(next) => {
                    if (!next) {
                      actualForm.setFieldValue('phase_key', undefined)
                    }
                  }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="需求任务"
                name="phase_key"
                rules={selectedActualDemandId ? [{ required: true, message: '请选择需求任务' }] : []}
              >
                <Select
                  allowClear
                  showSearch
                  options={actualPhaseOptionsWithSelected}
                  placeholder={selectedActualDemandId ? '请选择需求任务' : '请先选择关联需求'}
                  optionFilterProp="label"
                  disabled={!selectedActualDemandId}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="预计开始日期"
                name="expected_start_date"
                rules={[{ required: true, message: '请选择预计开始日期' }]}
              >
                <Input type="date" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="预计完成日期"
                name="expected_completion_date"
                rules={[{ required: true, message: '请选择预计完成日期' }]}
              >
                <Input type="date" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="预计整体用时(h)"
                name="personal_estimate_hours"
                rules={[{ required: true, message: '请输入预计整体用时' }]}
              >
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="实际用时(h)"
                name="actual_hours"
                extra="默认 0.0；仅当状态为“已完成”且实际用时为 0.0 时，保存后会自动与预计整体用时一致"
              >
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="实际完成日期"
                name="log_completed_at"
                extra="状态为“已完成”时可设置；若不填，保存时默认使用今天"
              >
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="工作描述"
            name="description"
            rules={[{ required: true, message: '请填写工作描述' }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={2000}
              placeholder="建议写清楚：做了什么、产出了什么、是否有风险"
            />
          </Form.Item>
        </Form>
        </Modal>
      ) : null}

      <Modal
        title={operatingLog ? `填报今日投入：#${operatingLog.id}` : '填报今日投入'}
        open={dailyEntryModalOpen}
        onCancel={closeDailyEntryModal}
        onOk={handleCreateDailyEntry}
        confirmLoading={dailyEntrySubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={dailyEntryForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="投入日期"
            name="entry_date"
            rules={[{ required: true, message: '请选择投入日期' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            label="实际用时(h)"
            name="actual_hours"
            rules={[{ required: true, message: '请输入实际用时' }]}
            extra="同一事项在同一天重复填报时，以最后一次提交为准（不会累加）"
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="工作描述" name="description">
            <Input.TextArea rows={3} maxLength={2000} placeholder="可填写今天具体做了什么（选填）" />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  )
}

export default WorkLogs
