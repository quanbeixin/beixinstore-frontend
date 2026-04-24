import { BugOutlined, DeleteOutlined, FilterOutlined, LinkOutlined, PaperClipOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Empty, Form, Image, Input, Modal, Popconfirm, Popover, Segmented, Select, Space, Spin, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../api/configDict'
import { createBugApi, createBugViewApi, deleteBugViewApi, getBugAssigneesApi, getBugByIdApi, getBugViewByIdApi, getBugViewsApi, getBugWorkflowConfigApi, getBugsApi, transitionBugApi, updateBugApi, updateBugViewApi } from '../../api/bug'
import { getWorkDemandsApi } from '../../api/work'
import { getCurrentUser, hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import { BugFormModal } from '../../modules/bug'
import { uploadDraftAttachments } from '../../modules/bug/utils/attachmentUpload'
import { replacePendingDescriptionImages, stripPendingDescriptionImages } from '../../modules/bug/utils/descriptionRichText'
import { buildWorkflowTransitionMap, normalizeBugWorkflowTransitions } from '../../modules/bug/utils/workflow'
import './BugListPage.css'

const { Text } = Typography
const { RangePicker } = DatePicker
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i
const VIDEO_EXT_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i
const GROUP_FETCH_PAGE_SIZE = 100
const GROUP_FETCH_LIMIT = 1000
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
const BUG_VIEW_VISIBILITY_OPTIONS = [
  { label: '仅自己可见', value: 'PRIVATE' },
  { label: '共享给他人', value: 'SHARED' },
]
const BUG_VIEW_ALLOWED_PAGE_SIZE = new Set([20, 50, 100])
const DEFAULT_PAGE_TITLE = 'Bug管理'
const DEFAULT_PAGE_SUBTITLE = '一站式查看、筛选、分组与流转处理'

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
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

function mapDemandOptions(rows) {
  return (rows || [])
    .map((item) => {
      const demandId = String(item?.id || '').trim()
      if (!demandId) return null
      const demandName = String(item?.name || '').trim() || demandId
      const fullLabel = `${demandId} · ${demandName}`
      return {
        label: <span title={fullLabel}>{fullLabel}</span>,
        value: demandId,
        searchText: `${demandId} ${demandName}`.trim(),
      }
    })
    .filter(Boolean)
}

function normalizeViewConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const groupFields = (Array.isArray(source.group_fields) ? source.group_fields : [])
    .map((item) => String(item || '').trim())
    .filter((item, index, arr) => GROUP_FIELD_OPTIONS.some((option) => option.value === item) && arr.indexOf(item) === index)
    .slice(0, 3)
  const pageSize = Number(source.page_size || 0)
  return {
    keyword: String(source.keyword || '').trim(),
    status_code: String(source.status_code || '').trim().toUpperCase(),
    severity_code: String(source.severity_code || '').trim().toUpperCase(),
    issue_stage: String(source.issue_stage || '').trim().toUpperCase(),
    demand_id: String(source.demand_id || '').trim(),
    assignee_id: Number.isInteger(Number(source.assignee_id)) && Number(source.assignee_id) > 0 ? Number(source.assignee_id) : undefined,
    reporter_id: Number.isInteger(Number(source.reporter_id)) && Number(source.reporter_id) > 0 ? Number(source.reporter_id) : undefined,
    start_date: String(source.start_date || '').trim(),
    end_date: String(source.end_date || '').trim(),
    group_fields: groupFields,
    page_size: BUG_VIEW_ALLOWED_PAGE_SIZE.has(pageSize) ? pageSize : 20,
  }
}

function buildViewDateRange(config = {}) {
  const start = String(config.start_date || '').trim()
  const end = String(config.end_date || '').trim()
  if (!start || !end) return null
  const startValue = dayjs(start, 'YYYY-MM-DD')
  const endValue = dayjs(end, 'YYYY-MM-DD')
  if (!startValue.isValid() || !endValue.isValid()) return null
  return [startValue, endValue]
}

function parseGroupFieldsFromQuery(params) {
  if (!(params instanceof URLSearchParams)) return []
  const rawValues = params.getAll('group_fields').map((item) => String(item || '').trim()).filter(Boolean)
  if (rawValues.length === 0) return []
  if (rawValues.length === 1) {
    return rawValues[0]
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  return rawValues
}

function parseBugListQueryState(search, { forcedAssigneeId = null } = {}) {
  const params = new URLSearchParams(search || '')
  const config = normalizeViewConfig({
    keyword: params.get('keyword') || '',
    status_code: params.get('status_code') || '',
    severity_code: params.get('severity_code') || '',
    issue_stage: params.get('issue_stage') || '',
    demand_id: params.get('demand_id') || '',
    assignee_id: params.get('assignee_id') || '',
    reporter_id: params.get('reporter_id') || '',
    start_date: params.get('start_date') || '',
    end_date: params.get('end_date') || '',
    group_fields: parseGroupFieldsFromQuery(params),
    page_size: params.get('page_size') || '',
  })
  const rawPage = Number(params.get('page') || 1)
  return {
    keyword: config.keyword || '',
    statusFilter: config.status_code || '',
    severityFilter: config.severity_code || '',
    issueStageFilter: config.issue_stage || '',
    demandFilter: config.demand_id || undefined,
    assigneeFilter: forcedAssigneeId || config.assignee_id || undefined,
    reporterFilter: config.reporter_id || undefined,
    createdRange: buildViewDateRange(config),
    groupFields: Array.isArray(config.group_fields) ? config.group_fields : [],
    pageSize: config.page_size || 20,
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  }
}

function buildBugListQueryString({
  viewId,
  keyword,
  statusFilter,
  severityFilter,
  issueStageFilter,
  demandFilter,
  assigneeFilter,
  reporterFilter,
  createdRange,
  groupFields,
  page,
  pageSize,
}) {
  const params = new URLSearchParams()
  const normalizedViewId = Number(viewId || 0)
  if (normalizedViewId > 0) params.set('view_id', String(normalizedViewId))

  const normalizedKeyword = String(keyword || '').trim()
  if (normalizedKeyword) params.set('keyword', normalizedKeyword)

  const normalizedStatus = String(statusFilter || '').trim().toUpperCase()
  if (normalizedStatus) params.set('status_code', normalizedStatus)

  const normalizedSeverity = String(severityFilter || '').trim().toUpperCase()
  if (normalizedSeverity) params.set('severity_code', normalizedSeverity)

  const normalizedIssueStage = String(issueStageFilter || '').trim().toUpperCase()
  if (normalizedIssueStage) params.set('issue_stage', normalizedIssueStage)

  const normalizedDemand = String(demandFilter || '').trim()
  if (normalizedDemand) params.set('demand_id', normalizedDemand)

  const normalizedAssigneeId = Number(assigneeFilter || 0)
  if (Number.isInteger(normalizedAssigneeId) && normalizedAssigneeId > 0) {
    params.set('assignee_id', String(normalizedAssigneeId))
  }

  const normalizedReporterId = Number(reporterFilter || 0)
  if (Number.isInteger(normalizedReporterId) && normalizedReporterId > 0) {
    params.set('reporter_id', String(normalizedReporterId))
  }

  const startDate = createdRange?.[0]?.format?.('YYYY-MM-DD')
  const endDate = createdRange?.[1]?.format?.('YYYY-MM-DD')
  if (startDate && endDate) {
    params.set('start_date', startDate)
    params.set('end_date', endDate)
  }

  const normalizedGroupFields = (Array.isArray(groupFields) ? groupFields : [])
    .map((item) => String(item || '').trim())
    .filter((item, index, arr) => GROUP_FIELD_OPTIONS.some((option) => option.value === item) && arr.indexOf(item) === index)
    .slice(0, 3)
  if (normalizedGroupFields.length > 0) {
    params.set('group_fields', normalizedGroupFields.join(','))
  }

  const normalizedPage = Number(page || 1)
  if (Number.isInteger(normalizedPage) && normalizedPage > 1) {
    params.set('page', String(normalizedPage))
  }

  const normalizedPageSize = Number(pageSize || 20)
  if (BUG_VIEW_ALLOWED_PAGE_SIZE.has(normalizedPageSize) && normalizedPageSize !== 20) {
    params.set('page_size', String(normalizedPageSize))
  }

  return params.toString()
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

function buildGroupedTreeRows(sourceRows, groupFields, level = 0, parentKey = 'root') {
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

  return Array.from(groupMap.values())
    .sort((a, b) => String(a.value || '').localeCompare(String(b.value || ''), 'zh-Hans-CN'))
    .map((group, index) => {
      const groupKey = `group-${parentKey}-${field}-${group.key}-${index}`
      return {
        __isGroup: true,
        __rowKey: groupKey,
        __groupField: field,
        __groupFieldLabel: GROUP_FIELD_LABEL_MAP[field] || '分组',
        __groupValue: group.value,
        __groupCount: group.rows.length,
        children: buildGroupedTreeRows(group.rows, groupFields, level + 1, groupKey),
      }
    })
}

function openDemandDetailInNewTab(demandId) {
  const normalizedDemandId = String(demandId || '').trim()
  if (!normalizedDemandId) return
  window.open(`/work-demands/${encodeURIComponent(normalizedDemandId)}`, '_blank', 'noopener,noreferrer')
}

function BugListPage({
  pageTitle = DEFAULT_PAGE_TITLE,
  pageSubtitle = DEFAULT_PAGE_SUBTITLE,
  forceAssigneeId = null,
  openBugTitleInNewTab = false,
  allowCreate = true,
  detailSource = '',
} = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUserId = toPositiveInt(getCurrentUser()?.id)
  const normalizedForcedAssigneeId = toPositiveInt(forceAssigneeId) || (forceAssigneeId === 'CURRENT_USER' ? currentUserId : null)
  const isAssigneeForced = Boolean(normalizedForcedAssigneeId)
  const initialQueryStateRef = useRef(parseBugListQueryState(location.search, { forcedAssigneeId: normalizedForcedAssigneeId }))
  const initialQueryState = initialQueryStateRef.current
  const canCreate = allowCreate && hasPermission('bug.create')
  const canTransition = hasPermission('bug.transition')
  const normalizedDetailSource = String(detailSource || '').trim()
  const detailQuery = useMemo(() => {
    if (!normalizedDetailSource) return ''
    const params = new URLSearchParams()
    params.set('from', normalizedDetailSource)
    return params.toString()
  }, [normalizedDetailSource])

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialQueryState.page)
  const [pageSize, setPageSize] = useState(initialQueryState.pageSize)
  const [searchInput, setSearchInput] = useState(initialQueryState.keyword)
  const [keyword, setKeyword] = useState(initialQueryState.keyword)
  const [statusFilter, setStatusFilter] = useState(initialQueryState.statusFilter)
  const [severityFilter, setSeverityFilter] = useState(initialQueryState.severityFilter)
  const [issueStageFilter, setIssueStageFilter] = useState(initialQueryState.issueStageFilter)
  const [groupFields, setGroupFields] = useState(initialQueryState.groupFields)
  const [groupLimitExceeded, setGroupLimitExceeded] = useState(false)
  const [demandFilter, setDemandFilter] = useState(initialQueryState.demandFilter)
  const [assigneeFilter, setAssigneeFilter] = useState(initialQueryState.assigneeFilter)
  const [reporterFilter, setReporterFilter] = useState(initialQueryState.reporterFilter)
  const [createdRange, setCreatedRange] = useState(initialQueryState.createdRange)
  const [demandOptions, setDemandOptions] = useState([])
  const [demandOptionsLoading, setDemandOptionsLoading] = useState(false)
  const [userOptions, setUserOptions] = useState([])
  const [userOptionsLoading, setUserOptionsLoading] = useState(false)
  const [statusSegmentOptions, setStatusSegmentOptions] = useState([{ label: '全部状态', value: '' }])
  const [statusNameMap, setStatusNameMap] = useState({})
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
  const [viewListLoading, setViewListLoading] = useState(false)
  const [viewSaveLoading, setViewSaveLoading] = useState(false)
  const [bugViews, setBugViews] = useState([])
  const [activeViewId, setActiveViewId] = useState(null)
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [transitionForm] = Form.useForm()
  const [saveViewForm] = Form.useForm()
  const groupingLimitWarnedRef = useRef(false)
  const suppressViewAutoApplyRef = useRef(false)

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

  const activeView = useMemo(
    () => bugViews.find((item) => Number(item?.id) === Number(activeViewId)) || null,
    [activeViewId, bugViews],
  )
  const bugViewOptions = useMemo(
    () =>
      (bugViews || []).map((item) => {
        const id = Number(item?.id || 0)
        const isOwner = Boolean(item?.is_owner)
        const creatorName = String(item?.creator_name || '').trim()
        const label = isOwner
          ? item?.view_name || `视图${id}`
          : `${item?.view_name || `视图${id}`}（来自${creatorName || '共享'}）`
        return {
          label,
          value: id,
          searchText: `${item?.view_name || ''} ${creatorName}`.trim(),
        }
      }),
    [bugViews],
  )
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

  const loadDemandOptions = useCallback(async () => {
    setDemandOptionsLoading(true)
    try {
      const result = await getWorkDemandsApi({ page: 1, pageSize: 500 })
      const rows = Array.isArray(result?.data?.list) ? result.data.list : []
      setDemandOptions(mapDemandOptions(rows))
    } catch (error) {
      message.error(error?.message || '加载需求筛选项失败')
    } finally {
      setDemandOptionsLoading(false)
    }
  }, [])

  const loadWorkflowConfig = useCallback(async () => {
    try {
      const result = await getBugWorkflowConfigApi()
      if (!result?.success) {
        throw new Error(result?.message || '加载Bug流程配置失败')
      }
      const transitions = normalizeBugWorkflowTransitions(result?.data?.transitions || [])
      setWorkflowTransitions(transitions)
    } catch (error) {
      message.warning(error?.message || '加载Bug流程配置失败，已使用默认流程')
      setWorkflowTransitions(normalizeBugWorkflowTransitions([]))
    }
  }, [])

  const buildListQueryParams = useCallback(() => ({
    keyword: keyword || undefined,
    status_code: statusFilter || undefined,
    severity_code: severityFilter || undefined,
    issue_stage: issueStageFilter || undefined,
    demand_id: demandFilter || undefined,
    assignee_id: assigneeFilter || undefined,
    reporter_id: reporterFilter || undefined,
    start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || undefined,
    end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || undefined,
  }), [assigneeFilter, createdRange, demandFilter, issueStageFilter, keyword, reporterFilter, severityFilter, statusFilter])

  const buildCurrentViewConfig = useCallback(
    () => ({
      keyword: String(keyword || '').trim(),
      status_code: String(statusFilter || '').trim().toUpperCase(),
      severity_code: String(severityFilter || '').trim().toUpperCase(),
      issue_stage: String(issueStageFilter || '').trim().toUpperCase(),
      demand_id: String(demandFilter || '').trim(),
      assignee_id: Number(assigneeFilter || 0) > 0 ? Number(assigneeFilter) : null,
      reporter_id: Number(reporterFilter || 0) > 0 ? Number(reporterFilter) : null,
      start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || '',
      end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || '',
      group_fields: Array.isArray(groupFields) ? groupFields : [],
      page_size: BUG_VIEW_ALLOWED_PAGE_SIZE.has(Number(pageSize)) ? Number(pageSize) : 20,
    }),
    [
      assigneeFilter,
      createdRange,
      demandFilter,
      groupFields,
      issueStageFilter,
      keyword,
      pageSize,
      reporterFilter,
      severityFilter,
      statusFilter,
    ],
  )
  const activeViewConfig = useMemo(() => normalizeViewConfig(activeView?.config || {}), [activeView?.config])
  const currentViewConfig = useMemo(() => normalizeViewConfig(buildCurrentViewConfig()), [buildCurrentViewConfig])
  const isActiveViewDirty = useMemo(() => {
    if (!activeView) return false
    return JSON.stringify(activeViewConfig) !== JSON.stringify(currentViewConfig)
  }, [activeView, activeViewConfig, currentViewConfig])

  const setViewQueryParam = useCallback(
    (viewId, { replace = true } = {}) => {
      const params = new URLSearchParams(location.search || '')
      const normalizedViewId = Number(viewId || 0)
      if (normalizedViewId > 0) {
        params.set('view_id', String(normalizedViewId))
      } else {
        params.delete('view_id')
      }
      const search = params.toString()
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : '',
        },
        { replace },
      )
    },
    [location.pathname, location.search, navigate],
  )

  const applyViewState = useCallback((rawConfig = {}) => {
    const config = normalizeViewConfig(rawConfig)
    setKeyword(config.keyword || '')
    setSearchInput(config.keyword || '')
    setStatusFilter(config.status_code || '')
    setSeverityFilter(config.severity_code || '')
    setIssueStageFilter(config.issue_stage || '')
    setDemandFilter(config.demand_id || undefined)
    setAssigneeFilter(normalizedForcedAssigneeId || config.assignee_id || undefined)
    setReporterFilter(config.reporter_id || undefined)
    setCreatedRange(buildViewDateRange(config))
    setGroupFields(Array.isArray(config.group_fields) ? config.group_fields : [])
    setPageSize(config.page_size || 20)
    setPage(1)
  }, [normalizedForcedAssigneeId])

  const loadBugViews = useCallback(async () => {
    setViewListLoading(true)
    try {
      const result = await getBugViewsApi()
      if (!result?.success) {
        throw new Error(result?.message || '加载视图失败')
      }
      setBugViews(Array.isArray(result?.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '加载视图失败')
    } finally {
      setViewListLoading(false)
    }
  }, [])

  const loadAndApplyBugView = useCallback(
    async (viewId, { syncUrl = true, silent = false } = {}) => {
      const normalizedViewId = Number(viewId || 0)
      if (!normalizedViewId) return

      let targetView = (bugViews || []).find((item) => Number(item?.id || 0) === normalizedViewId) || null
      if (!targetView) {
        const result = await getBugViewByIdApi(normalizedViewId)
        if (!result?.success || !result?.data) {
          throw new Error(result?.message || '视图不存在或无权限查看')
        }
        targetView = result.data
      }

      applyViewState(targetView?.config || {})
      setActiveViewId(normalizedViewId)
      if (syncUrl) {
        setViewQueryParam(normalizedViewId)
      }
      if (!silent) {
        message.success(`已应用视图：${targetView?.view_name || normalizedViewId}`)
      }
    },
    [applyViewState, bugViews, setViewQueryParam],
  )

  const loadBugs = useCallback(async () => {
    setLoading(true)
    try {
      const baseParams = buildListQueryParams()
      if (isGroupingEnabled) {
        let currentPage = 1
        let serverTotal = 0
        let collectedRows = []
        let truncated = false

        while (currentPage <= 100) {
          const result = await getBugsApi({
            ...baseParams,
            page: currentPage,
            pageSize: GROUP_FETCH_PAGE_SIZE,
          })
          if (!result?.success) {
            message.error(result?.message || '获取Bug列表失败')
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

      const result = await getBugsApi({
        ...baseParams,
        page,
        pageSize,
      })
      if (!result?.success) {
        message.error(result?.message || '获取Bug列表失败')
        return
      }
      setRows(result?.data?.rows || [])
      setTotal(Number(result?.data?.total || 0))
      setGroupLimitExceeded(false)
      groupingLimitWarnedRef.current = false
    } catch (error) {
      message.error(error?.message || '获取Bug列表失败')
    } finally {
      setLoading(false)
    }
  }, [buildListQueryParams, isGroupingEnabled, page, pageSize])

  const buildBugDetailPath = useCallback((bugId) => {
    const normalizedBugId = Number(bugId || 0)
    if (!normalizedBugId) return ''
    const detailPath = `/bugs/${normalizedBugId}`
    if (!detailQuery) return detailPath
    return `${detailPath}?${detailQuery}`
  }, [detailQuery])

  const openBugDetail = useCallback((bugId) => {
    const detailPath = buildBugDetailPath(bugId)
    if (!detailPath) return
    if (openBugTitleInNewTab) {
      window.open(detailPath, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(detailPath)
  }, [buildBugDetailPath, navigate, openBugTitleInNewTab])

  useEffect(() => {
    loadDicts()
  }, [loadDicts])

  useEffect(() => {
    loadUserOptions()
  }, [loadUserOptions])

  useEffect(() => {
    loadDemandOptions()
  }, [loadDemandOptions])

  useEffect(() => {
    loadWorkflowConfig()
  }, [loadWorkflowConfig])

  useEffect(() => {
    loadBugViews()
  }, [loadBugViews])

  useEffect(() => {
    loadBugs()
  }, [loadBugs])

  useEffect(() => {
    if (!normalizedForcedAssigneeId) return
    setAssigneeFilter(normalizedForcedAssigneeId)
  }, [normalizedForcedAssigneeId])

  useEffect(() => {
    const queryState = parseBugListQueryState(location.search, { forcedAssigneeId: normalizedForcedAssigneeId })
    setSearchInput((prev) => (prev === queryState.keyword ? prev : queryState.keyword))
    setKeyword((prev) => (prev === queryState.keyword ? prev : queryState.keyword))
    setStatusFilter((prev) => (prev === queryState.statusFilter ? prev : queryState.statusFilter))
    setSeverityFilter((prev) => (prev === queryState.severityFilter ? prev : queryState.severityFilter))
    setIssueStageFilter((prev) => (prev === queryState.issueStageFilter ? prev : queryState.issueStageFilter))
    setDemandFilter((prev) => (prev === queryState.demandFilter ? prev : queryState.demandFilter))
    setAssigneeFilter((prev) => (prev === queryState.assigneeFilter ? prev : queryState.assigneeFilter))
    setReporterFilter((prev) => (prev === queryState.reporterFilter ? prev : queryState.reporterFilter))
    setCreatedRange((prev) => {
      const prevStart = prev?.[0]?.format?.('YYYY-MM-DD') || ''
      const prevEnd = prev?.[1]?.format?.('YYYY-MM-DD') || ''
      const nextStart = queryState.createdRange?.[0]?.format?.('YYYY-MM-DD') || ''
      const nextEnd = queryState.createdRange?.[1]?.format?.('YYYY-MM-DD') || ''
      if (prevStart === nextStart && prevEnd === nextEnd) return prev
      return queryState.createdRange
    })
    setGroupFields((prev) => {
      if (
        Array.isArray(prev) &&
        Array.isArray(queryState.groupFields) &&
        prev.length === queryState.groupFields.length &&
        prev.every((item, index) => item === queryState.groupFields[index])
      ) {
        return prev
      }
      return queryState.groupFields
    })
    setPage((prev) => (prev === queryState.page ? prev : queryState.page))
    setPageSize((prev) => (prev === queryState.pageSize ? prev : queryState.pageSize))
  }, [location.search, normalizedForcedAssigneeId])

  useEffect(() => {
    const queryViewId = Number(new URLSearchParams(location.search || '').get('view_id') || 0)
    if (queryViewId > 0 && Number(activeViewId || 0) === 0) return
    const nextSearch = buildBugListQueryString({
      viewId: activeViewId,
      keyword,
      statusFilter,
      severityFilter,
      issueStageFilter,
      demandFilter,
      assigneeFilter,
      reporterFilter,
      createdRange,
      groupFields,
      page,
      pageSize,
    })
    const currentSearch = new URLSearchParams(location.search || '').toString()
    if (currentSearch === nextSearch) return

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [
    activeViewId,
    assigneeFilter,
    createdRange,
    demandFilter,
    groupFields,
    issueStageFilter,
    keyword,
    location.pathname,
    location.search,
    navigate,
    page,
    pageSize,
    reporterFilter,
    severityFilter,
    statusFilter,
  ])

  useEffect(() => {
    const viewIdFromQuery = Number(new URLSearchParams(location.search || '').get('view_id') || 0)
    if (!viewIdFromQuery) {
      suppressViewAutoApplyRef.current = false
      return
    }
    if (suppressViewAutoApplyRef.current) return
    if (Number(activeViewId || 0) === viewIdFromQuery) return

    loadAndApplyBugView(viewIdFromQuery, { syncUrl: false, silent: true }).catch((error) => {
      message.error(error?.message || '加载分享视图失败')
      setViewQueryParam(0)
    })
  }, [activeViewId, loadAndApplyBugView, location.search, setViewQueryParam])

  const activeFilterCount = useMemo(
    () =>
      [
        keyword,
        statusFilter,
        severityFilter,
        issueStageFilter,
        demandFilter,
        assigneeFilter,
        reporterFilter,
        Array.isArray(createdRange) && createdRange.length === 2 ? 'created_range' : '',
      ].filter(Boolean).length,
    [assigneeFilter, createdRange, demandFilter, issueStageFilter, keyword, reporterFilter, severityFilter, statusFilter],
  )

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('')
    setSeverityFilter('')
    setIssueStageFilter('')
    setDemandFilter(undefined)
    setAssigneeFilter(normalizedForcedAssigneeId || undefined)
    setReporterFilter(undefined)
    setCreatedRange(null)
    setGroupFields([])
    setPage(1)
    setPageSize(20)
  }, [normalizedForcedAssigneeId])

  const clearActiveViewSelection = useCallback(() => {
    suppressViewAutoApplyRef.current = true
    resetFilters()
    setActiveViewId(null)
    navigate(
      {
        pathname: location.pathname,
        search: '',
      },
      { replace: true },
    )
  }, [location.pathname, navigate, resetFilters])

  const openSaveViewModal = useCallback(() => {
    const defaultName = activeView?.view_name
      ? `${activeView.view_name}-副本`
      : `Bug视图-${dayjs().format('MMDD-HHmm')}`
    saveViewForm.setFieldsValue({
      name: defaultName,
      visibility: activeView?.visibility || 'PRIVATE',
    })
    setSaveViewModalOpen(true)
  }, [activeView?.view_name, activeView?.visibility, saveViewForm])

  const submitCreateBugView = useCallback(async () => {
    try {
      const values = await saveViewForm.validateFields()
      setViewSaveLoading(true)
      const result = await createBugViewApi({
        view_name: String(values?.name || '').trim(),
        visibility: String(values?.visibility || 'PRIVATE').trim().toUpperCase(),
        config: buildCurrentViewConfig(),
      })
      if (!result?.success || !result?.data) {
        throw new Error(result?.message || '保存视图失败')
      }
      const createdViewId = Number(result?.data?.id || 0)
      await loadBugViews()
      if (createdViewId > 0) {
        await loadAndApplyBugView(createdViewId, { syncUrl: true, silent: true })
      }
      setSaveViewModalOpen(false)
      saveViewForm.resetFields()
      message.success(result?.message || '视图已保存')
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存视图失败')
    } finally {
      setViewSaveLoading(false)
    }
  }, [buildCurrentViewConfig, loadAndApplyBugView, loadBugViews, saveViewForm])

  const handleUpdateActiveView = useCallback(async () => {
    const viewId = Number(activeView?.id || 0)
    if (!viewId) return
    try {
      setViewSaveLoading(true)
      const result = await updateBugViewApi(viewId, {
        view_name: activeView?.view_name || `视图${viewId}`,
        visibility: activeView?.visibility || 'PRIVATE',
        config: buildCurrentViewConfig(),
      })
      if (!result?.success) {
        throw new Error(result?.message || '更新视图失败')
      }
      await loadBugViews()
      message.success(result?.message || '视图已更新')
    } catch (error) {
      message.error(error?.message || '更新视图失败')
    } finally {
      setViewSaveLoading(false)
    }
  }, [activeView?.id, activeView?.view_name, activeView?.visibility, buildCurrentViewConfig, loadBugViews])

  const handleDeleteActiveView = useCallback(async () => {
    const viewId = Number(activeView?.id || 0)
    if (!viewId) return
    try {
      setViewSaveLoading(true)
      const result = await deleteBugViewApi(viewId)
      if (!result?.success) {
        throw new Error(result?.message || '删除视图失败')
      }
      setActiveViewId(null)
      setViewQueryParam(0)
      await loadBugViews()
      message.success(result?.message || '视图已删除')
    } catch (error) {
      message.error(error?.message || '删除视图失败')
    } finally {
      setViewSaveLoading(false)
    }
  }, [activeView?.id, loadBugViews, setViewQueryParam])

  const handleCopyViewLink = useCallback(async () => {
    const viewId = Number(activeView?.id || 0)
    if (!viewId) return
    const shareUrl = `${window.location.origin}${location.pathname}?view_id=${viewId}`
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        message.success('视图链接已复制')
        return
      }
      throw new Error('clipboard unavailable')
    } catch {
      Modal.info({
        title: '复制链接',
        content: (
          <Input
            value={shareUrl}
            readOnly
            onFocus={(event) => {
              event.target.select()
            }}
          />
        ),
      })
    }
  }, [activeView?.id, location.pathname])

  const tableDataSource = useMemo(() => {
    if (!isGroupingEnabled) return rows
    return buildGroupedTreeRows(rows, groupFields)
  }, [groupFields, isGroupingEnabled, rows])

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
          <div className="bug-list-page__attachment-loading">
            <Spin size="small" />
            <Text type="secondary">附件加载中...</Text>
          </div>
        )
      }

      if (!Array.isArray(attachments) || attachments.length === 0) {
        return (
          <div className="bug-list-page__attachment-empty">
            <Text type="secondary">暂无附件</Text>
          </div>
        )
      }

      return (
        <div className="bug-list-page__attachment-preview">
          {attachments.slice(0, 6).map((attachment) => {
            const fileUrl = getAttachmentUrl(attachment)
            const imageAttachment = Boolean(fileUrl) && isImageAttachment(attachment)
            const videoAttachment = Boolean(fileUrl) && isVideoAttachment(attachment)
            const previewable = imageAttachment || videoAttachment
            return (
              <div className="bug-list-page__attachment-item" key={attachment.id || `${attachment.file_name}-${attachment.object_key}`}>
                {imageAttachment ? (
                  <Image
                    className="bug-list-page__attachment-thumb"
                    width={44}
                    height={44}
                    src={fileUrl}
                    alt={attachment?.file_name || '附件缩略图'}
                    preview={{
                      zIndex: 2100,
                      mask: <span className="bug-list-page__image-mask-hint">放大</span>,
                    }}
                  />
                ) : videoAttachment ? (
                  <button
                    type="button"
                    className="bug-list-page__attachment-fallback bug-list-page__attachment-fallback--video"
                    onClick={() => openAttachmentPreview({
                      src: fileUrl,
                      type: 'video',
                      title: attachment?.file_name || '视频附件预览',
                    })}
                  >
                    <PlayCircleOutlined />
                  </button>
                ) : (
                  <div className="bug-list-page__attachment-fallback">文</div>
                )}
                {previewable ? (
                  <button
                    type="button"
                    className="bug-list-page__attachment-name bug-list-page__attachment-name--button"
                    title={attachment?.file_name || ''}
                    onClick={() => openAttachmentPreview({
                      src: fileUrl,
                      type: videoAttachment ? 'video' : 'image',
                      title: attachment?.file_name || '附件预览',
                    })}
                  >
                    {attachment?.file_name || '-'}
                  </button>
                ) : (
                  <span className="bug-list-page__attachment-name bug-list-page__attachment-name--disabled">
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
              className="bug-list-page__attachment-more"
              onClick={() => openBugDetail(bugId)}
            >
              查看全部 {attachments.length} 个附件
            </Button>
          ) : null}
        </div>
      )
    },
    [attachmentPreviewLoadingMap, attachmentPreviewMap, openAttachmentPreview, openBugDetail],
  )

  const getQuickStatusOptions = useCallback(
    (row) => {
      const currentStatus = String(row?.status_code || '').trim().toUpperCase()
      const currentStatusName = String(row?.status_name || '').trim() || statusNameMap[currentStatus] || currentStatus || '-'
      const transitions = workflowTransitionMap.get(currentStatus) || []
      const options = [{ label: currentStatusName, value: currentStatus, disabled: true }]
      transitions.forEach((item) => {
        const statusCode = String(item?.to_status_code || '').trim().toUpperCase()
        if (!statusCode) return
        const statusName = statusNameMap[statusCode] || statusCode
        const requiredLabels = []
        if (Number(item?.require_remark) === 1) requiredLabels.push('备注')
        if (Number(item?.require_fix_solution) === 1) requiredLabels.push('修复方案&影响范围')
        if (Number(item?.require_verify_result) === 1) requiredLabels.push('验证结果')
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
          verify_result: extraPayload.verify_result || undefined,
        }
        const result = await transitionBugApi(bugId, payload)

        if (!result?.success) {
          message.error(result?.message || '状态更新失败')
          return
        }
        message.success(result?.message || '状态更新成功')
        await loadBugs()
      } catch (error) {
        message.error(error?.message || '状态更新失败')
      } finally {
        setStatusUpdatingMap((prev) => ({ ...prev, [bugId]: false }))
      }
    },
    [loadBugs],
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
        Number(transition?.require_fix_solution) === 1 ||
        Number(transition?.require_verify_result) === 1
      if (requireAnyField) {
        transitionForm.resetFields()
        setStatusDialog({
          open: true,
          bug: row,
          transition,
        })
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
        verify_result: String(values.verify_result || '').trim(),
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
        width: 300,
        ellipsis: true,
        onCell: () => ({ style: { minWidth: 300 } }),
        render: (value, row) => {
          if (row?.__isGroup) {
            return (
              <Space size={6} className="bug-list-page__group-title">
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
              className="bug-list-page__title-link"
              onClick={() => openBugDetail(row.id)}
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
          const options = getQuickStatusOptions(row)
          return (
            <Select
              size="small"
              value={String(row?.status_code || '').trim().toUpperCase() || undefined}
              options={options}
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
        title: '关联需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 220,
        ellipsis: true,
        render: (value, row) => {
          if (row?.__isGroup) return '-'
          const demandId = String(row?.demand_id || '').trim()
          const demandName = String(value || row.demand_id || '').trim()
          if (!demandId || !demandName) return '-'
          return (
            <Button
              type="link"
              size="small"
              className="bug-list-page__title-link"
              onClick={() => openDemandDetailInNewTab(demandId)}
            >
              {demandName}
            </Button>
          )
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
              overlayClassName="bug-list-page__attachment-popover"
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
              <Button
                type="link"
                size="small"
                icon={<PaperClipOutlined />}
                className="bug-list-page__attachment-link"
              >
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
        width: 110,
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
    [activeAttachmentBugId, canTransition, getQuickStatusOptions, handleQuickStatusChange, loadBugAttachments, openBugDetail, renderAttachmentPreviewContent, statusUpdatingMap],
  )

  return (
    <div className="bug-list-page">
      <Card
        className="bug-list-page__shell"
        variant="borderless"
        title={
          <div className="bug-list-page__title-block">
            <Space size={10} className="bug-list-page__title-wrap">
              <span className="bug-list-page__title-icon" aria-hidden>
                <BugOutlined />
              </span>
              <span className="bug-list-page__title">{pageTitle || DEFAULT_PAGE_TITLE}</span>
            </Space>
            <Text type="secondary" className="bug-list-page__subtitle">
              {pageSubtitle || DEFAULT_PAGE_SUBTITLE}
            </Text>
          </div>
        }
        extra={
          <Space size={8} className="bug-list-page__header-actions">
            <Button icon={<ReloadOutlined />} onClick={loadBugs}>
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
        <div className="bug-list-page__filter-panel">
          <div className="bug-list-page__filter-row bug-list-page__filter-row--view">
            <Text strong className="bug-list-page__filter-label">
              视图
            </Text>
            <Select
              size="small"
              showSearch
              allowClear
              className="bug-list-page__view-select"
              value={activeViewId}
              options={bugViewOptions}
              loading={viewListLoading}
              filterOption={pinyinSelectFilter}
              placeholder="选择已保存视图"
              onClear={clearActiveViewSelection}
              onChange={(value) => {
                const nextViewId = Number(value || 0)
                if (!nextViewId) {
                  clearActiveViewSelection()
                  return
                }
                suppressViewAutoApplyRef.current = false
                loadAndApplyBugView(nextViewId, { syncUrl: true, silent: false }).catch((error) => {
                  message.error(error?.message || '应用视图失败')
                })
              }}
            />
            <Button size="small" icon={<SaveOutlined />} onClick={openSaveViewModal}>
              存为视图
            </Button>
            <Button
              size="small"
              type={isActiveViewDirty ? 'primary' : 'default'}
              loading={viewSaveLoading}
              disabled={!activeView?.can_edit || !isActiveViewDirty}
              onClick={() => {
                void handleUpdateActiveView()
              }}
            >
              {isActiveViewDirty ? '保存视图变更' : '更新当前视图'}
            </Button>
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!activeViewId}
              onClick={() => {
                void handleCopyViewLink()
              }}
            >
              复制链接
            </Button>
            <Popconfirm
              title="确认删除这个视图吗？"
              okText="删除"
              cancelText="取消"
              disabled={!activeView?.can_delete}
              onConfirm={() => {
                void handleDeleteActiveView()
              }}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!activeView?.can_delete}
                loading={viewSaveLoading}
              >
                删除视图
              </Button>
            </Popconfirm>
            {activeView ? (
              <Tag color={activeView.visibility === 'SHARED' ? 'green' : 'default'}>
                {activeView.visibility === 'SHARED' ? '共享视图' : '个人视图'}
              </Tag>
            ) : null}
            {activeView && isActiveViewDirty ? <Tag color="gold">已修改未保存</Tag> : null}
          </div>

          <div className="bug-list-page__filter-row bug-list-page__filter-row--status">
            <Text strong className="bug-list-page__filter-label">
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

          <div className="bug-list-page__filter-row">
            <div className="bug-list-page__filter-item">
              <Text type="secondary" className="bug-list-page__filter-inline-label">
                优先级
              </Text>
              <Select
                size="small"
                showSearch
                className="bug-list-page__filter-control bug-list-page__filter-control--sm"
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
            <div className="bug-list-page__filter-item">
              <Text type="secondary" className="bug-list-page__filter-inline-label">
                阶段
              </Text>
              <Select
                size="small"
                showSearch
                className="bug-list-page__filter-control bug-list-page__filter-control--sm"
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
              className="bug-list-page__filter-control"
              value={demandFilter}
              options={demandOptions}
              loading={demandOptionsLoading}
              filterOption={pinyinSelectFilter}
              optionFilterProp="label"
              placeholder="关联需求"
              onChange={(value) => {
                setDemandFilter(value)
                setPage(1)
              }}
            />
            <Select
              size="small"
              showSearch
              allowClear={!isAssigneeForced}
              className="bug-list-page__filter-control"
              value={assigneeFilter}
              options={userOptions}
              loading={userOptionsLoading}
              filterOption={pinyinSelectFilter}
              placeholder={isAssigneeForced ? '处理人（已固定为我）' : '处理人'}
              disabled={isAssigneeForced}
              onChange={(value) => {
                if (isAssigneeForced) return
                setAssigneeFilter(value)
                setPage(1)
              }}
            />
            <Select
              size="small"
              showSearch
              allowClear
              className="bug-list-page__filter-control"
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
              className="bug-list-page__filter-control bug-list-page__date-range"
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
              className="bug-list-page__filter-control bug-list-page__group-select"
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
              className="bug-list-page__keyword"
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
              className="bug-list-page__query-btn"
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
              onClick={() => {
                resetFilters()
                setActiveViewId(null)
                setViewQueryParam(0)
              }}
            >
              清空筛选
            </Button>
            <Text type="secondary" className="bug-list-page__total">
              共 {total} 条
            </Text>
            {isGroupingEnabled ? (
              <Tag color="blue" className="bug-list-page__active-filter-tag">
                分组模式
              </Tag>
            ) : null}
            {groupLimitExceeded ? (
              <Tag color="gold" className="bug-list-page__active-filter-tag">
                仅展示前 {GROUP_FETCH_LIMIT} 条
              </Tag>
            ) : null}
            {activeFilterCount ? (
              <Tag color="processing" className="bug-list-page__active-filter-tag">
                已筛选 {activeFilterCount} 项
              </Tag>
            ) : null}
          </div>
        </div>

        <Table
          className="bug-list-page__table"
          rowKey={(record) => String(record?.__rowKey || `bug-${record?.id || ''}`)}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={tableDataSource}
          rowClassName={(record) => (record?.__isGroup ? 'bug-list-page__group-row' : '')}
          scroll={{ x: 1620 }}
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
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无Bug记录" />,
          }}
        />
      </Card>

      <Modal
        title="保存筛选视图"
        open={saveViewModalOpen}
        className="bug-list-page__dialog"
        onCancel={() => {
          setSaveViewModalOpen(false)
          saveViewForm.resetFields()
        }}
        onOk={() => {
          void submitCreateBugView()
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={viewSaveLoading}
        destroyOnHidden
      >
        <Form form={saveViewForm} layout="vertical">
          <Form.Item
            label="视图名称"
            name="name"
            rules={[
              { required: true, message: '请输入视图名称' },
              { max: 100, message: '视图名称最多100字符' },
            ]}
          >
            <Input maxLength={100} placeholder="例如：处理中-支付模块-张三负责" />
          </Form.Item>
          <Form.Item label="可见范围" name="visibility" initialValue="PRIVATE">
            <Select size="small" options={BUG_VIEW_VISIBILITY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <BugFormModal
        open={createOpen}
        title="新建Bug"
        submitText="创建"
        presentation="drawer"
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
            await loadBugs()
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
        className="bug-list-page__dialog"
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
            <Form.Item
              label="备注"
              name="remark"
              rules={[{ required: true, message: '请输入备注' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入备注信息" />
            </Form.Item>
          ) : null}
          {Number(statusDialog.transition?.require_fix_solution) === 1 ? (
            <Form.Item
              label="修复方案&影响范围"
              name="fix_solution"
              rules={[{ required: true, message: '请输入修复方案&影响范围' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入修复方案与影响范围" />
            </Form.Item>
          ) : null}
          {Number(statusDialog.transition?.require_verify_result) === 1 ? (
            <Form.Item
              label="验证结果"
              name="verify_result"
              rules={[{ required: true, message: '请输入验证结果' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入验证结果" />
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
          <video
            className="bug-list-page__attachment-preview-video"
            src={attachmentModalSrc}
            controls
            preload="metadata"
          />
        ) : (
          <Image
            className="bug-list-page__attachment-preview-image"
            src={attachmentModalSrc}
            alt={attachmentModalTitle || '附件预览'}
            preview={{
              zIndex: 2100,
              mask: <span className="bug-list-page__image-mask-hint">点击放大</span>,
            }}
          />
        )}
      </Modal>
    </div>
  )
}

export default BugListPage
