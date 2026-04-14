import { BugOutlined, DeleteOutlined, EditOutlined, FilterOutlined, LinkOutlined, PaperClipOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Empty, Form, Image, Input, Modal, Popconfirm, Popover, Segmented, Select, Space, Spin, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../api/configDict'
import { createBugApi, createBugViewApi, deleteBugApi, deleteBugViewApi, getBugAssigneesApi, getBugByIdApi, getBugViewByIdApi, getBugViewsApi, getBugWorkflowConfigApi, getBugsApi, transitionBugApi, updateBugApi, updateBugViewApi } from '../../api/bug'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import { BugFormModal } from '../../modules/bug'
import { uploadDraftAttachments } from '../../modules/bug/utils/attachmentUpload'
import { buildWorkflowTransitionMap, normalizeBugWorkflowTransitions } from '../../modules/bug/utils/workflow'
import './BugListPage.css'

const { Text } = Typography
const { RangePicker } = DatePicker
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i
const GROUP_FETCH_PAGE_SIZE = 100
const GROUP_FETCH_LIMIT = 1000
const GROUP_FIELD_OPTIONS = [
  { label: '状态', value: 'status' },
  { label: '提交人', value: 'reporter' },
  { label: 'Bug分类', value: 'bug_type' },
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

function mapDictOptions(rows) {
  return [{ label: '全部', value: undefined }].concat(
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

function BugListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const canCreate = hasPermission('bug.create')
  const canTransition = hasPermission('bug.transition')
  const canUpdate = hasPermission('bug.update')
  const canDelete = hasPermission('bug.delete')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingBugId, setEditingBugId] = useState(0)
  const [editingInitialValues, setEditingInitialValues] = useState(null)
  const [editingRowLoadingId, setEditingRowLoadingId] = useState(0)
  const [deletingBugId, setDeletingBugId] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [groupFields, setGroupFields] = useState([])
  const [groupLimitExceeded, setGroupLimitExceeded] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState()
  const [reporterFilter, setReporterFilter] = useState()
  const [createdRange, setCreatedRange] = useState(null)
  const [userOptions, setUserOptions] = useState([])
  const [userOptionsLoading, setUserOptionsLoading] = useState(false)
  const [statusSegmentOptions, setStatusSegmentOptions] = useState([{ label: '全部状态', value: '' }])
  const [statusNameMap, setStatusNameMap] = useState({})
  const [severityOptions, setSeverityOptions] = useState([{ label: '全部', value: undefined }])
  const [workflowTransitions, setWorkflowTransitions] = useState([])
  const [attachmentPreviewMap, setAttachmentPreviewMap] = useState({})
  const [attachmentPreviewLoadingMap, setAttachmentPreviewLoadingMap] = useState({})
  const [activeAttachmentBugId, setActiveAttachmentBugId] = useState(0)
  const [statusUpdatingMap, setStatusUpdatingMap] = useState({})
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    bug: null,
    transition: null,
  })
  const [viewListLoading, setViewListLoading] = useState(false)
  const [viewSaveLoading, setViewSaveLoading] = useState(false)
  const [bugViews, setBugViews] = useState([])
  const [activeViewId, setActiveViewId] = useState(undefined)
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [transitionForm] = Form.useForm()
  const [saveViewForm] = Form.useForm()
  const groupingLimitWarnedRef = useRef(false)

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
      const [statusRes, severityRes] = await Promise.all([
        getDictItemsApi('bug_status', { enabledOnly: true }),
        getDictItemsApi('bug_severity', { enabledOnly: true }),
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
    assignee_id: assigneeFilter || undefined,
    reporter_id: reporterFilter || undefined,
    start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || undefined,
    end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || undefined,
  }), [assigneeFilter, createdRange, keyword, reporterFilter, severityFilter, statusFilter])

  const buildCurrentViewConfig = useCallback(
    () => ({
      keyword: String(keyword || '').trim(),
      status_code: String(statusFilter || '').trim().toUpperCase(),
      severity_code: String(severityFilter || '').trim().toUpperCase(),
      assignee_id: Number(assigneeFilter || 0) > 0 ? Number(assigneeFilter) : null,
      reporter_id: Number(reporterFilter || 0) > 0 ? Number(reporterFilter) : null,
      start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || '',
      end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || '',
      group_fields: Array.isArray(groupFields) ? groupFields : [],
      page_size: BUG_VIEW_ALLOWED_PAGE_SIZE.has(Number(pageSize)) ? Number(pageSize) : 20,
    }),
    [assigneeFilter, createdRange, groupFields, keyword, pageSize, reporterFilter, severityFilter, statusFilter],
  )

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
    setAssigneeFilter(config.assignee_id || undefined)
    setReporterFilter(config.reporter_id || undefined)
    setCreatedRange(buildViewDateRange(config))
    setGroupFields(Array.isArray(config.group_fields) ? config.group_fields : [])
    setPageSize(config.page_size || 20)
    setPage(1)
  }, [])

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

  useEffect(() => {
    loadDicts()
  }, [loadDicts])

  useEffect(() => {
    loadUserOptions()
  }, [loadUserOptions])

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
    const viewIdFromQuery = Number(new URLSearchParams(location.search || '').get('view_id') || 0)
    if (!viewIdFromQuery) return
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
        assigneeFilter,
        reporterFilter,
        Array.isArray(createdRange) && createdRange.length === 2 ? 'created_range' : '',
      ].filter(Boolean).length,
    [keyword, statusFilter, severityFilter, assigneeFilter, reporterFilter, createdRange],
  )

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('')
    setSeverityFilter('')
    setAssigneeFilter(undefined)
    setReporterFilter(undefined)
    setCreatedRange(null)
    setPage(1)
    setPageSize(20)
  }, [])

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
      setActiveViewId(undefined)
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
            return (
              <div className="bug-list-page__attachment-item" key={attachment.id || `${attachment.file_name}-${attachment.object_key}`}>
                {imageAttachment ? (
                  <Image
                    className="bug-list-page__attachment-thumb"
                    width={44}
                    height={44}
                    src={fileUrl}
                    alt={attachment?.file_name || '附件缩略图'}
                  />
                ) : (
                  <div className="bug-list-page__attachment-fallback">文</div>
                )}
                {fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bug-list-page__attachment-name"
                    title={attachment?.file_name || ''}
                  >
                    {attachment?.file_name || '-'}
                  </a>
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
              onClick={() => navigate(`/bugs/${bugId}`)}
            >
              查看全部 {attachments.length} 个附件
            </Button>
          ) : null}
        </div>
      )
    },
    [attachmentPreviewLoadingMap, attachmentPreviewMap, navigate],
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

  const handleOpenEditBug = useCallback(
    async (row) => {
      const bugId = Number(row?.id || 0)
      if (!bugId) return
      try {
        setEditingRowLoadingId(bugId)
        const result = await getBugByIdApi(bugId)
        if (!result?.success || !result?.data) {
          throw new Error(result?.message || '加载Bug详情失败')
        }
        setEditingBugId(bugId)
        setEditingInitialValues(result.data)
        setEditOpen(true)
      } catch (error) {
        message.error(error?.message || '加载Bug详情失败')
      } finally {
        setEditingRowLoadingId(0)
      }
    },
    [],
  )

  const handleDeleteBug = useCallback(
    async (row) => {
      const bugId = Number(row?.id || 0)
      if (!bugId) return
      try {
        setDeletingBugId(bugId)
        const result = await deleteBugApi(bugId)
        if (!result?.success) {
          throw new Error(result?.message || '删除Bug失败')
        }
        message.success(result?.message || 'Bug已删除')
        await loadBugs()
      } catch (error) {
        message.error(error?.message || '删除Bug失败')
      } finally {
        setDeletingBugId(0)
      }
    },
    [loadBugs],
  )

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
          return value || row.demand_id || '-'
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
      {
        title: '操作',
        key: 'actions',
        width: 130,
        fixed: 'right',
        render: (_, row) => {
          if (row?.__isGroup) return '-'
          if (!canUpdate && !canDelete) return '-'
          const bugId = Number(row?.id || 0)
          return (
            <Space size={4}>
              {canUpdate ? (
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  style={{ paddingInline: 0 }}
                  loading={editingRowLoadingId === bugId}
                  onClick={() => {
                    void handleOpenEditBug(row)
                  }}
                >
                  编辑
                </Button>
              ) : null}
              {canDelete ? (
                <Popconfirm
                  title="确认删除该Bug？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => {
                    void handleDeleteBug(row)
                  }}
                >
                  <Button
                    type="link"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    style={{ paddingInline: 0 }}
                    loading={deletingBugId === bugId}
                  >
                    删除
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          )
        },
      },
    ],
    [activeAttachmentBugId, canDelete, canTransition, canUpdate, deletingBugId, editingRowLoadingId, getQuickStatusOptions, handleDeleteBug, handleOpenEditBug, handleQuickStatusChange, loadBugAttachments, navigate, renderAttachmentPreviewContent, statusUpdatingMap],
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
              <span className="bug-list-page__title">Bug管理</span>
            </Space>
            <Text type="secondary" className="bug-list-page__subtitle">
              一站式查看、筛选、分组与流转处理
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
              onChange={(value) => {
                const nextViewId = Number(value || 0)
                if (!nextViewId) {
                  setActiveViewId(undefined)
                  setViewQueryParam(0)
                  return
                }
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
              loading={viewSaveLoading}
              disabled={!activeView?.can_edit}
              onClick={() => {
                void handleUpdateActiveView()
              }}
            >
              更新当前视图
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
            <Select
              size="small"
              showSearch
              className="bug-list-page__filter-control bug-list-page__filter-control--sm"
              value={severityFilter || undefined}
              options={severityOptions}
              filterOption={pinyinSelectFilter}
              placeholder="严重程度"
              onChange={(value) => {
                setSeverityFilter(String(value || ''))
                setPage(1)
              }}
            />
            <Select
              size="small"
              showSearch
              allowClear
              className="bug-list-page__filter-control"
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
              placeholder="分组展示（状态/提交人/Bug分类）"
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
                setActiveViewId(undefined)
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
            const result = await createBugApi(values)
            if (!result?.success) {
              message.error(result?.message || '创建Bug失败')
              return
            }
            const bugId = Number(result?.data?.id || 0)
            const draftAttachments = extra?.draftAttachments || []
            if (bugId > 0 && draftAttachments.length > 0) {
              const uploadResult = await uploadDraftAttachments(bugId, draftAttachments)
              if (uploadResult.failures.length > 0) {
                message.warning(
                  `Bug已创建，附件上传成功 ${uploadResult.successCount}/${uploadResult.total}，请在详情页补传失败附件`,
                )
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

      <BugFormModal
        open={editOpen}
        title={editingBugId > 0 ? `编辑Bug #${editingBugId}` : '编辑Bug'}
        submitText="保存"
        presentation="drawer"
        confirmLoading={editSubmitting}
        initialValues={editingInitialValues}
        showDraftAttachments={false}
        onCancel={() => {
          setEditOpen(false)
          setEditingBugId(0)
          setEditingInitialValues(null)
        }}
        onSubmit={async (values) => {
          const bugId = Number(editingBugId || 0)
          if (!bugId) return
          setEditSubmitting(true)
          try {
            const result = await updateBugApi(bugId, values)
            if (!result?.success) {
              message.error(result?.message || '更新Bug失败')
              return
            }
            message.success(result?.message || 'Bug已更新')
            setEditOpen(false)
            setEditingBugId(0)
            setEditingInitialValues(null)
            await loadBugs()
          } catch (error) {
            message.error(error?.message || '更新Bug失败')
          } finally {
            setEditSubmitting(false)
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
    </div>
  )
}

export default BugListPage
