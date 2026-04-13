import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  RobotOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Empty, Modal, Progress, Row, Segmented, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { executeAgentApi, getAgentOptionsApi } from '../../api/agent'
import {
  getMorningStandupBoardApi,
  getMorningStandupWeeklyCompletedApi,
  getMorningStandupWeeklyProgressApi,
} from '../../api/work'
import { getAccessSnapshot, getCurrentUser } from '../../utils/access'
import { formatBeijingDate, formatBeijingDateTime } from '../../utils/datetime'
import { UNIFIED_WORK_STATUS, getUnifiedStatusMeta } from '../../utils/workStatus'
import './MorningStandupPage.css'

const { Paragraph, Text } = Typography
const EMPTY_ARRAY = []
const EMPTY_OBJECT = {}
const MORNING_STANDUP_AGENT_SCENE = 'MORNING_STANDUP_ANALYSIS'
const STANDUP_VIEW_MODE_STORAGE_KEYS = {
  inProgress: 'morning-standup-in-progress-view-mode',
  yesterdayDue: 'morning-standup-yesterday-due-view-mode',
}
const EMPTY_WEEKLY_PROGRESS = {
  tabs: [],
  default_tab_key: '',
  current_tab_key: '',
  view_scope: {
    mode: 'DEPARTMENT',
    department_id: null,
    department_name: '',
    department_ids: [],
  },
  range: {
    start_date: '',
    end_date: '',
    total_days: 0,
  },
  summary: {
    demand_count: 0,
    item_count: 0,
    active_item_count: 0,
    done_item_count: 0,
    risk_item_count: 0,
  },
  demand_list: [],
}
const EMPTY_WEEKLY_COMPLETED = {
  tabs: [],
  default_tab_key: '',
  current_tab_key: '',
  view_scope: {
    mode: 'DEPARTMENT',
    department_id: null,
    department_name: '',
    department_ids: [],
  },
  range: {
    start_date: '',
    end_date: '',
    total_days: 0,
  },
  summary: {
    member_count: 0,
    day_count: 0,
    done_item_count: 0,
  },
  member_tree: [],
}

async function copyTextWithFallback(text) {
  const normalizedText = String(text || '')
  if (!normalizedText) return false

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalizedText)
      return true
    } catch {
      // fallback for non-secure context or blocked clipboard permissions
    }
  }

  if (typeof document === 'undefined' || !document.body) return false

  const textarea = document.createElement('textarea')
  textarea.value = normalizedText
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function readStoredViewMode(storageKey, fallback = 'tree') {
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  try {
    const raw = String(window.localStorage.getItem(storageKey) || '').trim()
    if (raw === 'flat' || raw === 'tree') return raw
  } catch (error) {
    console.warn('read standup view mode failed', error)
  }
  return fallback
}

function writeStoredViewMode(storageKey, value) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(storageKey, value)
  } catch (error) {
    console.warn('write standup view mode failed', error)
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function parseDepartmentIdFromTabKey(tabKey) {
  const raw = String(tabKey || '').trim().toLowerCase()
  if (!raw.startsWith('dept-')) return null
  const num = Number(raw.slice(5))
  return Number.isInteger(num) && num > 0 ? num : null
}

function buildMorningScopeParams(tabKey = '') {
  const params = {}
  const normalizedTabKey = String(tabKey || '').trim()
  if (normalizedTabKey) {
    params.tab_key = normalizedTabKey
  }
  const departmentId = parseDepartmentIdFromTabKey(normalizedTabKey)
  if (departmentId) {
    params.department_id = departmentId
  }
  return params
}

function formatStandupRange(range = {}) {
  const startDate = String(range?.start_date || '').trim()
  const endDate = String(range?.end_date || '').trim()
  if (startDate && endDate) return `${formatBeijingDate(startDate)} - ${formatBeijingDate(endDate)}`
  if (startDate) return formatBeijingDate(startDate)
  if (endDate) return formatBeijingDate(endDate)
  return '-'
}

function joinDisplayNames(list = []) {
  const normalized = Array.isArray(list)
    ? list.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  return normalized.length > 0 ? normalized.join('、') : '-'
}

function formatScheduleSpan(startDate, endDate) {
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (start && end) return `${formatBeijingDate(start)} - ${formatBeijingDate(end)}`
  if (start) return `开始：${formatBeijingDate(start)}`
  if (end) return `截止：${formatBeijingDate(end)}`
  return '未排期'
}

function buildWeeklyProgressCopyText(data = {}, scopeLabel = '当前范围') {
  const summary = data?.summary || {}
  const demandList = Array.isArray(data?.demand_list) ? data.demand_list : []
  const lines = [
    `${scopeLabel}本周进展`,
    `统计范围：${formatStandupRange(data?.range)}`,
    `需求数：${toNumber(summary.demand_count, 0)}，进行中事项：${toNumber(summary.active_item_count, 0)}，本周完成：${toNumber(summary.done_item_count, 0)}，风险事项：${toNumber(summary.risk_item_count, 0)}`,
  ]

  if (demandList.length === 0) {
    lines.push('当前范围本周暂无需求进展。')
    return lines.join('\n')
  }

  demandList.forEach((demand, index) => {
    const latestItems = Array.isArray(demand?.latest_items) ? demand.latest_items.slice(0, 3) : []
    const phases = Array.isArray(demand?.phase_list) ? demand.phase_list.slice(0, 3) : []
    lines.push(
      '',
      `${index + 1}. ${demand.demand_name || demand.demand_id || '-'}`,
      `负责人：${joinDisplayNames(demand.owner_names)}`,
      `进行中 ${toNumber(demand.active_item_count, 0)} 项，本周完成 ${toNumber(demand.done_item_count, 0)} 项，风险 ${toNumber(demand.risk_item_count, 0)} 项`,
    )
    if (phases.length > 0) {
      lines.push(`节点排期：${phases.map((phase) => `${phase.phase_name || '其他事项'}（${formatScheduleSpan(phase.start_date, phase.end_date)}）`).join('；')}`)
    }
    if (latestItems.length > 0) {
      lines.push(`最新进展：${latestItems.map((item) => `${item.username || '-'}-${item.phase_name || '其他事项'}-${item.description || item.item_type_name || `事项#${item.id}`}`).join('；')}`)
    }
  })

  return lines.join('\n')
}

function buildWeeklyCompletedCopyText(data = {}, scopeLabel = '当前范围') {
  const summary = data?.summary || {}
  const memberTree = Array.isArray(data?.member_tree) ? data.member_tree : []
  const lines = [
    `${scopeLabel}本周已完成事项汇总`,
    `统计范围：${formatStandupRange(data?.range)}`,
    `成员数：${toNumber(summary.member_count, 0)}，完成日期数：${toNumber(summary.day_count, 0)}，已完成事项数：${toNumber(summary.done_item_count, 0)}`,
  ]

  if (memberTree.length === 0) {
    lines.push('当前范围本周暂无已完成事项。')
    return lines.join('\n')
  }

  memberTree.forEach((member, index) => {
    const days = Array.isArray(member?.children) ? member.children : []
    lines.push('', `${index + 1}. ${member.username || '-'}（${toNumber(member.done_count, 0)} 项）`)
    days.forEach((day) => {
      const items = Array.isArray(day?.children) ? day.children : []
      const itemText = items
        .map((item) => `${item.phase_name || '其他事项'}-${item.description || item.item_type_name || `事项#${item.id}`}`)
        .join('；')
      lines.push(`- ${formatBeijingDate(day.completed_date)}：${itemText || '无事项明细'}`)
    })
  })

  return lines.join('\n')
}

function getStatusTagColor(status) {
  if (status === 'TODO') return 'default'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'DONE') return 'success'
  return 'default'
}

function getStatusLabel(status) {
  if (status === 'TODO') return '待开始'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'DONE') return '已完成'
  return status || '-'
}

function truncateText(value, maxLength = 8) {
  const text = String(value || '').trim()
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return `${chars.slice(0, maxLength).join('')}...`
}

function openDemandDetailInNewTab(demandId) {
  const normalizedDemandId = String(demandId || '').trim()
  if (!normalizedDemandId) return
  window.open(`/work-demands/${encodeURIComponent(normalizedDemandId)}`, '_blank', 'noopener,noreferrer')
}

function renderDemandNameWithLimit(value, maxLength = 30, demandId = '') {
  const normalizedDemandId = String(demandId || '').trim()
  const fullText = String(value || normalizedDemandId || '').trim()
  if (!fullText) return '-'
  const shortText = truncateText(fullText, maxLength)
  const textNode = <span className="morning-nowrap-text">{shortText}</span>

  if (!normalizedDemandId) {
    if (shortText === fullText) {
      return <span className="morning-nowrap-text">{fullText}</span>
    }
    return (
      <Tooltip title={fullText}>
        <span className="morning-nowrap-text">{shortText}</span>
      </Tooltip>
    )
  }

  const linkNode = (
    <Button
      type="link"
      size="small"
      style={{ paddingInline: 0, height: 'auto' }}
      onClick={() => openDemandDetailInNewTab(normalizedDemandId)}
    >
      {textNode}
    </Button>
  )

  if (shortText === fullText) {
    return linkNode
  }
  return (
    <Tooltip title={fullText}>
      {linkNode}
    </Tooltip>
  )
}

function getUnifiedStatusTag(record) {
  const checkResult = String(record?.check_result || '').trim().toUpperCase()
  if (checkResult === 'PREV_WORKDAY_DONE') {
    return <Tag color="success">昨日完成</Tag>
  }
  const meta = getUnifiedStatusMeta(record)
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function getGroupYesterdayCheckResult(stats) {
  if (toNumber(stats?.not_done_count, 0) > 0) return 'NOT_DONE'
  if (toNumber(stats?.late_done_count, 0) > 0) return 'LATE_DONE'
  if (toNumber(stats?.on_time_count, 0) > 0) return 'ON_TIME'
  if (toNumber(stats?.prev_workday_done_count, 0) > 0) return 'PREV_WORKDAY_DONE'
  if (toNumber(stats?.pending_count, 0) > 0) return 'PENDING'
  return 'PENDING'
}

function getPhaseDisplayName(record) {
  const text = String(record?.phase_name || record?.phase_key || '').trim()
  if (!text || text === '-' || text === '未分阶段') return '其他事项'
  return text
}

function sortPhaseGroups(entries = []) {
  return [...entries].sort((a, b) => {
    const aLabel = String(a?.[0] || '').trim()
    const bLabel = String(b?.[0] || '').trim()
    const aIsOther = aLabel === '其他事项'
    const bIsOther = bLabel === '其他事项'
    if (aIsOther && !bIsOther) return 1
    if (!aIsOther && bIsOther) return -1
    return 0
  })
}

function sortInProgressChildItems(items = []) {
  const rankMap = {
    [UNIFIED_WORK_STATUS.RISK]: 0,
    [UNIFIED_WORK_STATUS.OVERDUE]: 1,
    [UNIFIED_WORK_STATUS.DUE_TODAY]: 2,
    [UNIFIED_WORK_STATUS.NORMAL]: 3,
    [UNIFIED_WORK_STATUS.ON_TIME_DONE]: 4,
    [UNIFIED_WORK_STATUS.LATE_DONE]: 5,
  }

  const getBucket = (item) => {
    const code = getUnifiedStatusMeta(item).code
    return rankMap[code] ?? 9
  }

  return [...items].sort((a, b) => {
    const bucketDiff = getBucket(a) - getBucket(b)
    if (bucketDiff !== 0) return bucketDiff

    const progressA = Number.isFinite(Number(a?.progress_percent)) ? Number(a.progress_percent) : -1
    const progressB = Number.isFinite(Number(b?.progress_percent)) ? Number(b.progress_percent) : -1
    if (progressA !== progressB) return progressB - progressA

    const dueA = String(a?.expected_completion_date || '9999-12-31')
    const dueB = String(b?.expected_completion_date || '9999-12-31')
    if (dueA !== dueB) return dueA.localeCompare(dueB)

    return Number(b?.id || 0) - Number(a?.id || 0)
  })
}

function sortYesterdayDueChildItems(items = []) {
  const statusRank = {
    [UNIFIED_WORK_STATUS.OVERDUE]: 0,
    [UNIFIED_WORK_STATUS.LATE_DONE]: 1,
    [UNIFIED_WORK_STATUS.ON_TIME_DONE]: 2,
    [UNIFIED_WORK_STATUS.NORMAL]: 3,
  }
  const priorityRank = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  }

  return [...items].sort((a, b) => {
    const checkResultA = String(a?.check_result || '').trim().toUpperCase()
    const checkResultB = String(b?.check_result || '').trim().toUpperCase()
    const checkResultRank = {
      NOT_DONE: 0,
      LATE_DONE: 1,
      ON_TIME: 2,
      PREV_WORKDAY_DONE: 3,
    }
    const checkResultDiff = (checkResultRank[checkResultA] ?? 9) - (checkResultRank[checkResultB] ?? 9)
    if (checkResultDiff !== 0) return checkResultDiff

    const codeA = getUnifiedStatusMeta(a).code
    const codeB = getUnifiedStatusMeta(b).code
    const checkDiff = (statusRank[codeA] ?? 9) - (statusRank[codeB] ?? 9)
    if (checkDiff !== 0) return checkDiff

    const demandPriorityA = String(a?.demand_priority || '').trim().toUpperCase()
    const demandPriorityB = String(b?.demand_priority || '').trim().toUpperCase()
    const priorityDiff = (priorityRank[demandPriorityA] ?? 99) - (priorityRank[demandPriorityB] ?? 99)
    if (priorityDiff !== 0) return priorityDiff

    return Number(b?.id || 0) - Number(a?.id || 0)
  })
}

function getStartHintTag(daysToStart) {
  const days = Number(daysToStart)
  if (!Number.isFinite(days)) return <Text type="secondary">-</Text>
  if (days < 0) return <Tag color="warning">{`开始已滞后 ${Math.abs(days)} 天`}</Tag>
  if (days === 0) return <Tag color="processing">今日启动</Tag>
  return <Tag color="blue">{`${days} 天后开始`}</Tag>
}

function clampPercent(value) {
  const num = toNumber(value, 0)
  return Math.max(0, Math.min(100, num))
}

function getMemberItemClassName(overdue, dueToday) {
  if (overdue) return 'morning-member-item morning-member-item--overdue'
  if (dueToday) return 'morning-member-item morning-member-item--due'
  return 'morning-member-item'
}

function getTodayHoursDetailRows(items = [], type = 'planned') {
  const field = type === 'actual' ? 'today_actual_hours' : 'today_planned_hours'
  return (Array.isArray(items) ? items : [])
    .filter((item) => toNumber(item?.[field], 0) > 0)
    .map((item) => ({
      ...item,
      hours: toNumber(item?.[field], 0),
    }))
    .sort((a, b) => b.hours - a.hours || Number(b.id || 0) - Number(a.id || 0))
}

function MorningStandupBoard() {
  const currentUser = useMemo(() => getCurrentUser(), [])
  const access = useMemo(() => getAccessSnapshot(), [])
  const canUseAiStandupAnalysis = Boolean(access?.is_super_admin)
  const [loading, setLoading] = useState(false)
  const [activeTabKey, setActiveTabKey] = useState('')
  const [activeAlignmentTab, setActiveAlignmentTab] = useState('in_progress')
  const [inProgressViewMode, setInProgressViewMode] = useState(() =>
    readStoredViewMode(STANDUP_VIEW_MODE_STORAGE_KEYS.inProgress, 'tree'),
  )
  const [yesterdayDueViewMode, setYesterdayDueViewMode] = useState(() =>
    readStoredViewMode(STANDUP_VIEW_MODE_STORAGE_KEYS.yesterdayDue, 'tree'),
  )
  const [unscheduledModalOpen, setUnscheduledModalOpen] = useState(false)
  const [unfilledModalOpen, setUnfilledModalOpen] = useState(false)
  const [hoursDetailModal, setHoursDetailModal] = useState({ open: false, type: 'planned' })
  const [weeklyProgressModalOpen, setWeeklyProgressModalOpen] = useState(false)
  const [weeklyProgressLoading, setWeeklyProgressLoading] = useState(false)
  const [weeklyProgressScopeKey, setWeeklyProgressScopeKey] = useState('')
  const [weeklyProgressData, setWeeklyProgressData] = useState(EMPTY_WEEKLY_PROGRESS)
  const [weeklyCompletedModalOpen, setWeeklyCompletedModalOpen] = useState(false)
  const [weeklyCompletedLoading, setWeeklyCompletedLoading] = useState(false)
  const [weeklyCompletedScopeKey, setWeeklyCompletedScopeKey] = useState('')
  const [weeklyCompletedData, setWeeklyCompletedData] = useState(EMPTY_WEEKLY_COMPLETED)
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false)
  const [agentOptions, setAgentOptions] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [analysisExecuting, setAnalysisExecuting] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [data, setData] = useState({
    tabs: [],
    default_tab_key: '',
    current_tab_key: '',
    view_scope: {
      mode: 'DEPARTMENT',
      department_id: null,
      department_name: '',
      department_ids: [],
    },
    summary: {
      team_size: 0,
      scheduled_users_today: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      unscheduled_users_today: 0,
      total_planned_hours_today: 0,
      total_actual_hours_today: 0,
      active_item_count: 0,
      overdue_item_count: 0,
      due_today_item_count: 0,
    },
    focus_summary: {
      overdue_count: 0,
      due_today_count: 0,
      active_count: 0,
      unfilled_count: 0,
      yesterday_due_total: 0,
      yesterday_due_not_done_count: 0,
      yesterday_due_late_done_count: 0,
      yesterday_due_completed_count: 0,
      in_progress_count: 0,
      done_today_count: 0,
      todo_pending_count: 0,
    },
    focus_items: [],
    focus_yesterday_due_items: [],
    focus_in_progress_items: [],
    focus_done_today_items: [],
    focus_todo_items: [],
    today_planned_detail_items: [],
    today_actual_detail_items: [],
    members: [],
    no_fill_members: [],
  })

  const loadBoard = useCallback(async (tabKey = '', options = {}) => {
    setLoading(true)
    try {
      const normalizedTabKey = String(tabKey || '').trim()
      const params = buildMorningScopeParams(normalizedTabKey)

      const result = await getMorningStandupBoardApi(params, {
        force: options?.force === true,
      })
      if (!result?.success) {
        message.error(result?.message || '获取晨会看板失败')
        return
      }

      const payload = result.data || {}
      setData(payload)
      setActiveAlignmentTab('in_progress')
      const nextTabKey = payload.current_tab_key || payload.default_tab_key || normalizedTabKey || 'all'
      setActiveTabKey(nextTabKey)
    } catch (error) {
      message.error(error?.message || '获取晨会看板失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const loadAgentOptions = useCallback(async () => {
    if (!canUseAiStandupAnalysis) {
      setAgentOptions([])
      setSelectedAgentId(null)
      setAnalysisResult(null)
      return
    }
    setAgentOptionsLoading(true)
    try {
      const result = await getAgentOptionsApi(MORNING_STANDUP_AGENT_SCENE)
      if (!result?.success) {
        message.error(result?.message || '获取晨会分析 Agent 失败')
        return
      }
      const options = Array.isArray(result?.data?.options) ? result.data.options : []
      setAgentOptions(options)
      setSelectedAgentId((prev) => {
        if (options.some((item) => Number(item?.id) === Number(prev))) return prev
        const firstId = Number(options?.[0]?.id || 0)
        return firstId > 0 ? firstId : null
      })
    } catch (error) {
      message.error(error?.message || '获取晨会分析 Agent 失败')
    } finally {
      setAgentOptionsLoading(false)
    }
  }, [canUseAiStandupAnalysis])

  useEffect(() => {
    loadAgentOptions()
  }, [loadAgentOptions])

  useEffect(() => {
    writeStoredViewMode(STANDUP_VIEW_MODE_STORAGE_KEYS.inProgress, inProgressViewMode)
  }, [inProgressViewMode])

  useEffect(() => {
    writeStoredViewMode(STANDUP_VIEW_MODE_STORAGE_KEYS.yesterdayDue, yesterdayDueViewMode)
  }, [yesterdayDueViewMode])

  const tabs = useMemo(() => (Array.isArray(data.tabs) ? data.tabs : EMPTY_ARRAY), [data.tabs])
  const members = useMemo(() => (Array.isArray(data.members) ? data.members : EMPTY_ARRAY), [data.members])
  const noFillMembers = useMemo(
    () => (Array.isArray(data.no_fill_members) ? data.no_fill_members : EMPTY_ARRAY),
    [data.no_fill_members],
  )
  const unscheduledMembers = useMemo(
    () => members.filter((item) => !item?.today_scheduled),
    [members],
  )
  const memberByUserId = useMemo(
    () =>
      new Map(
        members
          .map((item) => [Number(item?.user_id), item])
          .filter(([userId]) => Number.isInteger(userId) && userId > 0),
      ),
    [members],
  )
  const noFillMembersWithDepartment = useMemo(
    () =>
      noFillMembers.map((member) => {
        const userId = Number(member?.id || member?.user_id) || 0
        const memberFromBoard = memberByUserId.get(userId)
        const username = String(member?.username || memberFromBoard?.username || '').trim() || `用户${userId || ''}`
        const departmentName = String(memberFromBoard?.department_name || '').trim() || '未分配部门'
        return {
          user_id: userId,
          username,
          department_name: departmentName,
        }
      }),
    [memberByUserId, noFillMembers],
  )
  const unscheduledByDepartmentRows = useMemo(() => {
    const departmentMap = new Map()

    unscheduledMembers.forEach((member) => {
      const departmentName = String(member?.department_name || '').trim() || '未分配部门'
      const memberName = String(member?.username || '').trim() || `用户${Number(member?.user_id) || ''}`
      const userId = Number(member?.user_id) || 0

      if (!departmentMap.has(departmentName)) {
        departmentMap.set(departmentName, [])
      }
      departmentMap.get(departmentName).push({
        user_id: userId,
        username: memberName,
      })
    })

    return Array.from(departmentMap.entries())
      .map(([department_name, member_list]) => ({
        key: department_name,
        department_name,
        member_list: member_list.sort((a, b) =>
          String(a.username || '').localeCompare(String(b.username || ''), 'zh-Hans-CN'),
        ),
      }))
      .sort((a, b) => String(a.department_name || '').localeCompare(String(b.department_name || ''), 'zh-Hans-CN'))
  }, [unscheduledMembers])
  const noFillByDepartmentRows = useMemo(() => {
    const departmentMap = new Map()

    noFillMembersWithDepartment.forEach((member) => {
      const departmentName = String(member?.department_name || '').trim() || '未分配部门'
      const memberName = String(member?.username || '').trim() || `用户${Number(member?.user_id) || ''}`
      const userId = Number(member?.user_id) || 0

      if (!departmentMap.has(departmentName)) {
        departmentMap.set(departmentName, [])
      }
      departmentMap.get(departmentName).push({
        user_id: userId,
        username: memberName,
      })
    })

    return Array.from(departmentMap.entries())
      .map(([department_name, member_list]) => ({
        key: department_name,
        department_name,
        member_list: member_list.sort((a, b) =>
          String(a.username || '').localeCompare(String(b.username || ''), 'zh-Hans-CN'),
        ),
      }))
      .sort((a, b) => String(a.department_name || '').localeCompare(String(b.department_name || ''), 'zh-Hans-CN'))
  }, [noFillMembersWithDepartment])
  const departmentMemberColumns = useMemo(
    () => [
      {
        title: '部门',
        dataIndex: 'department_name',
        key: 'department_name',
        width: 220,
      },
      {
        title: '人员名单',
        dataIndex: 'member_list',
        key: 'member_list',
        render: (value) => {
          const list = Array.isArray(value) ? value : []
          if (list.length === 0) return '-'
          return (
            <Space wrap size={[8, 8]}>
              {list.map((member) => (
                <Tag key={member.user_id || member.username} color="blue">
                  {member.username}
                </Tag>
              ))}
            </Space>
          )
        },
      },
    ],
    [],
  )
  const summary = useMemo(() => (data.summary && typeof data.summary === 'object' ? data.summary : EMPTY_OBJECT), [data.summary])
  const focusSummary = useMemo(
    () => (data.focus_summary && typeof data.focus_summary === 'object' ? data.focus_summary : EMPTY_OBJECT),
    [data.focus_summary],
  )
  const focusYesterdayDueItems = useMemo(
    () => (Array.isArray(data.focus_yesterday_due_items) ? data.focus_yesterday_due_items : EMPTY_ARRAY),
    [data.focus_yesterday_due_items],
  )
  const focusInProgressItems = useMemo(
    () => (Array.isArray(data.focus_in_progress_items) ? data.focus_in_progress_items : EMPTY_ARRAY),
    [data.focus_in_progress_items],
  )
  const focusDoneTodayItems = useMemo(
    () => (Array.isArray(data.focus_done_today_items) ? data.focus_done_today_items : EMPTY_ARRAY),
    [data.focus_done_today_items],
  )
  const todayPlannedDetailItems = useMemo(
    () => getTodayHoursDetailRows(data.today_planned_detail_items, 'planned'),
    [data.today_planned_detail_items],
  )
  const todayActualDetailItems = useMemo(
    () => getTodayHoursDetailRows(data.today_actual_detail_items, 'actual'),
    [data.today_actual_detail_items],
  )
  const focusTodoItems = useMemo(
    () => (Array.isArray(data.focus_todo_items) ? data.focus_todo_items : EMPTY_ARRAY),
    [data.focus_todo_items],
  )
  const teamPlannedCapacityHours = useMemo(() => toNumber(summary.team_size, 0) * 8.5, [summary.team_size])

  const sortedMembers = useMemo(() => {
    const currentUserId = Number(currentUser?.id)
    if (!Number.isInteger(currentUserId) || currentUserId <= 0) return members

    const index = members.findIndex((item) => Number(item?.user_id) === currentUserId)
    if (index <= 0) return members

    const copy = [...members]
    const [me] = copy.splice(index, 1)
    copy.unshift(me)
    return copy
  }, [members, currentUser?.id])

  const inProgressColumns = useMemo(
    () => [
      {
        title: '级别',
        dataIndex: 'focus_level',
        key: 'focus_level',
        width: 200,
        render: (value, record) => {
          if (record?.row_type === 'phase_group') {
            return <Text strong>{getPhaseDisplayName(record)}</Text>
          }
          return getUnifiedStatusTag(record)
        },
      },
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 108,
        ellipsis: true,
      },
      {
        title: '需求任务',
        dataIndex: 'phase_name',
        key: 'phase_name',
        width: 120,
        render: (_, record) =>
          record?.row_type === 'phase_group' ? (
            <Text strong>{getPhaseDisplayName(record)}</Text>
          ) : (
            getPhaseDisplayName(record)
          ),
      },
      {
        title: '需求名称',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 280,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            toNumber(record?.late_done_count, 0) > 0 || toNumber(record?.on_time_done_count, 0) > 0 ? (
              <Space size={6} wrap>
                <Tag color="volcano">{`逾期完成 ${toNumber(record?.late_done_count, 0)}`}</Tag>
                <Tag color="success">{`按期完成 ${toNumber(record?.on_time_done_count, 0)}`}</Tag>
                <Tag>{`其他 ${toNumber(record?.normal_count, 0)}`}</Tag>
              </Space>
            ) : (
              <Space size={6} wrap>
                <Tag color="warning">{`风险 ${toNumber(record?.risk_count, 0)}`}</Tag>
                <Tag color="error">{`逾期 ${toNumber(record?.overdue_count, 0)}`}</Tag>
                <Tag color="success">{`正常 ${toNumber(record?.normal_count, 0)}`}</Tag>
              </Space>
            )
          ) : (
            <Space size={4} wrap={false}>
              {record?.demand_priority ? <Tag color="volcano">{record.demand_priority}</Tag> : null}
              <span>{renderDemandNameWithLimit(value, 30, record?.demand_id)}</span>
            </Space>
          ),
      },
      {
        title: '预计开始',
        dataIndex: 'expected_start_date',
        key: 'expected_start_date',
        width: 112,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '预计完成',
        dataIndex: 'expected_completion_date',
        key: 'expected_completion_date',
        width: 112,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '进展',
        key: 'progress',
        width: 170,
        render: (_, record) => {
          const showProgress = Boolean(record?.progress_show)
          if (!showProgress) return <Text type="secondary">-</Text>

          const progressPercent = clampPercent(record?.progress_percent)
          const expectedPercent = clampPercent(record?.expected_progress_percent)
          const risky = Boolean(record?.progress_risk)

          return (
            <div>
              <div className="morning-progress-head">
                <Text strong>{`${progressPercent.toFixed(0)}%`}</Text>
                {risky ? <Tag color="warning">风险</Tag> : null}
              </div>
              <Progress
                percent={progressPercent}
                size="small"
                showInfo={false}
                strokeColor={risky ? '#faad14' : '#1677ff'}
              />
              <Text type="secondary" className="morning-progress-hint">
                {`应达 ${expectedPercent.toFixed(0)}%`}
              </Text>
            </div>
          )
        },
      },
      {
        title: '个人预估(h)',
        dataIndex: 'personal_estimate_hours',
        key: 'personal_estimate_hours',
        width: 110,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            <Text type="secondary">-</Text>
          ) : (
            `${toNumber(value, 0).toFixed(1)}h`
          ),
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 96,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            <Text type="secondary">-</Text>
          ) : (
            <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>
          ),
      },
      {
        title: '事项类型',
        dataIndex: 'item_type_name',
        key: 'item_type_name',
        width: 104,
        ellipsis: true,
        render: (value, record) => (record?.row_type === 'phase_group' ? <Text type="secondary">-</Text> : value || '-'),
      },
      {
        title: '工作描述',
        dataIndex: 'description',
        key: 'description',
        render: (value) => {
          const fullText = String(value || '').trim()
          if (!fullText) return '-'
          return <span className="morning-prewrap-text">{fullText}</span>
        },
      },
    ],
    [],
  )

  const doneTodayColumns = useMemo(() => {
    const actualHoursColumn = {
      title: '实际用时',
      dataIndex: 'cumulative_actual_hours',
      key: 'cumulative_actual_hours',
      width: 110,
      render: (value, record) =>
        record?.row_type === 'phase_group' ? (
          <Text type="secondary">-</Text>
        ) : (
          `${toNumber(value, 0).toFixed(1)}h`
        ),
    }

    const statusIndex = inProgressColumns.findIndex((column) => column?.key === 'log_status')
    if (statusIndex < 0) {
      return [...inProgressColumns, actualHoursColumn]
    }

    const nextColumns = [...inProgressColumns]
    nextColumns.splice(statusIndex, 0, actualHoursColumn)
    return nextColumns
  }, [inProgressColumns])

  const inProgressDataSource = useMemo(
    () =>
      focusInProgressItems.map((item) => ({
        ...item,
        row_type: 'item',
        key: `${item.id}-${item.user_id}`,
      })),
    [focusInProgressItems],
  )

  const inProgressTreeDataSource = useMemo(() => {
    const groups = new Map()

    inProgressDataSource.forEach((item) => {
      const phaseLabel = getPhaseDisplayName(item)
      if (!groups.has(phaseLabel)) {
        groups.set(phaseLabel, {
          items: [],
          risk_count: 0,
          overdue_count: 0,
          normal_count: 0,
          progress_sum: 0,
          expected_sum: 0,
        })
      }
      const group = groups.get(phaseLabel)
      group.items.push(item)
      const unifiedCode = getUnifiedStatusMeta(item).code
      if (unifiedCode === UNIFIED_WORK_STATUS.RISK) group.risk_count += 1
      else if (unifiedCode === UNIFIED_WORK_STATUS.OVERDUE) group.overdue_count += 1
      else group.normal_count += 1
      group.progress_sum += toNumber(item?.progress_percent, 0)
      group.expected_sum += toNumber(item?.expected_progress_percent, 0)
    })

    let index = 0
    return sortPhaseGroups(Array.from(groups.entries())).map(([phaseLabel, group]) => {
      const itemCount = group.items.length || 1
      const avgProgress = Number((group.progress_sum / itemCount).toFixed(1))
      const avgExpected = Number((group.expected_sum / itemCount).toFixed(1))

      const sortedChildren = sortInProgressChildItems(group.items)
      return {
        key: `phase-group-${index++}`,
        row_type: 'phase_group',
        phase_name: phaseLabel,
        username: `共 ${itemCount} 项`,
        demand_name: `共 ${itemCount} 项，风险 ${group.risk_count} 项`,
        progress_show: true,
        progress_percent: avgProgress,
        expected_progress_percent: avgExpected,
        progress_risk: group.risk_count > 0,
        risk_count: group.risk_count,
        overdue_count: group.overdue_count,
        normal_count: group.normal_count,
        children: sortedChildren,
      }
    })
  }, [inProgressDataSource])

  const doneTodayDataSource = useMemo(
    () =>
      focusDoneTodayItems.map((item) => ({
        ...item,
        row_type: 'item',
        key: `d-${item.id}-${item.user_id}`,
      })),
    [focusDoneTodayItems],
  )

  const doneTodayTreeDataSource = useMemo(() => {
    const groups = new Map()

    doneTodayDataSource.forEach((item) => {
      const phaseLabel = getPhaseDisplayName(item)
      if (!groups.has(phaseLabel)) {
        groups.set(phaseLabel, {
          items: [],
          late_done_count: 0,
          on_time_done_count: 0,
          normal_count: 0,
          progress_sum: 0,
          expected_sum: 0,
        })
      }
      const group = groups.get(phaseLabel)
      group.items.push(item)
      const unifiedCode = getUnifiedStatusMeta(item).code
      if (unifiedCode === UNIFIED_WORK_STATUS.LATE_DONE) group.late_done_count += 1
      else if (unifiedCode === UNIFIED_WORK_STATUS.ON_TIME_DONE) group.on_time_done_count += 1
      else group.normal_count += 1
      group.progress_sum += toNumber(item?.progress_percent, 0)
      group.expected_sum += toNumber(item?.expected_progress_percent, 0)
    })

    let index = 0
    return sortPhaseGroups(Array.from(groups.entries())).map(([phaseLabel, group]) => {
      const itemCount = group.items.length || 1
      const avgProgress = Number((group.progress_sum / itemCount).toFixed(1))
      const avgExpected = Number((group.expected_sum / itemCount).toFixed(1))
      const sortedChildren = sortInProgressChildItems(group.items)

      return {
        key: `done-phase-group-${index++}`,
        row_type: 'phase_group',
        phase_name: phaseLabel,
        username: `共 ${itemCount} 项`,
        demand_name: `共 ${itemCount} 项，逾期完成 ${group.late_done_count} 项`,
        progress_show: true,
        progress_percent: avgProgress,
        expected_progress_percent: avgExpected,
        progress_risk: group.late_done_count > 0,
        late_done_count: group.late_done_count,
        on_time_done_count: group.on_time_done_count,
        normal_count: group.normal_count,
        children: sortedChildren,
      }
    })
  }, [doneTodayDataSource])

  const yesterdayDueColumns = useMemo(
    () => [
      {
        title: '检查结果',
        dataIndex: 'check_result',
        key: 'check_result',
        width: 140,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            <Text strong>{getPhaseDisplayName(record)}</Text>
          ) : (
            getUnifiedStatusTag(record)
          ),
      },
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 100,
        ellipsis: true,
      },
      {
        title: '需求任务',
        dataIndex: 'phase_name',
        key: 'phase_name',
        width: 120,
        render: (_, record) =>
          record?.row_type === 'phase_group' ? (
            <Text strong>{getPhaseDisplayName(record)}</Text>
          ) : (
            getPhaseDisplayName(record)
          ),
      },
      {
        title: '需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 280,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            <Space size={6} wrap>
              <Tag color="error">{`未完成 ${toNumber(record?.not_done_count, 0)}`}</Tag>
              <Tag color="warning">{`延迟 ${toNumber(record?.late_done_count, 0)}`}</Tag>
              <Tag color="success">{`按期 ${toNumber(record?.on_time_count, 0)}`}</Tag>
              <Tag color="blue">{`昨日完成 ${toNumber(record?.prev_workday_done_count, 0)}`}</Tag>
            </Space>
          ) : (
            renderDemandNameWithLimit(value, 30, record?.demand_id)
          ),
      },
      {
        title: '工作描述',
        dataIndex: 'description',
        key: 'description',
        render: (value, record) => {
          if (record?.row_type === 'phase_group') return <Text type="secondary">-</Text>
          const fullText = String(value || '').trim()
          if (!fullText) return '-'
          return <span className="morning-prewrap-text">{fullText}</span>
        },
      },
      {
        title: '预计开始',
        dataIndex: 'expected_start_date',
        key: 'expected_start_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '预计完成',
        dataIndex: 'expected_completion_date',
        key: 'expected_completion_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '实际完成',
        dataIndex: 'log_completed_at',
        key: 'log_completed_at',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 90,
        render: (value, record) =>
          record?.row_type === 'phase_group' ? (
            <Text type="secondary">-</Text>
          ) : (
            <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>
          ),
      },
      {
        title: '工作描述',
        dataIndex: 'description',
        key: 'description',
        render: (value, record) => {
          if (record?.row_type === 'phase_group') return <Text type="secondary">-</Text>
          const fullText = String(value || '').trim()
          if (!fullText) return '-'
          return <span className="morning-prewrap-text">{fullText}</span>
        },
      },
    ],
    [],
  )

  const yesterdayDueDataSource = useMemo(
    () =>
      focusYesterdayDueItems.map((item) => ({
        ...item,
        row_type: 'item',
        key: `y-${item.id}-${item.user_id}`,
      })),
    [focusYesterdayDueItems],
  )

  const yesterdayDueTreeDataSource = useMemo(() => {
    const groups = new Map()

    yesterdayDueDataSource.forEach((item) => {
      const phaseLabel = getPhaseDisplayName(item)
      if (!groups.has(phaseLabel)) {
        groups.set(phaseLabel, {
          items: [],
          not_done_count: 0,
          late_done_count: 0,
          on_time_count: 0,
          prev_workday_done_count: 0,
          pending_count: 0,
        })
      }

      const group = groups.get(phaseLabel)
      group.items.push(item)
      const result = String(item?.check_result || '').toUpperCase()
      if (result === 'NOT_DONE') group.not_done_count += 1
      else if (result === 'LATE_DONE') group.late_done_count += 1
      else if (result === 'ON_TIME') group.on_time_count += 1
      else if (result === 'PREV_WORKDAY_DONE') group.prev_workday_done_count += 1
      else group.pending_count += 1
    })

    let index = 0
    return sortPhaseGroups(Array.from(groups.entries())).map(([phaseLabel, group]) => {
      const itemCount = group.items.length
      const mergedResult = getGroupYesterdayCheckResult(group)
      const sortedChildren = sortYesterdayDueChildItems(group.items)
      return {
        key: `y-phase-group-${index++}`,
        row_type: 'phase_group',
        phase_name: phaseLabel,
        check_result: mergedResult,
        username: `共 ${itemCount} 项`,
        demand_name: `未完成 ${group.not_done_count}，延迟 ${group.late_done_count}，按期 ${group.on_time_count}，昨日完成 ${group.prev_workday_done_count}`,
        not_done_count: group.not_done_count,
        late_done_count: group.late_done_count,
        on_time_count: group.on_time_count,
        prev_workday_done_count: group.prev_workday_done_count,
        children: sortedChildren,
      }
    })
  }, [yesterdayDueDataSource])

  const todoColumns = useMemo(
    () => [
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 100,
        ellipsis: true,
      },
      {
        title: '需求任务',
        dataIndex: 'phase_name',
        key: 'phase_name',
        width: 120,
        render: (_, record) => getPhaseDisplayName(record),
      },
      {
        title: '事项',
        dataIndex: 'item_type_name',
        key: 'item_type_name',
        width: 100,
        ellipsis: true,
      },
      {
        title: '需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 280,
        render: (value, record) => renderDemandNameWithLimit(value, 30, record?.demand_id),
      },
      {
        title: '预计开始',
        dataIndex: 'expected_start_date',
        key: 'expected_start_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '预计完成',
        dataIndex: 'expected_completion_date',
        key: 'expected_completion_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '开始提示',
        dataIndex: 'days_to_start',
        key: 'days_to_start',
        width: 140,
        render: (value) => getStartHintTag(value),
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 90,
        render: (value) => <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
      },
    ],
    [],
  )

  const todoDataSource = useMemo(
    () =>
      focusTodoItems.map((item) => ({
        ...item,
        key: `t-${item.id}-${item.user_id}`,
      })),
    [focusTodoItems],
  )

  const alignmentTabItems = useMemo(
    () => [
      {
        key: 'in_progress',
        label: `进行中事项 (${toNumber(focusSummary.in_progress_count)})`,
      },
      {
        key: 'done_today',
        label: `今日已完成事项 (${toNumber(focusSummary.done_today_count)})`,
      },
      {
        key: 'yesterday_due',
        label: `昨日完成事项对齐 (${toNumber(focusSummary.yesterday_due_total)})`,
      },
      {
        key: 'todo_pending',
        label: `待开始事项 (${toNumber(focusSummary.todo_pending_count)})`,
      },
      {
        key: 'members',
        label: `成员进行中事项 (${members.length})`,
      },
    ],
    [focusSummary, members.length],
  )

  const alignmentView = useMemo(() => {
    if (activeAlignmentTab === 'members') {
      return {
        columns: [],
        dataSource: [],
        emptyText: '当前范围暂无成员',
        scrollX: undefined,
      }
    }
    if (activeAlignmentTab === 'yesterday_due') {
      return {
        columns: yesterdayDueColumns,
        dataSource: yesterdayDueViewMode === 'tree' ? yesterdayDueTreeDataSource : yesterdayDueDataSource,
        emptyText: '上个工作日无需要对齐的事项',
        scrollX: 'max-content',
        treeMode: yesterdayDueViewMode === 'tree',
      }
    }
    if (activeAlignmentTab === 'done_today') {
      return {
        columns: doneTodayColumns,
        dataSource: inProgressViewMode === 'tree' ? doneTodayTreeDataSource : doneTodayDataSource,
        emptyText: '暂无今日已完成事项',
        scrollX: 'max-content',
        treeMode: inProgressViewMode === 'tree',
      }
    }
    if (activeAlignmentTab === 'todo_pending') {
      return {
        columns: todoColumns,
        dataSource: todoDataSource,
        emptyText: '暂无待开始事项',
        scrollX: 'max-content',
      }
    }
    return {
      columns: inProgressColumns,
      dataSource: inProgressViewMode === 'tree' ? inProgressTreeDataSource : inProgressDataSource,
      emptyText: '暂无进行中事项',
      scrollX: 'max-content',
      treeMode: inProgressViewMode === 'tree',
    }
  }, [
    activeAlignmentTab,
    yesterdayDueColumns,
    yesterdayDueDataSource,
    yesterdayDueTreeDataSource,
    yesterdayDueViewMode,
    todoColumns,
    todoDataSource,
    inProgressColumns,
    doneTodayColumns,
    inProgressDataSource,
    inProgressTreeDataSource,
    doneTodayDataSource,
    doneTodayTreeDataSource,
    inProgressViewMode,
  ])

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
      })),
    [tabs],
  )

  const selectedAgentOption = useMemo(
    () => agentOptions.find((item) => Number(item?.id) === Number(selectedAgentId)) || null,
    [agentOptions, selectedAgentId],
  )

  const activeTabLabel = useMemo(
    () => tabItems.find((item) => item.key === activeTabKey)?.label || '当前范围',
    [activeTabKey, tabItems],
  )

  const activeAlignmentLabel = useMemo(
    () => alignmentTabItems.find((item) => item.key === activeAlignmentTab)?.label || '进行中事项',
    [activeAlignmentTab, alignmentTabItems],
  )

  const currentScopeParams = useMemo(() => buildMorningScopeParams(activeTabKey), [activeTabKey])
  const currentScopeKey = useMemo(() => JSON.stringify(currentScopeParams), [currentScopeParams])

  const loadWeeklyProgress = useCallback(
    async ({ force = false } = {}) => {
      if (!force && weeklyProgressScopeKey === currentScopeKey && weeklyProgressData.demand_list.length > 0) return

      setWeeklyProgressLoading(true)
      try {
        const result = await getMorningStandupWeeklyProgressApi(currentScopeParams, { force })
        if (!result?.success) {
          message.error(result?.message || '获取本周进展失败')
          return
        }
        setWeeklyProgressData(result.data || EMPTY_WEEKLY_PROGRESS)
        setWeeklyProgressScopeKey(currentScopeKey)
      } catch (error) {
        message.error(error?.message || '获取本周进展失败')
      } finally {
        setWeeklyProgressLoading(false)
      }
    },
    [currentScopeKey, currentScopeParams, weeklyProgressData.demand_list.length, weeklyProgressScopeKey],
  )

  const loadWeeklyCompleted = useCallback(
    async ({ force = false } = {}) => {
      if (!force && weeklyCompletedScopeKey === currentScopeKey && weeklyCompletedData.member_tree.length > 0) return

      setWeeklyCompletedLoading(true)
      try {
        const result = await getMorningStandupWeeklyCompletedApi(currentScopeParams, { force })
        if (!result?.success) {
          message.error(result?.message || '获取本周已完成事项汇总失败')
          return
        }
        setWeeklyCompletedData(result.data || EMPTY_WEEKLY_COMPLETED)
        setWeeklyCompletedScopeKey(currentScopeKey)
      } catch (error) {
        message.error(error?.message || '获取本周已完成事项汇总失败')
      } finally {
        setWeeklyCompletedLoading(false)
      }
    },
    [currentScopeKey, currentScopeParams, weeklyCompletedData.member_tree.length, weeklyCompletedScopeKey],
  )

  useEffect(() => {
    if (weeklyProgressModalOpen && weeklyProgressScopeKey !== currentScopeKey) {
      loadWeeklyProgress({ force: true })
    }
  }, [currentScopeKey, loadWeeklyProgress, weeklyProgressModalOpen, weeklyProgressScopeKey])

  useEffect(() => {
    if (weeklyCompletedModalOpen && weeklyCompletedScopeKey !== currentScopeKey) {
      loadWeeklyCompleted({ force: true })
    }
  }, [currentScopeKey, loadWeeklyCompleted, weeklyCompletedModalOpen, weeklyCompletedScopeKey])

  const handleOpenWeeklyProgress = useCallback(async () => {
    setWeeklyProgressModalOpen(true)
    await loadWeeklyProgress()
  }, [loadWeeklyProgress])

  const handleOpenWeeklyCompleted = useCallback(async () => {
    setWeeklyCompletedModalOpen(true)
    await loadWeeklyCompleted()
  }, [loadWeeklyCompleted])

  const handleTabChange = async (nextKey) => {
    setActiveTabKey(nextKey)
    await loadBoard(nextKey)
  }

  const handleExecuteAnalysis = useCallback(async () => {
    if (!selectedAgentId) {
      message.warning('请先选择一个 Agent')
      return
    }

    try {
      setAnalysisExecuting(true)
      const contextParams = {
        tab_key: activeTabKey,
        department_id: parseDepartmentIdFromTabKey(activeTabKey),
        alignment_tab: activeAlignmentTab,
      }
      const result = await executeAgentApi({
        scene_code: MORNING_STANDUP_AGENT_SCENE,
        agent_id: selectedAgentId,
        context_params: contextParams,
      })
      if (!result?.success) {
        message.error(result?.message || '执行晨会分析失败')
        return
      }
      setAnalysisResult({
        ...(result?.data || {}),
        agent_label: selectedAgentOption?.agent_name || result?.data?.agent_name || '',
        tab_label: activeTabLabel,
        alignment_label: activeAlignmentLabel,
      })
      message.success('晨会分析已生成')
    } catch (error) {
      message.error(error?.message || '执行晨会分析失败')
    } finally {
      setAnalysisExecuting(false)
    }
  }, [activeAlignmentLabel, activeAlignmentTab, activeTabKey, activeTabLabel, selectedAgentId, selectedAgentOption])

  const handleCopyAnalysis = useCallback(async () => {
    const text = String(analysisResult?.response_text || '').trim()
    if (!text) {
      message.warning('当前没有可复制的分析结果')
      return
    }

    try {
      const copied = await copyTextWithFallback(text)
      if (!copied) {
        message.error('复制失败，请检查浏览器复制权限')
        return
      }
      message.success('分析结果已复制')
    } catch (error) {
      message.error(error?.message || '复制失败')
    }
  }, [analysisResult?.response_text])

  const currentHoursDetailItems =
    hoursDetailModal.type === 'actual' ? todayActualDetailItems : todayPlannedDetailItems
  const currentHoursDetailTitle = hoursDetailModal.type === 'actual' ? '今日实际用时明细' : '今日计划用时明细'
  const currentHoursField = hoursDetailModal.type === 'actual' ? 'today_actual_hours' : 'today_planned_hours'
  const currentHoursTotal = currentHoursDetailItems.reduce((sum, item) => sum + toNumber(item?.hours, 0), 0)
  const weeklyProgressRangeLabel = formatStandupRange(weeklyProgressData.range)
  const weeklyCompletedRangeLabel = formatStandupRange(weeklyCompletedData.range)
  const weeklyProgressCopyText = useMemo(
    () => buildWeeklyProgressCopyText(weeklyProgressData, `${activeTabLabel} · `),
    [activeTabLabel, weeklyProgressData],
  )
  const weeklyCompletedCopyText = useMemo(
    () => buildWeeklyCompletedCopyText(weeklyCompletedData, `${activeTabLabel} · `),
    [activeTabLabel, weeklyCompletedData],
  )

  const handleCopyText = useCallback(async (text, successLabel) => {
    const normalizedText = String(text || '').trim()
    if (!normalizedText) {
      message.warning('当前没有可复制的内容')
      return
    }

    try {
      const copied = await copyTextWithFallback(normalizedText)
      if (!copied) {
        message.error('复制失败，请检查浏览器复制权限')
        return
      }
      message.success(successLabel)
    } catch (error) {
      message.error(error?.message || '复制失败')
    }
  }, [])

  const weeklyProgressColumns = useMemo(
    () => [
      {
        title: '需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 220,
        render: (_, record) => (
          <Space size={[6, 6]} wrap>
            {record.demand_priority ? <Tag color="red">{record.demand_priority}</Tag> : null}
            {renderDemandNameWithLimit(record.demand_name || record.demand_id, 30, record.demand_id)}
          </Space>
        ),
      },
      {
        title: '负责人',
        dataIndex: 'owner_names',
        key: 'owner_names',
        width: 180,
        render: (value) => <span className="morning-prewrap-text">{joinDisplayNames(value)}</span>,
      },
      {
        title: '节点排期',
        dataIndex: 'phase_list',
        key: 'phase_list',
        width: 280,
        render: (value) => {
          const phases = Array.isArray(value) ? value.slice(0, 3) : []
          if (phases.length === 0) return <Text type="secondary">暂无节点排期</Text>
          return (
            <Space orientation="vertical" size={4}>
              {phases.map((phase) => (
                <div key={`${phase.phase_key || phase.phase_name}`}>
                  <Space size={[4, 4]} wrap>
                    <Tag color="geekblue">{phase.phase_name || '其他事项'}</Tag>
                    <Text type="secondary">{formatScheduleSpan(phase.start_date, phase.end_date)}</Text>
                  </Space>
                </div>
              ))}
              {Array.isArray(value) && value.length > 3 ? (
                <Text type="secondary">{`另有 ${value.length - 3} 个节点`}</Text>
              ) : null}
            </Space>
          )
        },
      },
      {
        title: '进行中',
        dataIndex: 'active_item_count',
        key: 'active_item_count',
        width: 88,
        align: 'right',
      },
      {
        title: '本周完成',
        dataIndex: 'done_item_count',
        key: 'done_item_count',
        width: 96,
        align: 'right',
      },
      {
        title: '风险',
        dataIndex: 'risk_item_count',
        key: 'risk_item_count',
        width: 84,
        align: 'right',
        render: (value) => (
          <Text type={toNumber(value, 0) > 0 ? 'danger' : 'secondary'}>{toNumber(value, 0)}</Text>
        ),
      },
      {
        title: '最新进展',
        dataIndex: 'latest_items',
        key: 'latest_items',
        width: 320,
        render: (value) => {
          const items = Array.isArray(value) ? value.slice(0, 2) : []
          if (items.length === 0) return <Text type="secondary">暂无事项</Text>
          return (
            <Space orientation="vertical" size={4}>
              {items.map((item) => (
                <div key={item.id}>
                  <Space size={[4, 4]} wrap>
                    <Tag color={getStatusTagColor(item.log_status)}>{getStatusLabel(item.log_status)}</Tag>
                    <Text strong>{item.username || '-'}</Text>
                    {item.phase_name ? <Tag color="blue">{item.phase_name}</Tag> : null}
                  </Space>
                  <div className="morning-prewrap-text">
                    {item.description || item.item_type_name || `事项 #${item.id}`}
                  </div>
                </div>
              ))}
            </Space>
          )
        },
      },
    ],
    [],
  )

  const weeklyCompletedColumns = useMemo(
    () => [
      {
        title: '本周已完成事项',
        key: 'name',
        width: 360,
        render: (_, record) => {
          if (record.row_type === 'member') {
            return (
              <Space size={[8, 8]} wrap>
                <Text strong>{record.username || '-'}</Text>
                <Tag color="blue">{`${toNumber(record.done_count, 0)} 项`}</Tag>
              </Space>
            )
          }

          if (record.row_type === 'day') {
            return (
              <Space size={[8, 8]} wrap>
                <Tag color="geekblue">{formatBeijingDate(record.completed_date)}</Tag>
                <Text type="secondary">{`已完成 ${toNumber(record.done_count, 0)} 项`}</Text>
              </Space>
            )
          }

          return (
            <div>
              <Space size={[4, 4]} wrap>
                <Tag color="green">{`#${record.id}`}</Tag>
                <Tag>{record.item_type_name || '-'}</Tag>
              </Space>
              <div className="morning-prewrap-text" style={{ marginTop: 4 }}>
                {record.description || '-'}
              </div>
            </div>
          )
        },
      },
      {
        title: '需求',
        key: 'demand_name',
        width: 220,
        render: (_, record) =>
          record.row_type === 'item'
            ? renderDemandNameWithLimit(record.demand_name || record.demand_id, 28, record.demand_id)
            : <Text type="secondary">-</Text>,
      },
      {
        title: '节点',
        dataIndex: 'phase_name',
        key: 'phase_name',
        width: 160,
        render: (value, record) => (record.row_type === 'item' ? value || '-' : <Text type="secondary">-</Text>),
      },
      {
        title: '完成时间',
        key: 'completed_at',
        width: 180,
        render: (_, record) => {
          if (record.row_type === 'item') return formatBeijingDateTime(record.completed_at)
          if (record.row_type === 'day') return formatBeijingDate(record.completed_date)
          return <Text type="secondary">-</Text>
        },
      },
    ],
    [],
  )

  const renderWeeklyProgressExpanded = useCallback((record) => {
    const phases = Array.isArray(record?.phase_list) ? record.phase_list : []
    const latestItems = Array.isArray(record?.latest_items) ? record.latest_items : []

    return (
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={12}>
          <Card size="small" title={`相关节点（${phases.length}）`} className="morning-weekly-detail-card">
            {phases.length === 0 ? (
              <Empty description="暂无节点信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space orientation="vertical" size={8} className="morning-weekly-detail-list">
                {phases.map((phase) => (
                  <div key={`${record.demand_id}-${phase.phase_key || phase.phase_name}`} className="morning-weekly-detail-item">
                    <div className="morning-weekly-detail-item__head">
                      <Space size={[6, 6]} wrap>
                        <Tag color="geekblue">{phase.phase_name || '其他事项'}</Tag>
                        <Tag>{`负责人 ${joinDisplayNames(phase.owner_names)}`}</Tag>
                        <Tag color="processing">{`进行中 ${toNumber(phase.active_item_count, 0)}`}</Tag>
                        <Tag color="success">{`本周完成 ${toNumber(phase.done_item_count, 0)}`}</Tag>
                        {toNumber(phase.risk_item_count, 0) > 0 ? (
                          <Tag color="error">{`风险 ${toNumber(phase.risk_item_count, 0)}`}</Tag>
                        ) : null}
                      </Space>
                    </div>
                    <div className="morning-weekly-detail-item__meta">
                      {formatScheduleSpan(phase.start_date, phase.end_date)}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={`事项明细（${latestItems.length}）`} className="morning-weekly-detail-card">
            {latestItems.length === 0 ? (
              <Empty description="暂无事项明细" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space orientation="vertical" size={8} className="morning-weekly-detail-list">
                {latestItems.map((item) => (
                  <div key={`${record.demand_id}-${item.id}`} className="morning-weekly-detail-item">
                    <div className="morning-weekly-detail-item__head">
                      <Space size={[6, 6]} wrap>
                        <Tag color={getStatusTagColor(item.log_status)}>{getStatusLabel(item.log_status)}</Tag>
                        <Text strong>{item.username || '-'}</Text>
                        {item.phase_name ? <Tag color="blue">{item.phase_name}</Tag> : null}
                        {item.is_risk ? <Tag color="error">风险</Tag> : null}
                      </Space>
                    </div>
                    <div className="morning-weekly-detail-item__desc">{item.description || '-'}</div>
                    <div className="morning-weekly-detail-item__meta">
                      {formatScheduleSpan(item.expected_start_date, item.expected_completion_date)}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    )
  }, [])

  const renderMemberCard = (member) => {
    const activeItems = Array.isArray(member?.active_items) ? member.active_items : []
    const todayScheduled = Boolean(member?.today_scheduled)
    const todayFilled = Boolean(member?.today_filled)
    const todayPlannedHours = toNumber(member?.today_planned_hours, 0)
    const todayActualHours = toNumber(member?.today_actual_hours, 0)
    const assignableHours = toNumber(member?.assignable_hours, 0)
    const todayTag = todayScheduled
      ? todayFilled
        ? <Tag color="green">今日已填报</Tag>
        : <Tag color="orange">今日待填报</Tag>
      : <Tag color="blue">今日未安排</Tag>

    return (
      <Card
        key={member.user_id}
        size="small"
        className="morning-member-card"
        title={
          <Space size={8}>
            <Text strong>{member.username}</Text>
            {Number(member.user_id) === Number(currentUser?.id) ? <Tag color="blue">我</Tag> : null}
            {todayTag}
            <Tag>{`进行中 ${activeItems.length}`}</Tag>
          </Space>
        }
      >
        <div className="morning-member-stats">
          <div className="morning-member-stat">
            <div className="morning-member-stat-label">今日安排</div>
            <div className="morning-member-stat-value">{todayPlannedHours.toFixed(1)}h</div>
          </div>
          <div className="morning-member-stat">
            <div className="morning-member-stat-label">今日已填</div>
            <div className="morning-member-stat-value">{todayActualHours.toFixed(1)}h</div>
          </div>
          <div className="morning-member-stat">
            <div className="morning-member-stat-label">可指派</div>
            <div className="morning-member-stat-value morning-member-stat-value--accent">{assignableHours.toFixed(1)}h</div>
          </div>
        </div>

        {activeItems.length === 0 ? (
          <Text type="secondary">暂无进行中事项</Text>
        ) : (
          <Space orientation="vertical" size={8} className="morning-member-item-list">
            {activeItems.map((item) => {
              const unifiedMeta = getUnifiedStatusMeta(item)
              const overdue = unifiedMeta.code === UNIFIED_WORK_STATUS.OVERDUE
              const dueToday = unifiedMeta.code === UNIFIED_WORK_STATUS.DUE_TODAY

              return (
                <div
                  key={item.id}
                  className={getMemberItemClassName(overdue, dueToday)}
                >
                  <div className="morning-member-item-head">
                    <Space size={6} wrap>
                      <Tag color="blue">#{item.id}</Tag>
                      <Tag color={unifiedMeta.color}>{unifiedMeta.label}</Tag>
                      <Tag color={getStatusTagColor(item.log_status)}>{getStatusLabel(item.log_status)}</Tag>
                      <Text strong>{item.item_type_name || '-'}</Text>
                    </Space>
                    <Space size={6} wrap>
                      {item.demand_id ? <Tag>{item.demand_name || item.demand_id}</Tag> : null}
                      {item.phase_name ? <Tag color="geekblue">{item.phase_name}</Tag> : null}
                    </Space>
                  </div>
                  <div className="morning-member-item-meta">
                    预计开始:
                    <span className="morning-member-item-date">
                      {formatBeijingDate(item.expected_start_date)}
                    </span>
                  </div>
                  <div className="morning-member-item-meta">
                    预计完成:
                    <span
                      className={
                        overdue
                          ? 'morning-member-item-date morning-member-item-date--overdue'
                          : dueToday
                            ? 'morning-member-item-date morning-member-item-date--due'
                            : 'morning-member-item-date'
                      }
                    >
                      {formatBeijingDate(item.expected_completion_date)}
                    </span>
                    {overdue ? '（逾期）' : dueToday ? '（今日到期）' : ''}
                  </div>
                  <div className="morning-member-item-desc">
                    {item.description || '-'}
                  </div>
                </div>
              )
            })}
          </Space>
        )}
      </Card>
    )
  }

  return (
    <div className="morning-standup-page morning-standup-layout">
      <Card
        variant="borderless"
        className="morning-board-section-card morning-board-shell-card morning-section-gap"
      >
        <div className="morning-board-topbar">
          <div className="morning-board-topbar__tabs">
            {tabItems.length > 0 ? (
              <Tabs
                className="morning-board-tabs"
                activeKey={activeTabKey || tabItems[0]?.key}
                items={tabItems}
                onChange={handleTabChange}
                style={{ marginBottom: 0 }}
              />
            ) : (
              <Empty description="暂无可用部门数据" style={{ margin: 0 }} />
            )}
          </div>
          <div className="morning-board-topbar__actions">
            <Button className="morning-weekly-toolbar-btn" onClick={handleOpenWeeklyProgress}>
              本周进展
            </Button>
            <Button className="morning-weekly-toolbar-btn" onClick={handleOpenWeeklyCompleted}>
              本周已完成
            </Button>
            <Tag
              className={`morning-board-refresh-tag ${loading ? 'morning-board-refresh-tag--loading' : ''}`}
              icon={<ReloadOutlined />}
              onClick={() => {
                if (!loading) loadBoard(activeTabKey, { force: true })
              }}
            >
              刷新
            </Tag>
          </div>
        </div>

        {canUseAiStandupAnalysis ? (
          <div className="morning-agent-panel">
            <div className="morning-agent-panel__header">
              <div>
                <Space size={8} wrap>
                  <Tag color="cyan" icon={<RobotOutlined />}>
                    AI 晨会分析
                  </Tag>
                  <Text strong>手动选择 Agent 执行当前晨会范围分析</Text>
                </Space>
                <div className="morning-agent-panel__hint">
                  当前会基于你正在查看的部门范围和事项对齐页签生成纯文本分析结果。
                </div>
              </div>
              <Space wrap>
                <Select
                  className="morning-agent-select"
                  placeholder="请选择 Agent"
                  loading={agentOptionsLoading}
                  value={selectedAgentId || undefined}
                  options={agentOptions.map((item) => ({
                    value: item.id,
                    label: `${item.agent_name} (${item.agent_code})`,
                  }))}
                  onChange={setSelectedAgentId}
                />
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={analysisExecuting}
                  disabled={agentOptionsLoading || agentOptions.length === 0}
                  onClick={handleExecuteAnalysis}
                >
                  执行分析
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  disabled={!analysisResult?.response_text}
                  onClick={handleCopyAnalysis}
                >
                  复制结果
                </Button>
                <Button
                  icon={<DeleteOutlined />}
                  disabled={!analysisResult}
                  onClick={() => setAnalysisResult(null)}
                >
                  清空
                </Button>
              </Space>
            </div>

            {selectedAgentOption?.business_purpose ? (
              <div className="morning-agent-panel__purpose">
                <Text type="secondary">{`业务定位：${selectedAgentOption.business_purpose}`}</Text>
              </div>
            ) : null}

            {agentOptions.length === 0 && !agentOptionsLoading ? (
              <div className="morning-agent-empty">
                暂无可用 Agent，请先前往系统设置中的 Agent 配置页面创建并启用晨会分析 Agent。
              </div>
            ) : null}

            {analysisResult ? (
              <div className="morning-agent-result">
                <div className="morning-agent-result__meta">
                  <Space size={[8, 8]} wrap>
                    <Tag color="blue">{analysisResult.agent_label || '已执行 Agent'}</Tag>
                    <Tag>{analysisResult.tab_label || activeTabLabel}</Tag>
                    <Tag color="geekblue">{analysisResult.alignment_label || activeAlignmentLabel}</Tag>
                  </Space>
                </div>
                <Paragraph className="morning-agent-result__text">
                  {analysisResult.response_text || '本次未返回分析内容。'}
                </Paragraph>
              </div>
            ) : null}
          </div>
        ) : null}

        <Row gutter={[12, 12]} className="morning-summary-row morning-summary-row--top">
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small" className="morning-summary-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div className="morning-summary-value">{toNumber(summary.team_size)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small" className="morning-summary-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日有安排</Text>
              </Space>
              <div className="morning-summary-value">
                {toNumber(summary.scheduled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small" className="morning-summary-card">
              <Space>
                <CheckCircleOutlined />
                <Text type="secondary">有安排已填报</Text>
              </Space>
              <div className="morning-summary-value morning-summary-value--success">
                {toNumber(summary.filled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card
              size="small"
              className="morning-summary-card morning-summary-card--clickable"
              onClick={() => setUnfilledModalOpen(true)}
            >
              <Space>
                <WarningOutlined />
                <Text type="secondary">有安排待填报</Text>
              </Space>
              <div className="morning-summary-value morning-summary-value--warning">
                {toNumber(summary.unfilled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card
              size="small"
              className="morning-summary-card morning-summary-card--clickable"
              onClick={() => setUnscheduledModalOpen(true)}
            >
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日未安排</Text>
              </Space>
              <div className="morning-summary-value morning-summary-value--danger">
                {toNumber(summary.unscheduled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card
              size="small"
              className="morning-summary-card morning-summary-card--clickable"
              onClick={() => setHoursDetailModal({ open: true, type: 'planned' })}
            >
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">{`计划用时(h/${teamPlannedCapacityHours.toFixed(1)})`}</Text>
              </Space>
              <div className="morning-summary-value">
                {toNumber(summary.total_planned_hours_today).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card
              size="small"
              className="morning-summary-card morning-summary-card--clickable"
              onClick={() => setHoursDetailModal({ open: true, type: 'actual' })}
            >
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">实际用时(h)</Text>
              </Space>
              <div className="morning-summary-value">
                {toNumber(summary.total_actual_hours_today).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small" className="morning-summary-card">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">进行中事项</Text>
              </Space>
              <div className="morning-summary-value">
                {toNumber(summary.active_item_count)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} className="morning-section-gap">
        <Col span={24}>
          <Card
            size="small"
            title="今日事项对齐"
            variant="borderless"
            className="morning-board-section-card morning-focus-ultra morning-alignment-card"
            extra={
              <Space size={6} wrap>
                <Tag color="error">{`昨日未完成 ${toNumber(focusSummary.yesterday_due_not_done_count)}`}</Tag>
                <Tag color="warning">{`延迟完成 ${toNumber(focusSummary.yesterday_due_late_done_count)}`}</Tag>
                <Tag color="blue">{`昨日完成 ${toNumber(focusSummary.yesterday_due_completed_count)}`}</Tag>
              </Space>
            }
          >
            <Tabs
              className="morning-alignment-tabs"
              activeKey={activeAlignmentTab}
              onChange={setActiveAlignmentTab}
              items={alignmentTabItems}
              size="small"
            />
            <div className="morning-align-content-wrap">
              {activeAlignmentTab === 'members' ? (
                members.length === 0 ? (
                  <Empty description="当前范围暂无成员" />
                ) : (
                  <Row gutter={[12, 12]}>
                    {sortedMembers.map((member) => (
                      <Col key={member.user_id} xs={24} md={12} xl={8}>
                        {renderMemberCard(member)}
                      </Col>
                    ))}
                  </Row>
                )
              ) : alignmentView.dataSource.length === 0 ? (
                <Empty description={alignmentView.emptyText} />
              ) : (
                <>
                  <div className="morning-align-toolbar">
                    <div>
                      {activeAlignmentTab === 'in_progress' ||
                      activeAlignmentTab === 'done_today' ||
                      activeAlignmentTab === 'yesterday_due' ? (
                        <Space size={6} wrap>
                          <Text type="secondary" className="morning-toolbar-note">
                            视图模式
                          </Text>
                          <Segmented
                            size="small"
                            value={activeAlignmentTab === 'yesterday_due' ? yesterdayDueViewMode : inProgressViewMode}
                            onChange={(value) => {
                              const nextMode = String(value)
                              if (activeAlignmentTab === 'in_progress' || activeAlignmentTab === 'done_today') {
                                setInProgressViewMode(nextMode)
                              } else if (activeAlignmentTab === 'yesterday_due') {
                                setYesterdayDueViewMode(nextMode)
                              }
                            }}
                            options={[
                              { label: '平铺', value: 'flat' },
                              { label: '树形', value: 'tree' },
                            ]}
                          />
                        </Space>
                      ) : null}
                    </div>
                    <Text type="secondary" className="morning-toolbar-note">
                      可左右滑动查看更多列
                    </Text>
                  </div>
                  <Table
                    size="small"
                    columns={alignmentView.columns}
                    dataSource={alignmentView.dataSource}
                    pagination={false}
                    bordered={false}
                    className="morning-focus-table-ultra morning-board-table"
                    scroll={alignmentView.scrollX ? { x: alignmentView.scrollX } : undefined}
                    sticky
                    expandable={alignmentView.treeMode ? { defaultExpandAllRows: true } : undefined}
                  />
                </>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title={`本周进展 · ${activeTabLabel}`}
        open={weeklyProgressModalOpen}
        onCancel={() => setWeeklyProgressModalOpen(false)}
        width={1180}
        footer={[
          <Button key="copy" onClick={() => handleCopyText(weeklyProgressCopyText, '本周进展文案已复制')}>
            复制汇总文案
          </Button>,
          <Button key="refresh" loading={weeklyProgressLoading} onClick={() => loadWeeklyProgress({ force: true })}>
            刷新数据
          </Button>,
          <Button key="close" type="primary" onClick={() => setWeeklyProgressModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="morning-weekly-summary-grid">
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">统计范围</div>
            <div className="morning-weekly-summary-card__value morning-weekly-summary-card__value--small">
              {weeklyProgressRangeLabel}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">需求数</div>
            <div className="morning-weekly-summary-card__value">
              {toNumber(weeklyProgressData.summary?.demand_count, 0)}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">进行中事项</div>
            <div className="morning-weekly-summary-card__value">
              {toNumber(weeklyProgressData.summary?.active_item_count, 0)}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">本周完成</div>
            <div className="morning-weekly-summary-card__value morning-weekly-summary-card__value--success">
              {toNumber(weeklyProgressData.summary?.done_item_count, 0)}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">风险事项</div>
            <div className="morning-weekly-summary-card__value morning-weekly-summary-card__value--danger">
              {toNumber(weeklyProgressData.summary?.risk_item_count, 0)}
            </div>
          </div>
        </div>

        {weeklyProgressData.demand_list.length === 0 ? (
          <Empty
            description={weeklyProgressLoading ? '本周进展加载中' : '当前范围本周暂无需求进展'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            rowKey={(record) => record.demand_id}
            loading={weeklyProgressLoading}
            size="small"
            pagination={false}
            dataSource={weeklyProgressData.demand_list}
            columns={weeklyProgressColumns}
            className="morning-board-table"
            scroll={{ x: 1180 }}
            expandable={{
              expandedRowRender: renderWeeklyProgressExpanded,
              rowExpandable: (record) =>
                Array.isArray(record?.phase_list) && record.phase_list.length > 0,
            }}
          />
        )}
      </Modal>

      <Modal
        title={`本周已完成事项汇总 · ${activeTabLabel}`}
        open={weeklyCompletedModalOpen}
        onCancel={() => setWeeklyCompletedModalOpen(false)}
        width={1080}
        footer={[
          <Button key="copy" onClick={() => handleCopyText(weeklyCompletedCopyText, '本周已完成汇总文案已复制')}>
            复制汇总文案
          </Button>,
          <Button key="refresh" loading={weeklyCompletedLoading} onClick={() => loadWeeklyCompleted({ force: true })}>
            刷新数据
          </Button>,
          <Button key="close" type="primary" onClick={() => setWeeklyCompletedModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="morning-weekly-summary-grid">
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">统计范围</div>
            <div className="morning-weekly-summary-card__value morning-weekly-summary-card__value--small">
              {weeklyCompletedRangeLabel}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">成员数</div>
            <div className="morning-weekly-summary-card__value">
              {toNumber(weeklyCompletedData.summary?.member_count, 0)}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">完成日期数</div>
            <div className="morning-weekly-summary-card__value">
              {toNumber(weeklyCompletedData.summary?.day_count, 0)}
            </div>
          </div>
          <div className="morning-weekly-summary-card">
            <div className="morning-weekly-summary-card__label">已完成事项数</div>
            <div className="morning-weekly-summary-card__value morning-weekly-summary-card__value--success">
              {toNumber(weeklyCompletedData.summary?.done_item_count, 0)}
            </div>
          </div>
        </div>

        {weeklyCompletedData.member_tree.length === 0 ? (
          <Empty
            description={weeklyCompletedLoading ? '本周已完成事项加载中' : '当前范围本周暂无已完成事项'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            rowKey={(record) => record.key}
            loading={weeklyCompletedLoading}
            size="small"
            pagination={false}
            dataSource={weeklyCompletedData.member_tree}
            columns={weeklyCompletedColumns}
            className="morning-board-table"
            scroll={{ x: 920 }}
            expandable={{ defaultExpandAllRows: true }}
          />
        )}
      </Modal>

      <Modal
        title={`今日未安排成员（${unscheduledMembers.length}）`}
        open={unscheduledModalOpen}
        onCancel={() => setUnscheduledModalOpen(false)}
        onOk={() => setUnscheduledModalOpen(false)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        width={840}
      >
        {unscheduledMembers.length === 0 ? (
          <Empty description="今日暂无未安排成员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey={(record) => record.key}
            size="small"
            pagination={false}
            dataSource={unscheduledByDepartmentRows}
            columns={departmentMemberColumns}
            className="morning-board-table"
            scroll={{ x: 760 }}
          />
        )}
      </Modal>

      <Modal
        title={`有安排待填报成员（${noFillMembers.length}）`}
        open={unfilledModalOpen}
        onCancel={() => setUnfilledModalOpen(false)}
        onOk={() => setUnfilledModalOpen(false)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        width={840}
      >
        {noFillMembers.length === 0 ? (
          <Empty description="今天有安排成员均已填报" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey={(record) => record.key}
            size="small"
            pagination={false}
            dataSource={noFillByDepartmentRows}
            columns={departmentMemberColumns}
            className="morning-board-table"
            scroll={{ x: 760 }}
          />
        )}
      </Modal>

      <Modal
        title={`${currentHoursDetailTitle}（${currentHoursTotal.toFixed(1)}h）`}
        open={hoursDetailModal.open}
        onCancel={() => setHoursDetailModal((prev) => ({ ...prev, open: false }))}
        footer={null}
        width={920}
      >
        {currentHoursDetailItems.length === 0 ? (
          <Empty description="当前没有可校准的明细事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey={(record) => `${hoursDetailModal.type}-${record.id}`}
            size="small"
            pagination={false}
            dataSource={currentHoursDetailItems}
            scroll={{ x: 760 }}
            columns={[
              {
                title: '事项',
                key: 'item',
                render: (_, record) => (
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{record.description || record.item_type_name || '-'}</div>
                    <div style={{ fontSize: 12, color: '#667085' }}>
                      {record.item_type_name || '-'} · #{record.id}
                    </div>
                  </div>
                ),
              },
              {
                title: '需求',
                key: 'demand',
                width: 180,
                render: (_, record) => renderDemandNameWithLimit(record.demand_name || record.demand_id, 24, record.demand_id),
              },
              {
                title: '阶段',
                dataIndex: 'phase_name',
                key: 'phase_name',
                width: 160,
                render: (value) => value || '-',
              },
              {
                title: '负责人',
                dataIndex: 'username',
                key: 'username',
                width: 120,
                render: (value) => value || '-',
              },
              {
                title: hoursDetailModal.type === 'actual' ? '今日实际(h)' : '今日计划(h)',
                key: 'hours',
                width: 120,
                render: (_, record) => toNumber(record?.[currentHoursField], 0).toFixed(1),
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <Text strong>合计</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text strong>{currentHoursTotal.toFixed(1)}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        )}
      </Modal>

    </div>
  )
}

export default MorningStandupBoard
