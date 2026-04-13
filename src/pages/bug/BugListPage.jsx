import { BugOutlined, FilterOutlined, PaperClipOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Empty, Form, Image, Input, Modal, Popover, Segmented, Select, Space, Spin, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../api/configDict'
import { createBugApi, fixBugApi, getBugAssigneesApi, getBugByIdApi, getBugsApi, rejectBugApi, reopenBugApi, startBugApi, verifyBugApi } from '../../api/bug'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import { BugFormModal } from '../../modules/bug'
import { uploadDraftAttachments } from '../../modules/bug/utils/attachmentUpload'
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
const QUICK_STATUS_TRANSITION_MAP = Object.freeze({
  NEW: [{ toStatus: 'PROCESSING', action: 'start' }],
  REOPENED: [{ toStatus: 'PROCESSING', action: 'start' }],
  PROCESSING: [
    { toStatus: 'FIXED', action: 'fix', requiredField: 'fix_solution', requiredLabel: '修复方案&影响范围' },
    { toStatus: 'CLOSED', action: 'reject', requiredField: 'remark', requiredLabel: '备注' },
  ],
  FIXED: [
    { toStatus: 'CLOSED', action: 'verify', requiredField: 'verify_result', requiredLabel: '验证结果' },
    { toStatus: 'REOPENED', action: 'reopen', requiredField: 'remark', requiredLabel: '备注' },
  ],
  CLOSED: [{ toStatus: 'REOPENED', action: 'reopen', requiredField: 'remark', requiredLabel: '备注' }],
})

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
  const canCreate = hasPermission('bug.create')
  const canTransition = hasPermission('bug.transition')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
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
  const [attachmentPreviewMap, setAttachmentPreviewMap] = useState({})
  const [attachmentPreviewLoadingMap, setAttachmentPreviewLoadingMap] = useState({})
  const [activeAttachmentBugId, setActiveAttachmentBugId] = useState(0)
  const [statusUpdatingMap, setStatusUpdatingMap] = useState({})
  const [statusDialog, setStatusDialog] = useState({
    open: false,
    bug: null,
    transition: null,
  })
  const [transitionForm] = Form.useForm()
  const groupingLimitWarnedRef = useRef(false)

  const isGroupingEnabled = groupFields.length > 0

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

  const buildListQueryParams = useCallback(() => ({
    keyword: keyword || undefined,
    status_code: statusFilter || undefined,
    severity_code: severityFilter || undefined,
    assignee_id: assigneeFilter || undefined,
    reporter_id: reporterFilter || undefined,
    start_date: createdRange?.[0]?.format?.('YYYY-MM-DD') || undefined,
    end_date: createdRange?.[1]?.format?.('YYYY-MM-DD') || undefined,
  }), [assigneeFilter, createdRange, keyword, reporterFilter, severityFilter, statusFilter])

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
    loadBugs()
  }, [loadBugs])

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
      const transitions = QUICK_STATUS_TRANSITION_MAP[currentStatus] || []
      const options = [{ label: currentStatusName, value: currentStatus, disabled: true }]
      transitions.forEach((item) => {
        const statusCode = String(item?.toStatus || '').trim().toUpperCase()
        if (!statusCode) return
        const statusName = statusNameMap[statusCode] || statusCode
        const suffix = item?.requiredField ? `（需填写${item.requiredLabel}）` : ''
        options.push({
          label: `${statusName}${suffix}`,
          value: statusCode,
        })
      })
      return options
    },
    [statusNameMap],
  )

  const runQuickTransition = useCallback(
    async (bug, transition, extraPayload = {}) => {
      const bugId = Number(bug?.id || 0)
      if (!bugId || !transition?.action) return
      try {
        setStatusUpdatingMap((prev) => ({ ...prev, [bugId]: true }))
        let result = null
        const payload = {
          remark: extraPayload.remark || undefined,
          fix_solution: extraPayload.fix_solution || undefined,
          verify_result: extraPayload.verify_result || undefined,
        }
        if (transition.action === 'start') {
          result = await startBugApi(bugId, payload)
        } else if (transition.action === 'fix') {
          result = await fixBugApi(bugId, payload)
        } else if (transition.action === 'verify') {
          result = await verifyBugApi(bugId, payload)
        } else if (transition.action === 'reopen') {
          result = await reopenBugApi(bugId, payload)
        } else if (transition.action === 'reject') {
          result = await rejectBugApi(bugId, payload)
        }

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
      const transition = (QUICK_STATUS_TRANSITION_MAP[currentStatus] || []).find(
        (item) => String(item?.toStatus || '').trim().toUpperCase() === nextStatus,
      )
      if (!transition) {
        message.warning('当前状态不支持直接切换到目标状态')
        return
      }
      if (transition.requiredField) {
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
    [runQuickTransition, transitionForm],
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
    ],
    [activeAttachmentBugId, canTransition, getQuickStatusOptions, handleQuickStatusChange, loadBugAttachments, navigate, renderAttachmentPreviewContent, statusUpdatingMap],
  )

  return (
    <div className="bug-list-page">
      <Card
        className="bug-list-page__shell"
        variant="borderless"
        title={
          <Space size={8} className="bug-list-page__title-wrap">
            <BugOutlined />
            <span className="bug-list-page__title">Bug管理</span>
          </Space>
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
              style={{ width: 140 }}
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
              style={{ width: 160 }}
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
              style={{ width: 160 }}
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
              style={{ width: 240 }}
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
              style={{ width: 260 }}
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
            <Button size="small" icon={<FilterOutlined />} onClick={resetFilters}>
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
          rowKey={(record) => String(record?.__rowKey || `bug-${record?.id || ''}`)}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={tableDataSource}
          rowClassName={(record) => (record?.__isGroup ? 'bug-list-page__group-row' : '')}
          scroll={{ x: 1490 }}
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

      <Modal
        title="补充流转信息"
        open={statusDialog.open}
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
          {statusDialog.transition?.requiredField === 'remark' ? (
            <Form.Item
              label="备注"
              name="remark"
              rules={[{ required: true, message: '请输入备注' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入备注信息" />
            </Form.Item>
          ) : null}
          {statusDialog.transition?.requiredField === 'fix_solution' ? (
            <Form.Item
              label="修复方案&影响范围"
              name="fix_solution"
              rules={[{ required: true, message: '请输入修复方案&影响范围' }]}
            >
              <Input.TextArea rows={3} maxLength={2000} placeholder="请输入修复方案与影响范围" />
            </Form.Item>
          ) : null}
          {statusDialog.transition?.requiredField === 'verify_result' ? (
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
