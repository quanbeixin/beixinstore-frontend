import {
  BugOutlined,
  FilterOutlined,
  PaperClipOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../../api/configDict'
import {
  createBugApi,
  getBugAssigneesApi,
  getBugByIdApi,
  getBugWorkflowConfigApi,
  getDemandBugsApi,
  getDemandBugStatsApi,
  transitionBugApi,
  updateBugApi,
} from '../../../api/bug'
import { hasPermission } from '../../../utils/access'
import { formatBeijingDateTime } from '../../../utils/datetime'
import { pinyinSelectFilter } from '../../../utils/selectSearch'
import { uploadDraftAttachments } from '../utils/attachmentUpload'
import { replacePendingDescriptionImages, stripPendingDescriptionImages } from '../utils/descriptionRichText'
import { buildWorkflowTransitionMap, normalizeBugWorkflowTransitions } from '../utils/workflow'
import BugFormModal from './BugFormModal'
import './demand-bug-panel.css'

const { Text } = Typography
const { RangePicker } = DatePicker
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i
const VIDEO_EXT_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i
const GROUP_FETCH_PAGE_SIZE = 100
const GROUP_FETCH_LIMIT = 1000
const DEMAND_BUG_PANEL_VIEW_STATE_KEY_PREFIX = 'demand_bug_panel_view_state'
const GROUP_FIELD_OPTIONS = [
  { label: '状态', value: 'status' },
  { label: '提交人', value: 'reporter' },
  { label: 'Bug分类', value: 'bug_type' },
  { label: '优先级', value: 'priority' },
]
const GROUP_FIELD_LABEL_MAP = GROUP_FIELD_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

function normalizeActionKey(value) {
  return String(value || '').trim().toLowerCase()
}

function isNoFixTransition(transition = {}) {
  const toStatus = String(transition?.to_status_code || '').trim().toUpperCase()
  const actionKey = normalizeActionKey(transition?.action_key || transition?.action)
  if (toStatus === 'NO_FIX') return true
  return actionKey === 'no_fix' || actionKey === 'no-fix' || actionKey === 'nofix'
}

function readDemandBugPanelViewState(storageKey) {
  if (typeof window === 'undefined' || !storageKey) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const createdRange = Array.isArray(parsed?.createdRange) ? parsed.createdRange : []
    const normalizedRange =
      createdRange.length === 2 && createdRange[0] && createdRange[1]
        ? [dayjs(createdRange[0]), dayjs(createdRange[1])]
        : null
    return {
      searchInput: String(parsed?.searchInput || ''),
      keyword: String(parsed?.keyword || ''),
      statusFilter: String(parsed?.statusFilter || ''),
      severityFilter: String(parsed?.severityFilter || ''),
      issueStageFilter: String(parsed?.issueStageFilter || ''),
      groupFields: Array.isArray(parsed?.groupFields)
        ? parsed.groupFields.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      assigneeFilter:
        Number.isInteger(Number(parsed?.assigneeFilter)) && Number(parsed?.assigneeFilter) > 0
          ? Number(parsed.assigneeFilter)
          : undefined,
      reporterFilter:
        Number.isInteger(Number(parsed?.reporterFilter)) && Number(parsed?.reporterFilter) > 0
          ? Number(parsed.reporterFilter)
          : undefined,
      createdRange:
        normalizedRange && normalizedRange.every((item) => item?.isValid?.()) ? normalizedRange : null,
      page: Number.isInteger(Number(parsed?.page)) && Number(parsed?.page) > 0 ? Number(parsed.page) : 1,
      pageSize:
        Number.isInteger(Number(parsed?.pageSize)) && Number(parsed?.pageSize) > 0 ? Number(parsed.pageSize) : 20,
    }
  } catch {
    return null
  }
}

function writeDemandBugPanelViewState(storageKey, payload = null) {
  if (typeof window === 'undefined' || !storageKey) return
  try {
    if (!payload) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        searchInput: String(payload?.searchInput || ''),
        keyword: String(payload?.keyword || ''),
        statusFilter: String(payload?.statusFilter || ''),
        severityFilter: String(payload?.severityFilter || ''),
        issueStageFilter: String(payload?.issueStageFilter || ''),
        groupFields: Array.isArray(payload?.groupFields)
          ? payload.groupFields.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        assigneeFilter:
          Number.isInteger(Number(payload?.assigneeFilter)) && Number(payload?.assigneeFilter) > 0
            ? Number(payload.assigneeFilter)
            : null,
        reporterFilter:
          Number.isInteger(Number(payload?.reporterFilter)) && Number(payload?.reporterFilter) > 0
            ? Number(payload.reporterFilter)
            : null,
        createdRange:
          Array.isArray(payload?.createdRange) && payload.createdRange.length === 2
            ? payload.createdRange.map((item) => (item?.format ? item.format('YYYY-MM-DD') : ''))
            : [],
        page: Number.isInteger(Number(payload?.page)) && Number(payload?.page) > 0 ? Number(payload.page) : 1,
        pageSize:
          Number.isInteger(Number(payload?.pageSize)) && Number(payload?.pageSize) > 0 ? Number(payload.pageSize) : 20,
      }),
    )
  } catch {
    // 忽略存储失败，避免影响主流程
  }
}

function getAttachmentUrl(row) {
  return String(row?.download_url || row?.object_url || '').trim()
}

function isImageAttachment(row) {
  const mimeType = String(row?.mime_type || '').trim().toLowerCase()
  if (mimeType.startsWith('image/')) return true

  const fileExt = String(row?.file_ext || '').trim().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(fileExt)) return true

  const fileName = String(row?.file_name || '').trim()
  const objectUrl = getAttachmentUrl(row)
  return IMAGE_EXT_PATTERN.test(fileName) || IMAGE_EXT_PATTERN.test(objectUrl)
}

function isVideoAttachment(row) {
  const mimeType = String(row?.mime_type || '').trim().toLowerCase()
  if (mimeType.startsWith('video/')) return true

  const fileExt = String(row?.file_ext || '').trim().toLowerCase()
  if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(fileExt)) return true

  const fileName = String(row?.file_name || '').trim()
  const objectUrl = getAttachmentUrl(row)
  return VIDEO_EXT_PATTERN.test(fileName) || VIDEO_EXT_PATTERN.test(objectUrl)
}

function mapDictOptions(rows) {
  return [{ label: '全部', value: '' }].concat(
    (rows || []).map((item) => ({
      label: item?.item_name || item?.item_code || '-',
      value: item?.item_code,
    })),
  )
}

function mapSegmentedOptions(rows) {
  return [{ label: '全部状态', value: '' }].concat(
    (rows || []).map((item) => ({
      label: item?.item_name || item?.item_code || '-',
      value: item?.item_code || '',
    })),
  )
}

function resolveGroupBucket(field, row) {
  if (field === 'status') {
    const code = String(row?.status_code || 'UNSET').trim().toUpperCase() || 'UNSET'
    const label = String(row?.status_name || row?.status_code || '未设置').trim() || '未设置'
    return { key: code, value: label }
  }
  if (field === 'reporter') {
    const userId = Number(row?.reporter_id || 0)
    const label = String(row?.reporter_name || '').trim() || '未填写'
    return { key: userId > 0 ? String(userId) : label, value: label }
  }
  if (field === 'bug_type') {
    const code = String(row?.bug_type_code || 'UNSET').trim().toUpperCase() || 'UNSET'
    const label = String(row?.bug_type_name || row?.bug_type_code || '未分类').trim() || '未分类'
    return { key: code, value: label }
  }
  if (field === 'priority') {
    const code = String(row?.priority_code || 'UNSET').trim().toUpperCase() || 'UNSET'
    const label = String(row?.priority_name || row?.priority_code || '未设置').trim() || '未设置'
    return { key: code, value: label }
  }
  return { key: 'UNKNOWN', value: '未分组' }
}

function sortGroupedBuckets(field, groups, statusGroupOrderMap = {}) {
  return [...groups].sort((a, b) => {
    if (field === 'status') {
      const leftRank = Number(statusGroupOrderMap?.[String(a?.key || '').trim().toUpperCase()])
      const rightRank = Number(statusGroupOrderMap?.[String(b?.key || '').trim().toUpperCase()])
      const normalizedLeftRank = Number.isFinite(leftRank) ? leftRank : Number.MAX_SAFE_INTEGER
      const normalizedRightRank = Number.isFinite(rightRank) ? rightRank : Number.MAX_SAFE_INTEGER
      if (normalizedLeftRank !== normalizedRightRank) return normalizedLeftRank - normalizedRightRank
    }
    return String(a?.value || '').localeCompare(String(b?.value || ''), 'zh-Hans-CN')
  })
}

function buildGroupedTreeRows(sourceRows, groupFields, level = 0, parentKey = 'root', statusGroupOrderMap = {}) {
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) return []
  if (!Array.isArray(groupFields) || level >= groupFields.length) {
    return sourceRows.map((row) => ({
      ...row,
      __isGroup: false,
      __rowKey: `bug-${row?.id || row?.bug_no || row?.title || 'unknown'}`,
    }))
  }

  const field = groupFields[level]
  const groupMap = new Map()
  sourceRows.forEach((row) => {
    const bucket = resolveGroupBucket(field, row)
    const mapKey = `${field}:${bucket.key}`
    const existing = groupMap.get(mapKey)
    if (existing) {
      existing.rows.push(row)
      return
    }
    groupMap.set(mapKey, {
      key: bucket.key,
      value: bucket.value,
      rows: [row],
    })
  })

  return sortGroupedBuckets(field, Array.from(groupMap.values()), statusGroupOrderMap)
    .map((group, index) => {
      const groupKey = `group-${parentKey}-${field}-${group.key}-${index}`
      return {
        __isGroup: true,
        __rowKey: groupKey,
        __groupField: field,
        __groupFieldLabel: GROUP_FIELD_LABEL_MAP[field] || '分组',
        __groupValue: group.value,
        __groupCount: group.rows.length,
        children: buildGroupedTreeRows(group.rows, groupFields, level + 1, groupKey, statusGroupOrderMap),
      }
    })
}

function DemandBugPanel({ demandId, initialViewState = null, onViewStateChange = null }) {
  const navigate = useNavigate()
  const canCreate = hasPermission('bug.create')
  const canTransition = hasPermission('bug.transition')
  const viewStateStorageKey = demandId ? `${DEMAND_BUG_PANEL_VIEW_STATE_KEY_PREFIX}:${demandId}` : ''

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [issueStageFilter, setIssueStageFilter] = useState('')
  const [groupFields, setGroupFields] = useState([])
  const [groupLimitExceeded, setGroupLimitExceeded] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState()
  const [reporterFilter, setReporterFilter] = useState()
  const [createdRange, setCreatedRange] = useState(null)
  const [userOptions, setUserOptions] = useState([])
  const [userOptionsLoading, setUserOptionsLoading] = useState(false)
  const [statusSegmentOptions, setStatusSegmentOptions] = useState([{ label: '全部状态', value: '' }])
  const [statusNameMap, setStatusNameMap] = useState({})
  const [statusGroupOrderMap, setStatusGroupOrderMap] = useState({})
  const [severityOptions, setSeverityOptions] = useState([{ label: '全部', value: '' }])
  const [issueStageOptions, setIssueStageOptions] = useState([{ label: '全部', value: '' }])
  const [workflowTransitions, setWorkflowTransitions] = useState([])
  const [attachmentPreviewMap, setAttachmentPreviewMap] = useState({})
  const [attachmentPreviewLoadingMap, setAttachmentPreviewLoadingMap] = useState({})
  const [activeAttachmentBugId, setActiveAttachmentBugId] = useState(0)
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false)
  const [attachmentModalType, setAttachmentModalType] = useState('image')
  const [attachmentModalSrc, setAttachmentModalSrc] = useState('')
  const [attachmentModalTitle, setAttachmentModalTitle] = useState('')
  const [statusUpdatingMap, setStatusUpdatingMap] = useState({})
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    bug: null,
    transition: null,
  })
  const [transitionForm] = Form.useForm()
  const groupingLimitWarnedRef = useRef(false)
  const hasHydratedViewStateRef = useRef(false)
  const initialViewStateRef = useRef(initialViewState)

  useEffect(() => {
    initialViewStateRef.current = initialViewState
  }, [initialViewState])

  const openAttachmentPreview = useCallback(({ src, type = 'image', title = '附件预览' }) => {
    if (!src) {
      message.warning('当前附件暂不支持预览')
      return
    }
    setAttachmentModalSrc(src)
    setAttachmentModalType(type)
    setAttachmentModalTitle(title)
    setAttachmentModalOpen(true)
  }, [])

  const isGroupingEnabled = groupFields.length > 0
  const workflowTransitionMap = useMemo(
    () => buildWorkflowTransitionMap(workflowTransitions),
    [workflowTransitions],
  )

  const loadDicts = useCallback(async () => {
    try {
      const [statusRes, severityRes, stageRes] = await Promise.all([
        getDictItemsApi('bug_status', { enabledOnly: true }),
        getDictItemsApi('bug_severity', { enabledOnly: true }),
        getDictItemsApi('bug_stage', { enabledOnly: true }),
      ])
      const statusRows = statusRes?.data || []
      setStatusSegmentOptions(mapSegmentedOptions(statusRows))
      setStatusNameMap(
        (statusRows || []).reduce((acc, item) => {
          const code = String(item?.item_code || '').trim().toUpperCase()
          if (!code) return acc
          acc[code] = item?.item_name || item?.item_code || code
          return acc
        }, {}),
      )
      setStatusGroupOrderMap(
        (statusRows || []).reduce((acc, item, index) => {
          const code = String(item?.item_code || '').trim().toUpperCase()
          if (!code) return acc
          const sortOrder = Number(item?.sort_order)
          acc[code] = Number.isFinite(sortOrder) ? sortOrder : index
          return acc
        }, {}),
      )
      setSeverityOptions(mapDictOptions(severityRes?.data || []))
      setIssueStageOptions(mapDictOptions(stageRes?.data || []))
    } catch (error) {
      message.error(error?.message || '加载Bug筛选项失败')
    }
  }, [])

  const loadUserOptions = useCallback(async () => {
    setUserOptionsLoading(true)
    try {
      const result = await getBugAssigneesApi()
      const rows = Array.isArray(result?.data) ? result.data : []
      setUserOptions(
        rows
          .map((item) => {
            const userId = Number(item?.id || 0)
            if (!userId) return null
            const name = String(item?.name || '').trim()
            const username = String(item?.username || '').trim()
            const label = username && username !== name ? `${name} (${username})` : name || username || `用户${userId}`
            return {
              label,
              value: userId,
              searchText: `${name} ${username}`.trim(),
            }
          })
          .filter(Boolean),
      )
    } catch (error) {
      message.error(error?.message || '加载人员筛选项失败')
    } finally {
      setUserOptionsLoading(false)
    }
  }, [])

  const loadWorkflowConfig = useCallback(async () => {
    try {
      const result = await getBugWorkflowConfigApi()
      if (!result?.success) {
        throw new Error(result?.message || '加载Bug流程配置失败')
      }
      setWorkflowTransitions(normalizeBugWorkflowTransitions(result?.data?.transitions || []))
    } catch (error) {
      message.warning(error?.message || '加载Bug流程配置失败，已使用默认流程')
      setWorkflowTransitions(normalizeBugWorkflowTransitions([]))
    }
  }, [])

  const buildListQueryParams = useCallback(
    () => ({
      keyword: keyword || undefined,
      status_code: statusFilter || undefined,
      severity_code: severityFilter || undefined,
      issue_stage: issueStageFilter || undefined,
      assignee_id: assigneeFilter || undefined,
      reporter_id: reporterFilter || undefined,
      start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || undefined,
      end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || undefined,
    }),
    [assigneeFilter, createdRange, issueStageFilter, keyword, reporterFilter, severityFilter, statusFilter],
  )

  const loadStats = useCallback(async () => {
    if (!demandId) return
    try {
      const result = await getDemandBugStatsApi(demandId)
      if (!result?.success) {
        message.error(result?.message || '获取需求Bug统计失败')
        return
      }
      setStats(Array.isArray(result?.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取需求Bug统计失败')
    }
  }, [demandId])

  const loadBugs = useCallback(async () => {
    if (!demandId) return
    setLoading(true)
    try {
      const baseParams = buildListQueryParams()
      if (isGroupingEnabled) {
        let currentPage = 1
        let serverTotal = 0
        let collectedRows = []
        let truncated = false

        while (currentPage <= 100) {
          const result = await getDemandBugsApi(demandId, {
            ...baseParams,
            page: currentPage,
            pageSize: GROUP_FETCH_PAGE_SIZE,
          })
          if (!result?.success) {
            message.error(result?.message || '获取需求Bug列表失败')
            return
          }

          const pageRows = Array.isArray(result?.data?.rows) ? result.data.rows : []
          serverTotal = Number(result?.data?.total || 0)
          collectedRows = collectedRows.concat(pageRows)

          if (collectedRows.length >= GROUP_FETCH_LIMIT) {
            truncated = serverTotal > GROUP_FETCH_LIMIT
            collectedRows = collectedRows.slice(0, GROUP_FETCH_LIMIT)
            break
          }
          if (collectedRows.length >= serverTotal || pageRows.length === 0) break
          currentPage += 1
        }

        setRows(collectedRows)
        setTotal(serverTotal || collectedRows.length)
        setGroupLimitExceeded(truncated)
        if (truncated && !groupingLimitWarnedRef.current) {
          message.warning(`分组模式最多展示前 ${GROUP_FETCH_LIMIT} 条，请增加筛选条件后重试`)
          groupingLimitWarnedRef.current = true
        }
        if (!truncated) {
          groupingLimitWarnedRef.current = false
        }
        return
      }

      const result = await getDemandBugsApi(demandId, {
        ...baseParams,
        page,
        pageSize,
      })
      if (!result?.success) {
        message.error(result?.message || '获取需求Bug列表失败')
        return
      }
      setRows(Array.isArray(result?.data?.rows) ? result.data.rows : [])
      setTotal(Number(result?.data?.total || 0))
      setGroupLimitExceeded(false)
      groupingLimitWarnedRef.current = false
    } catch (error) {
      message.error(error?.message || '获取需求Bug列表失败')
    } finally {
      setLoading(false)
    }
  }, [buildListQueryParams, demandId, isGroupingEnabled, page, pageSize])

  useEffect(() => {
    loadDicts()
    loadUserOptions()
    loadWorkflowConfig()
  }, [loadDicts, loadUserOptions, loadWorkflowConfig])

  useEffect(() => {
    if (!demandId) {
      hasHydratedViewStateRef.current = false
      return
    }
    const routeState = initialViewStateRef.current
    const cachedState = routeState || readDemandBugPanelViewState(viewStateStorageKey)
    setSearchInput(String(cachedState?.searchInput || ''))
    setKeyword(String(cachedState?.keyword || ''))
    setStatusFilter(String(cachedState?.statusFilter || ''))
    setSeverityFilter(String(cachedState?.severityFilter || ''))
    setIssueStageFilter(String(cachedState?.issueStageFilter || ''))
    setGroupFields(Array.isArray(cachedState?.groupFields) ? cachedState.groupFields : [])
    setAssigneeFilter(cachedState?.assigneeFilter)
    setReporterFilter(cachedState?.reporterFilter)
    setCreatedRange(cachedState?.createdRange || null)
    setPage(Number(cachedState?.page || 1))
    setPageSize(Number(cachedState?.pageSize || 20))
    hasHydratedViewStateRef.current = true
  }, [demandId, viewStateStorageKey])

  const serializedViewState = useMemo(
    () => ({
      searchInput: String(searchInput || ''),
      keyword: String(keyword || ''),
      statusFilter: String(statusFilter || ''),
      severityFilter: String(severityFilter || ''),
      issueStageFilter: String(issueStageFilter || ''),
      groupFields: Array.isArray(groupFields) ? groupFields.map((item) => String(item || '').trim()).filter(Boolean) : [],
      assigneeFilter:
        Number.isInteger(Number(assigneeFilter)) && Number(assigneeFilter) > 0 ? Number(assigneeFilter) : null,
      reporterFilter:
        Number.isInteger(Number(reporterFilter)) && Number(reporterFilter) > 0 ? Number(reporterFilter) : null,
      createdRange:
        Array.isArray(createdRange) && createdRange.length === 2
          ? createdRange.map((item) => (item?.format ? item.format('YYYY-MM-DD') : ''))
          : [],
      page: Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1,
      pageSize: Number.isInteger(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 20,
    }),
    [
      assigneeFilter,
      createdRange,
      groupFields,
      issueStageFilter,
      keyword,
      page,
      pageSize,
      reporterFilter,
      searchInput,
      severityFilter,
      statusFilter,
    ],
  )

  useEffect(() => {
    if (!demandId || !hasHydratedViewStateRef.current) return
    writeDemandBugPanelViewState(viewStateStorageKey, serializedViewState)
    onViewStateChange?.(serializedViewState)
  }, [demandId, onViewStateChange, serializedViewState, viewStateStorageKey])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    if (!hasHydratedViewStateRef.current) return
    loadBugs()
  }, [loadBugs])

  const activeFilterCount = useMemo(
    () =>
      [
        keyword,
        statusFilter,
        severityFilter,
        issueStageFilter,
        assigneeFilter,
        reporterFilter,
        Array.isArray(createdRange) && createdRange.length === 2 ? 'created_range' : '',
      ].filter(Boolean).length,
    [assigneeFilter, createdRange, issueStageFilter, keyword, reporterFilter, severityFilter, statusFilter],
  )

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('')
    setSeverityFilter('')
    setIssueStageFilter('')
    setAssigneeFilter(undefined)
    setReporterFilter(undefined)
    setCreatedRange(null)
    setGroupFields([])
    setPage(1)
    setPageSize(20)
  }, [])

  const tableDataSource = useMemo(() => {
    if (!isGroupingEnabled) return rows
    return buildGroupedTreeRows(rows, groupFields, 0, 'root', statusGroupOrderMap)
  }, [groupFields, isGroupingEnabled, rows, statusGroupOrderMap])

  const loadBugAttachments = useCallback(
    async (bugId, { force = false } = {}) => {
      const normalizedBugId = Number(bugId || 0)
      if (!normalizedBugId) return
      if (!force && Array.isArray(attachmentPreviewMap[normalizedBugId])) return

      setAttachmentPreviewLoadingMap((prev) => ({
        ...prev,
        [normalizedBugId]: true,
      }))
      try {
        const result = await getBugByIdApi(normalizedBugId)
        if (!result?.success) {
          throw new Error(result?.message || '加载附件失败')
        }
        setAttachmentPreviewMap((prev) => ({
          ...prev,
          [normalizedBugId]: Array.isArray(result?.data?.attachments) ? result.data.attachments : [],
        }))
      } catch (error) {
        message.error(error?.message || '加载附件失败')
      } finally {
        setAttachmentPreviewLoadingMap((prev) => ({
          ...prev,
          [normalizedBugId]: false,
        }))
      }
    },
    [attachmentPreviewMap],
  )

  const renderAttachmentPreviewContent = useCallback(
    (row) => {
      const bugId = Number(row?.id || 0)
      const loading = Boolean(attachmentPreviewLoadingMap[bugId])
      const attachments = attachmentPreviewMap[bugId]

      if (loading && !Array.isArray(attachments)) {
        return (
          <div className="demand-bug-panel__attachment-loading">
            <Spin size="small" />
            <Text type="secondary">附件加载中...</Text>
          </div>
        )
      }

      if (!Array.isArray(attachments) || attachments.length === 0) {
        return (
          <div className="demand-bug-panel__attachment-empty">
            <Text type="secondary">暂无附件</Text>
          </div>
        )
      }

      return (
        <div className="demand-bug-panel__attachment-preview">
          {attachments.slice(0, 6).map((attachment) => {
            const fileUrl = getAttachmentUrl(attachment)
            const imageAttachment = Boolean(fileUrl) && isImageAttachment(attachment)
            const videoAttachment = Boolean(fileUrl) && isVideoAttachment(attachment)
            const previewable = imageAttachment || videoAttachment
            return (
              <div
                className="demand-bug-panel__attachment-item"
                key={attachment.id || `${attachment.file_name}-${attachment.object_key}`}
              >
                {imageAttachment ? (
                  <Image
                    className="demand-bug-panel__attachment-thumb"
                    width={44}
                    height={44}
                    src={fileUrl}
                    alt={attachment?.file_name || '附件缩略图'}
                    preview={{
                      zIndex: 2100,
                      cover: <span className="demand-bug-panel__image-mask-hint">放大</span>,
                    }}
                  />
                ) : videoAttachment ? (
                  <button
                    type="button"
                    className="demand-bug-panel__attachment-fallback demand-bug-panel__attachment-fallback--video"
                    onClick={() =>
                      openAttachmentPreview({
                        src: fileUrl,
                        type: 'video',
                        title: attachment?.file_name || '视频附件预览',
                      })
                    }
                  >
                    <PlayCircleOutlined />
                  </button>
                ) : (
                  <div className="demand-bug-panel__attachment-fallback">文</div>
                )}
                {previewable ? (
                  <button
                    type="button"
                    className="demand-bug-panel__attachment-name demand-bug-panel__attachment-name--button"
                    title={attachment?.file_name || ''}
                    onClick={() =>
                      openAttachmentPreview({
                        src: fileUrl,
                        type: videoAttachment ? 'video' : 'image',
                        title: attachment?.file_name || '附件预览',
                      })
                    }
                  >
                    {attachment?.file_name || '-'}
                  </button>
                ) : (
                  <span className="demand-bug-panel__attachment-name demand-bug-panel__attachment-name--disabled">
                    {attachment?.file_name || '-'}
                  </span>
                )}
              </div>
            )
          })}
          {attachments.length > 6 ? (
            <Button
              type="link"
              size="small"
              className="demand-bug-panel__attachment-more"
              onClick={() => navigate(`/bugs/${bugId}`)}
            >
              查看全部 {attachments.length} 个附件
            </Button>
          ) : null}
        </div>
      )
    },
    [attachmentPreviewLoadingMap, attachmentPreviewMap, navigate, openAttachmentPreview],
  )

  const getQuickStatusOptions = useCallback(
    (row) => {
      const currentStatus = String(row?.status_code || '').trim().toUpperCase()
      const currentStatusName =
        String(row?.status_name || '').trim() || statusNameMap[currentStatus] || currentStatus || '-'
      const transitions = workflowTransitionMap.get(currentStatus) || []
      const options = [{ label: currentStatusName, value: currentStatus, disabled: true }]
      transitions.forEach((item) => {
        const statusCode = String(item?.to_status_code || '').trim().toUpperCase()
        if (!statusCode) return
        const statusName = statusNameMap[statusCode] || statusCode
        const requiredLabels = []
        if (Number(item?.require_remark) === 1) requiredLabels.push('备注')
        if (Number(item?.require_fix_solution) === 1 && !isNoFixTransition(item)) requiredLabels.push('修复方案&影响范围')
        const suffix = requiredLabels.length > 0 ? `（需填写${requiredLabels.join('、')}）` : ''
        options.push({
          label: `${String(item?.action_name || '').trim() || statusName}${suffix}`,
          value: statusCode,
        })
      })
      return options
    },
    [statusNameMap, workflowTransitionMap],
  )

  const runQuickTransition = useCallback(
    async (bug, transition, extraPayload = {}) => {
      const bugId = Number(bug?.id || 0)
      const actionKey = String(transition?.action_key || transition?.action || '').trim().toLowerCase()
      const toStatusCode = String(transition?.to_status_code || '').trim().toUpperCase()
      if (!bugId || !actionKey || !toStatusCode) return
      try {
        setStatusUpdatingMap((prev) => ({ ...prev, [bugId]: true }))
        const payload = {
          action_key: actionKey,
          to_status_code: toStatusCode,
          remark: extraPayload.remark || undefined,
          fix_solution: extraPayload.fix_solution || undefined,
        }
        const result = await transitionBugApi(bugId, payload)
        if (!result?.success) {
          message.error(result?.message || '状态更新失败')
          return
        }
        message.success(result?.message || '状态更新成功')
        await Promise.all([loadBugs(), loadStats()])
      } catch (error) {
        message.error(error?.message || '状态更新失败')
      } finally {
        setStatusUpdatingMap((prev) => ({ ...prev, [bugId]: false }))
      }
    },
    [loadBugs, loadStats],
  )

  const handleQuickStatusChange = useCallback(
    async (row, nextStatusCode) => {
      const currentStatus = String(row?.status_code || '').trim().toUpperCase()
      const nextStatus = String(nextStatusCode || '').trim().toUpperCase()
      if (!currentStatus || !nextStatus || currentStatus === nextStatus) return
      const transition = (workflowTransitionMap.get(currentStatus) || []).find(
        (item) => String(item?.to_status_code || '').trim().toUpperCase() === nextStatus,
      )
      if (!transition) {
        message.warning('当前状态不支持直接切换到目标状态')
        return
      }
      const requireAnyField =
        Number(transition?.require_remark) === 1 ||
        (Number(transition?.require_fix_solution) === 1 && !isNoFixTransition(transition))
      if (requireAnyField) {
        transitionForm.resetFields()
        setStatusDialog({ open: true, bug: row, transition })
        return
      }
      await runQuickTransition(row, transition)
    },
    [runQuickTransition, transitionForm, workflowTransitionMap],
  )

  const submitQuickTransitionWithForm = useCallback(async () => {
    const bug = statusDialog.bug
    const transition = statusDialog.transition
    if (!bug || !transition) return
    try {
      const values = await transitionForm.validateFields()
      const payload = {
        remark: String(values.remark || '').trim(),
        fix_solution: String(values.fix_solution || '').trim(),
      }
      await runQuickTransition(bug, transition, payload)
      setStatusDialog({ open: false, bug: null, transition: null })
      transitionForm.resetFields()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '状态更新失败')
    }
  }, [runQuickTransition, statusDialog.bug, statusDialog.transition, transitionForm])

  const columns = useMemo(
    () => [
      {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        width: 280,
        ellipsis: true,
        onCell: () => ({ style: { minWidth: 280 } }),
        render: (value, row) => {
          if (row?.__isGroup) {
            return (
              <Space size={6} className="demand-bug-panel__group-title">
                <Tag color="blue">{row.__groupFieldLabel || '分组'}</Tag>
                <Text strong>{row.__groupValue || '-'}</Text>
                <Text type="secondary">({row.__groupCount || 0})</Text>
              </Space>
            )
          }
          return (
            <Button
              type="link"
              size="small"
              className="demand-bug-panel__title-link"
              onClick={() => navigate(`/bugs/${row.id}`)}
            >
              {value || '-'}
            </Button>
          )
        },
      },
      {
        title: '状态',
        dataIndex: 'status_name',
        key: 'status_name',
        width: 170,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          if (!canTransition) {
            return <Tag color={row.status_color || 'default'}>{value || row.status_code || '-'}</Tag>
          }
          const bugId = Number(row?.id || 0)
          return (
            <Select
              size="small"
              value={String(row?.status_code || '').trim().toUpperCase() || undefined}
              options={getQuickStatusOptions(row)}
              onChange={(nextValue) => {
                void handleQuickStatusChange(row, nextValue)
              }}
              disabled={Boolean(statusUpdatingMap[bugId])}
              loading={Boolean(statusUpdatingMap[bugId])}
              style={{ width: 150 }}
            />
          )
        },
      },
      {
        title: '严重程度',
        dataIndex: 'severity_name',
        key: 'severity_name',
        width: 110,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return <Tag color={row.severity_color || 'default'}>{value || row.severity_code || '-'}</Tag>
        },
      },
      {
        title: 'Bug分类',
        dataIndex: 'bug_type_name',
        key: 'bug_type_name',
        width: 130,
        ellipsis: true,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return value || row.bug_type_code || '-'
        },
      },
      {
        title: 'Bug阶段',
        dataIndex: 'issue_stage_name',
        key: 'issue_stage_name',
        width: 130,
        ellipsis: true,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return <Tag color={row.issue_stage_color || 'default'}>{value || row.issue_stage || '-'}</Tag>
        },
      },
      {
        title: '附件',
        dataIndex: 'attachment_count',
        key: 'attachment_count',
        width: 130,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          const bugId = Number(row?.id || 0)
          const attachmentCount = Math.max(0, Number(value || 0))
          return (
            <Popover
              trigger={['hover', 'click']}
              placement="leftTop"
              mouseEnterDelay={0.2}
              overlayClassName="demand-bug-panel__attachment-popover"
              open={activeAttachmentBugId === bugId}
              onOpenChange={(open) => {
                if (!bugId) return
                if (open) {
                  setActiveAttachmentBugId(bugId)
                  void loadBugAttachments(bugId, { force: true })
                  return
                }
                setActiveAttachmentBugId((prev) => (prev === bugId ? 0 : prev))
              }}
              content={renderAttachmentPreviewContent(row)}
            >
              <Button type="link" size="small" icon={<PaperClipOutlined />} className="demand-bug-panel__attachment-link">
                {attachmentCount > 0 ? `${attachmentCount} 个` : '查看'}
              </Button>
            </Popover>
          )
        },
      },
      {
        title: '处理人',
        dataIndex: 'assignee_names',
        key: 'assignee_names',
        width: 120,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return value || row.assignee_name || '-'
        },
      },
      {
        title: '关注人',
        dataIndex: 'watcher_names',
        key: 'watcher_names',
        width: 150,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return value || '-'
        },
      },
      {
        title: '发现人',
        dataIndex: 'reporter_name',
        key: 'reporter_name',
        width: 110,
        ellipsis: true,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return value || '-'
        },
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          return formatBeijingDateTime(value)
        },
      },
    ],
    [
      activeAttachmentBugId,
      canTransition,
      getQuickStatusOptions,
      handleQuickStatusChange,
      loadBugAttachments,
      navigate,
      renderAttachmentPreviewContent,
      statusUpdatingMap,
    ],
  )

  const statsTotal = useMemo(
    () => (stats || []).reduce((sum, item) => sum + Number(item?.total || 0), 0),
    [stats],
  )

  return (
    <div className="demand-bug-panel">
      <div className="demand-bug-panel__stats-row">
        <div className="demand-bug-panel__stat-card demand-bug-panel__stat-card--summary" data-status="SUMMARY">
          <div className="demand-bug-panel__stat-label">全部</div>
          <div className="demand-bug-panel__stat-value">{statsTotal}</div>
        </div>
        {(stats || []).map((item) => (
          <div
            className="demand-bug-panel__stat-card"
            data-status={String(item?.status_code || '').trim().toUpperCase() || 'DEFAULT'}
            key={item.status_code}
          >
            <div className="demand-bug-panel__stat-label">{item.status_name}</div>
            <div className="demand-bug-panel__stat-value">{item.total || 0}</div>
          </div>
        ))}
      </div>

      <Card
        size="small"
        className="demand-bug-panel__list-card"
        variant="borderless"
        title={
          <div className="demand-bug-panel__title-block">
            <Space size={10} className="demand-bug-panel__title-wrap">
              <span className="demand-bug-panel__title-icon" aria-hidden>
                <BugOutlined />
              </span>
              <span className="demand-bug-panel__title">关联Bug</span>
            </Space>
            <Text type="secondary" className="demand-bug-panel__subtitle">
              在需求上下文中直接筛选、分组、流转处理 Bug
            </Text>
          </div>
        }
        extra={
          <Space size={8} className="demand-bug-panel__header-actions">
            <Button icon={<ReloadOutlined />} onClick={() => {
              void Promise.all([loadBugs(), loadStats()])
            }}>
              刷新
            </Button>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建Bug
              </Button>
            ) : null}
          </Space>
        }
      >
        <div className="demand-bug-panel__filter-panel">
          <div className="demand-bug-panel__filter-row demand-bug-panel__filter-row--status">
            <Text strong className="demand-bug-panel__filter-label">
              状态筛选
            </Text>
            <Segmented
              size="small"
              value={statusFilter}
              options={statusSegmentOptions}
              onChange={(value) => {
                setStatusFilter(String(value || ''))
                setPage(1)
              }}
            />
          </div>

          <div className="demand-bug-panel__filter-row">
            <div className="demand-bug-panel__filter-item">
              <Text type="secondary" className="demand-bug-panel__filter-inline-label">
                优先级
              </Text>
              <Select
                size="small"
                showSearch
                className="demand-bug-panel__filter-control demand-bug-panel__filter-control--sm"
                value={severityFilter}
                options={severityOptions}
                filterOption={pinyinSelectFilter}
                placeholder="严重程度"
                onChange={(value) => {
                  setSeverityFilter(String(value || ''))
                  setPage(1)
                }}
              />
            </div>
            <div className="demand-bug-panel__filter-item">
              <Text type="secondary" className="demand-bug-panel__filter-inline-label">
                阶段
              </Text>
              <Select
                size="small"
                showSearch
                className="demand-bug-panel__filter-control demand-bug-panel__filter-control--sm"
                value={issueStageFilter}
                options={issueStageOptions}
                filterOption={pinyinSelectFilter}
                placeholder="Bug阶段"
                onChange={(value) => {
                  setIssueStageFilter(String(value || ''))
                  setPage(1)
                }}
              />
            </div>
            <Select
              size="small"
              showSearch
              allowClear
              className="demand-bug-panel__filter-control"
              value={assigneeFilter}
              options={userOptions}
              loading={userOptionsLoading}
              filterOption={pinyinSelectFilter}
              placeholder="处理人"
              onChange={(value) => {
                setAssigneeFilter(value)
                setPage(1)
              }}
            />
            <Select
              size="small"
              showSearch
              allowClear
              className="demand-bug-panel__filter-control"
              value={reporterFilter}
              options={userOptions}
              loading={userOptionsLoading}
              filterOption={pinyinSelectFilter}
              placeholder="发现人"
              onChange={(value) => {
                setReporterFilter(value)
                setPage(1)
              }}
            />
            <RangePicker
              size="small"
              className="demand-bug-panel__filter-control demand-bug-panel__date-range"
              value={createdRange}
              placeholder={['创建开始', '创建结束']}
              allowClear
              onChange={(values) => {
                setCreatedRange(values || null)
                setPage(1)
              }}
            />
            <Select
              size="small"
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              className="demand-bug-panel__filter-control demand-bug-panel__group-select"
              value={groupFields}
              options={GROUP_FIELD_OPTIONS}
              placeholder="分组展示（状态/提交人/Bug分类/优先级）"
              onChange={(values) => {
                setGroupFields(Array.isArray(values) ? values : [])
                setPage(1)
              }}
            />
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索编号、标题、描述"
              className="demand-bug-panel__keyword"
              value={searchInput}
              onChange={(event) => {
                const nextValue = event.target.value
                setSearchInput(nextValue)
                if (!nextValue) {
                  setKeyword('')
                  setPage(1)
                }
              }}
              onPressEnter={() => {
                setKeyword(String(searchInput || '').trim())
                setPage(1)
              }}
            />
            <Button
              size="small"
              type="primary"
              className="demand-bug-panel__query-btn"
              onClick={() => {
                setKeyword(String(searchInput || '').trim())
                setPage(1)
              }}
            >
              查询
            </Button>
            <Button
              size="small"
              icon={<FilterOutlined />}
              onClick={resetFilters}
            >
              清空筛选
            </Button>
            <Text type="secondary" className="demand-bug-panel__total">
              共 {total} 条
            </Text>
            {isGroupingEnabled ? (
              <Tag color="blue" className="demand-bug-panel__active-filter-tag">
                分组模式
              </Tag>
            ) : null}
            {groupLimitExceeded ? (
              <Tag color="gold" className="demand-bug-panel__active-filter-tag">
                仅展示前 {GROUP_FETCH_LIMIT} 条
              </Tag>
            ) : null}
            {activeFilterCount ? (
              <Tag color="processing" className="demand-bug-panel__active-filter-tag">
                已筛选 {activeFilterCount} 项
              </Tag>
            ) : null}
          </div>
        </div>

        <Table
          className="demand-bug-panel__table"
          rowKey={(record) => String(record?.__rowKey || `bug-${record?.id || ''}`)}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={tableDataSource}
          rowClassName={(record) => (record?.__isGroup ? 'demand-bug-panel__group-row' : '')}
          scroll={{ x: 1500 }}
          expandable={isGroupingEnabled ? { defaultExpandAllRows: false } : undefined}
          pagination={
            isGroupingEnabled
              ? false
              : {
                  current: page,
                  pageSize,
                  total,
                  size: 'small',
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (value) => `共 ${value} 条`,
                  pageSizeOptions: ['20', '50', '100'],
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage)
                    setPageSize(nextPageSize)
                  },
                }
          }
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前需求下暂无Bug记录" />,
          }}
        />
      </Card>

      <BugFormModal
        open={createOpen}
        title="新建关联Bug"
        submitText="创建"
        presentation="drawer"
        demandIdPreset={demandId}
        assigneeScope="all"
        confirmLoading={submitting}
        onCancel={() => setCreateOpen(false)}
        onSubmit={async (values, extra) => {
          setSubmitting(true)
          try {
            const baseDescription = stripPendingDescriptionImages(values.description)
            const pendingDescriptionImages = Array.isArray(extra?.pendingDescriptionImages) ? extra.pendingDescriptionImages : []
            const result = await createBugApi({
              ...values,
              description: baseDescription,
            })
            if (!result?.success) {
              message.error(result?.message || '创建Bug失败')
              return
            }
            const bugId = Number(result?.data?.id || 0)
            const draftAttachments = extra?.draftAttachments || []
            let uploadResult = { total: draftAttachments.length, successCount: 0, successes: [], failures: [] }
            if (bugId > 0 && draftAttachments.length > 0) {
              uploadResult = await uploadDraftAttachments(bugId, draftAttachments)
            }

            if (bugId > 0 && pendingDescriptionImages.length > 0) {
              const tokenAttachmentMap = new Map()
              const blobAttachmentMap = new Map()
              const attachmentBySignature = new Map(
                (Array.isArray(uploadResult.successes) ? uploadResult.successes : []).map((item) => [item.signature, item.attachment]),
              )
              pendingDescriptionImages.forEach((item) => {
                const token = String(item?.token || '').trim()
                const signature = String(item?.signature || '').trim()
                const objectUrl = String(item?.objectUrl || '').trim()
                if (!signature) return
                const attachment = attachmentBySignature.get(signature)
                if (!attachment) return
                if (token) tokenAttachmentMap.set(token, attachment)
                if (objectUrl) blobAttachmentMap.set(objectUrl, attachment)
              })
              const finalDescription = replacePendingDescriptionImages(values.description, tokenAttachmentMap, blobAttachmentMap)
              if (finalDescription && finalDescription !== baseDescription) {
                const updateResult = await updateBugApi(bugId, {
                  ...values,
                  description: finalDescription,
                  skip_notification: true,
                })
                if (!updateResult?.success) {
                  message.warning(updateResult?.message || 'Bug已创建，但描述中的图片回填失败')
                }
              }
            }

            if (draftAttachments.length > 0) {
              if (uploadResult.failures.length > 0) {
                message.warning(`Bug已创建，附件上传成功 ${uploadResult.successCount}/${uploadResult.total}，请在详情页补传失败附件`)
              } else {
                message.success(`Bug创建成功，已上传 ${uploadResult.successCount} 个附件`)
              }
            } else {
              message.success('Bug创建成功')
            }
            setCreateOpen(false)
            await Promise.all([loadBugs(), loadStats()])
          } catch (error) {
            message.error(error?.message || '创建Bug失败')
          } finally {
            setSubmitting(false)
          }
        }}
      />

      <Modal
        title="补充流转信息"
        open={statusDialog.open}
        className="demand-bug-panel__dialog"
        onCancel={() => {
          setStatusDialog({ open: false, bug: null, transition: null })
          transitionForm.resetFields()
        }}
        onOk={() => {
          void submitQuickTransitionWithForm()
        }}
        okText="确认更新"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={transitionForm} layout="vertical">
          {Number(statusDialog.transition?.require_remark) === 1 ? (
            <Form.Item label="备注" name="remark" rules={[{ required: true, message: '请输入备注' }]}>
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入备注信息" />
            </Form.Item>
          ) : null}
          {Number(statusDialog.transition?.require_fix_solution) === 1 && !isNoFixTransition(statusDialog.transition) ? (
            <Form.Item
              label="修复方案&影响范围"
              name="fix_solution"
              rules={[{ required: true, message: '请输入修复方案&影响范围' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入修复方案与影响范围" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={attachmentModalTitle || '附件预览'}
        open={attachmentModalOpen}
        footer={null}
        onCancel={() => setAttachmentModalOpen(false)}
        centered
        width={860}
        destroyOnHidden
      >
        {attachmentModalType === 'video' ? (
          <video className="demand-bug-panel__attachment-preview-video" src={attachmentModalSrc} controls preload="metadata" />
        ) : (
          <Image
            className="demand-bug-panel__attachment-preview-image"
            src={attachmentModalSrc}
            alt={attachmentModalTitle || '附件预览'}
            preview={{
              zIndex: 2100,
              cover: <span className="demand-bug-panel__image-mask-hint">点击放大</span>,
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default DemandBugPanel
