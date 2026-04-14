import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  analyzeSingleFeedbackApi,
  analyzeUnprocessedFeedbackApi,
  batchImportFeedbackApi,
  createFeedbackApi,
  deleteFeedbackApi,
  getAllFeedbackApi,
  updateFeedbackApi,
  updateFeedbackStatusApi,
} from '../../api/feedback'
import { getDictItemsApi } from '../../api/configDict'

const { TextArea, Search } = Input

const VISIBLE_COLUMN_STORAGE_KEY = 'feedbackListVisibleColumns'
const DEFAULT_VISIBLE_COLUMNS = [
  'date',
  'user_question_cn',
  'ai_category',
  'ai_reply',
  'ai_reply_en',
  'user_email',
  'status',
  'product',
  'is_new_request',
  'user_question',
  'ai_processed',
  'action',
]

const DEFAULT_PRODUCT_OPTIONS = ['A1', 'Minimix', 'Vimi', 'Couplelens', 'Veeo', 'Heyo', 'POPDoll', 'Beyo', 'Viyo']
const PINNED_PRODUCT_OPTIONS = ['Pixop', 'Facefame']
const DEFAULT_CHANNEL_OPTIONS = ['邮件', '表单', '商店评论', '其他']
const DUPLICATE_TIME_WINDOW_MINUTES = 5
const DUPLICATE_TIME_WINDOW_MS = DUPLICATE_TIME_WINDOW_MINUTES * 60 * 1000
const AI_CATEGORY_PREVIEW_CHARS = 10
const STATUS_META = {
  pending: { label: '待处理', color: 'orange' },
  processed: { label: '已处理', color: 'green' },
}

function readVisibleColumns() {
  try {
    const raw = localStorage.getItem(VISIBLE_COLUMN_STORAGE_KEY)
    if (!raw) return DEFAULT_VISIBLE_COLUMNS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_VISIBLE_COLUMNS
    return parsed
  } catch {
    return DEFAULT_VISIBLE_COLUMNS
  }
}

function persistVisibleColumns(next) {
  try {
    localStorage.setItem(VISIBLE_COLUMN_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // noop
  }
}

function toDateTimeString(value) {
  if (!value) return ''
  const d = dayjs(value)
  if (!d.isValid()) return ''
  return d.format('YYYY-MM-DD HH:mm:ss')
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

function getStatusLabel(value) {
  return STATUS_META[value]?.label || String(value || '-')
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return email
}

function toTimestamp(value) {
  const dateValue = dayjs(value)
  if (!dateValue.isValid()) return null
  return dateValue.valueOf()
}

function truncateText(value, maxChars) {
  const text = String(value || '')
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  return `${chars.slice(0, maxChars).join('')}...`
}

function parseImportRows(jsonRows) {
  return (Array.isArray(jsonRows) ? jsonRows : [])
    .map((row) => ({
      date: toDateTimeString(new Date()),
      user_email: row['用户邮箱'] || row.user_email || '',
      product: row['产品'] || row.product || '',
      channel: row['反馈渠道'] || row.channel || '',
      user_question: row['用户问题'] || row.user_question || '',
      issue_type: '待分类',
      user_request: '',
      is_new_request: false,
      status: 'pending',
      ai_processed: false,
    }))
    .filter((row) => row.user_email && row.product && row.channel && row.user_question)
}

function FeedbackListPage() {
  const fetchSeqRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [dictProductNames, setDictProductNames] = useState(DEFAULT_PRODUCT_OPTIONS)
  const [dictChannelNames, setDictChannelNames] = useState(DEFAULT_CHANNEL_OPTIONS)
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false)
  const [analyzingIds, setAnalyzingIds] = useState(new Set())
  const [mockInsertLoading, setMockInsertLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [fileList, setFileList] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [visibleColumns, setVisibleColumns] = useState(readVisibleColumns)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isMockModalOpen, setIsMockModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [viewingRow, setViewingRow] = useState(null)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })
  const [filters, setFilters] = useState({
    searchText: '',
    dateRange: null,
    status: null,
    isNewRequest: null,
    aiCategory: null,
  })

  const [editForm] = Form.useForm()
  const [mockForm] = Form.useForm()

  useEffect(() => {
    persistVisibleColumns(visibleColumns)
  }, [visibleColumns])

  useEffect(() => {
    let active = true

    const loadDictOptions = async () => {
      try {
        const [productResult, channelResult] = await Promise.all([
          getDictItemsApi('feedback_product', { enabledOnly: true }).catch(() => null),
          getDictItemsApi('feedback_channel', { enabledOnly: true }).catch(() => null),
        ])

        if (!active) return

        const productNames = (productResult?.data || [])
          .map((item) => String(item?.item_name || '').trim())
          .filter(Boolean)
        const channelNames = (channelResult?.data || [])
          .map((item) => String(item?.item_name || '').trim())
          .filter(Boolean)

        if (productNames.length > 0) {
          setDictProductNames(productNames)
        }
        if (channelNames.length > 0) {
          setDictChannelNames(channelNames)
        }
      } catch {
        // keep fallback options
      }
    }

    loadDictOptions()
    return () => {
      active = false
    }
  }, [])

  const fetchRows = useCallback(async (overrides = {}) => {
    const requestSeq = fetchSeqRef.current + 1
    fetchSeqRef.current = requestSeq
    setLoading(true)
    try {
      const current = overrides.page || pagination.current
      const pageSize = overrides.pageSize || pagination.pageSize
      const result = await getAllFeedbackApi({
        page: current,
        pageSize,
        searchText: filters.searchText || undefined,
        product: activeTab !== 'all' ? activeTab : undefined,
        status: filters.status || undefined,
        isNewRequest: filters.isNewRequest,
        aiCategory: filters.aiCategory || undefined,
        dateStart: filters.dateRange?.[0]
          ? filters.dateRange[0].startOf('day').format('YYYY-MM-DD HH:mm:ss')
          : undefined,
        dateEnd: filters.dateRange?.[1]
          ? filters.dateRange[1].endOf('day').format('YYYY-MM-DD HH:mm:ss')
          : undefined,
        _ts: Number(overrides._ts) || Date.now(),
      })

      if (requestSeq !== fetchSeqRef.current) {
        return
      }

      const data = Array.isArray(result?.data) ? result.data : []
      const pageData = result?.pagination || {}

      setRows(data)
      setPagination((prev) => {
        const next = {
          ...prev,
          current: Number(pageData.page || current),
          pageSize: Number(pageData.pageSize || pageSize),
          total: Number(pageData.total || 0),
        }

        if (
          prev.current === next.current &&
          prev.pageSize === next.pageSize &&
          prev.total === next.total
        ) {
          return prev
        }

        return next
      })
    } catch (error) {
      message.error(error?.message || '获取反馈列表失败')
    } finally {
      if (requestSeq === fetchSeqRef.current) {
        setLoading(false)
      }
    }
  }, [
    activeTab,
    pagination,
    filters.searchText,
    filters.dateRange,
    filters.status,
    filters.isNewRequest,
    filters.aiCategory,
  ])

  useEffect(() => {
    const timer = setTimeout(
      () => {
        fetchRows()
      },
      filters.searchText ? 300 : 0,
    )

    return () => clearTimeout(timer)
  }, [fetchRows, filters.searchText])

  const productTabs = useMemo(() => {
    const products = [...new Set([...(dictProductNames || []), ...PINNED_PRODUCT_OPTIONS].filter(Boolean))]
    return [{ key: 'all', label: '全部' }].concat(
      products.map((product) => ({ key: product, label: product })),
    )
  }, [dictProductNames])

  const groupedRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    const groupCounts = new Array(list.length).fill(0)
    const groupKeys = new Array(list.length).fill('')
    const emailBuckets = new Map()

    list.forEach((item, index) => {
      const email = normalizeEmail(item?.user_email)
      const ts = toTimestamp(item?.date)
      if (!email || !Number.isFinite(ts)) return

      if (!emailBuckets.has(email)) {
        emailBuckets.set(email, [])
      }
      emailBuckets.get(email).push({ index, ts })
    })

    emailBuckets.forEach((entries, email) => {
      entries.sort((a, b) => a.ts - b.ts)

      for (let start = 0; start < entries.length; start += 1) {
        let end = start + 1
        while (end < entries.length && entries[end].ts - entries[start].ts <= DUPLICATE_TIME_WINDOW_MS) {
          end += 1
        }

        const windowSize = end - start
        if (windowSize < 2) continue

        const groupKey = `${email}_${entries[start].ts}_${entries[end - 1].ts}`
        for (let cursor = start; cursor < end; cursor += 1) {
          const rowIndex = entries[cursor].index
          groupCounts[rowIndex] = Math.max(groupCounts[rowIndex], windowSize)
          if (!groupKeys[rowIndex]) {
            groupKeys[rowIndex] = groupKey
          }
        }
      }
    })

    return list.map((item, index) => ({
      ...item,
      _groupKey: groupKeys[index] || '',
      _groupCount: groupCounts[index] || 0,
    }))
  }, [rows])

  const productOptions = useMemo(
    () => [...new Set([...(dictProductNames || []), ...PINNED_PRODUCT_OPTIONS].filter(Boolean))],
    [dictProductNames],
  )

  const channelOptions = useMemo(
    () => [...new Set([...(dictChannelNames || []), ...(rows || []).map((item) => item.channel)].filter(Boolean))],
    [rows, dictChannelNames],
  )

  const aiCategoryOptions = useMemo(
    () => [...new Set((rows || []).map((item) => item.ai_category).filter(Boolean))],
    [rows],
  )

  const handleColumnChange = (selectedColumns) => {
    const next = Array.isArray(selectedColumns) ? [...selectedColumns] : []
    if (!next.includes('action')) next.push('action')
    setVisibleColumns(next)
  }

  const handleFilterChange = (key, value) => {
    setPagination((prev) => ({ ...prev, current: 1 }))
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleResetFilters = () => {
    setActiveTab('all')
    setPagination((prev) => ({ ...prev, current: 1, pageSize: 20 }))
    setFilters({
      searchText: '',
      dateRange: null,
      status: null,
      isNewRequest: null,
      aiCategory: null,
    })
  }

  const handleCopy = async (value, label) => {
    if (!value) {
      message.warning('内容为空，无法复制')
      return
    }

    try {
      const copied = await copyTextWithFallback(value)
      if (!copied) {
        message.error('复制失败，请检查浏览器复制权限')
        return
      }
      message.success(`${label}已复制`)
    } catch {
      message.error('复制失败')
    }
  }

  const handleView = (record) => {
    setViewingRow(record)
    setIsDetailDrawerOpen(true)
  }

  const handleEdit = (record) => {
    setEditingRow(record)
    editForm.setFieldsValue({
      ...record,
      date: record?.date ? dayjs(record.date) : null,
    })
    setIsEditModalOpen(true)
  }

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除来自 ${record.user_email || '-'} 的反馈吗？`,
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteFeedbackApi(record.id)
          message.success('删除成功')
          fetchRows()
        } catch (error) {
          message.error(error?.message || '删除失败')
        }
      },
    })
  }

  const handleStatusChange = (record, newStatus) => {
    if (newStatus === record.status) return

    Modal.confirm({
      title: '确认修改状态',
      content: `确定将状态从“${getStatusLabel(record.status)}”改为“${getStatusLabel(newStatus)}”吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await updateFeedbackStatusApi(record.id, newStatus)
          message.success('状态更新成功')
          fetchRows()
        } catch (error) {
          message.error(error?.message || '状态更新失败')
        }
      },
    })
  }

  const handleSubmitEdit = async () => {
    if (!editingRow) return

    try {
      const values = await editForm.validateFields()
      const payload = {
        ...values,
        date: values.date ? values.date.format('YYYY-MM-DD HH:mm:ss') : null,
      }

      await updateFeedbackApi(editingRow.id, payload)
      message.success('更新成功')
      setIsEditModalOpen(false)
      setEditingRow(null)
      editForm.resetFields()
      fetchRows()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '更新失败')
    }
  }

  const handleMockInsert = async () => {
    try {
      const values = await mockForm.validateFields()
      const payload = {
        date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        user_email: values.user_email || 'example@gmail.com',
        product: values.product,
        channel: values.channel,
        user_question: values.user_question,
        issue_type: '待分类',
        user_request: '',
        is_new_request: false,
        status: 'pending',
      }

      setMockInsertLoading(true)
      await createFeedbackApi(payload)
      setPagination((prev) => ({ ...prev, current: 1 }))
      await fetchRows({ page: 1, _ts: Date.now() })
      message.success('插入成功')
      setIsMockModalOpen(false)
      mockForm.resetFields()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '插入失败')
    } finally {
      setMockInsertLoading(false)
    }
  }

  const handleAiAnalyzeBatch = () => {
    Modal.confirm({
      title: 'AI 批量分析确认',
      content: '将分析当前所有未处理反馈，是否继续？',
      okText: '开始分析',
      cancelText: '取消',
      onOk: async () => {
        setAiAnalyzeLoading(true)
        try {
          const result = await analyzeUnprocessedFeedbackApi(5)
          message.success(result?.message || '分析完成')
          fetchRows()
        } catch (error) {
          message.error(error?.message || 'AI 分析失败')
        } finally {
          setAiAnalyzeLoading(false)
        }
      },
    })
  }

  const handleAnalyzeSingle = async (record) => {
    setAnalyzingIds((prev) => {
      const next = new Set(prev)
      next.add(record.id)
      return next
    })

    try {
      await analyzeSingleFeedbackApi(record.id)
      message.success('分析完成')
      fetchRows()
    } catch (error) {
      message.error(error?.message || '分析失败')
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
    }
  }

  const handleFileUpload = (file) => {
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonRows = XLSX.utils.sheet_to_json(worksheet)

        if (!jsonRows.length) {
          message.error('文件内容为空')
          return
        }

        const list = parseImportRows(jsonRows)
        if (!list.length) {
          message.error('没有可导入数据，请检查必填列：用户邮箱、产品、反馈渠道、用户问题')
          return
        }

        setImportLoading(true)
        await batchImportFeedbackApi(list)
        message.success(`成功导入 ${list.length} 条数据`)
        setIsImportModalOpen(false)
        setFileList([])
        setPagination((prev) => ({ ...prev, current: 1 }))
        fetchRows({ page: 1 })
      } catch (error) {
        message.error(error?.message || '文件解析或导入失败')
      } finally {
        setImportLoading(false)
      }
    }

    reader.readAsArrayBuffer(file)
    return false
  }

  const allColumns = [
    {
      title: '提交日期',
      dataIndex: 'date',
      key: 'date',
      width: 170,
      render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '问题描述（中文）',
      dataIndex: 'user_question_cn',
      key: 'user_question_cn',
      width: 250,
      ellipsis: true,
      render: (value) => (
        <Tooltip title={value} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
          <span style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'AI 分类',
      dataIndex: 'ai_category',
      key: 'ai_category',
      width: 160,
      render: (value) => {
        if (!value) return '-'
        const fullText = String(value || '')
        const shortText = truncateText(fullText, AI_CATEGORY_PREVIEW_CHARS)
        const colorMap = {
          Bug: 'red',
          功能需求: 'blue',
          投诉: 'orange',
          咨询: 'green',
        }
        return (
          <Tooltip title={fullText} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
            <Tag color={colorMap[fullText] || 'default'}>{shortText}</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: 'AI 回复',
      dataIndex: 'ai_reply',
      key: 'ai_reply',
      width: 240,
      ellipsis: true,
      render: (value) => (
        <Space size={4} style={{ maxWidth: 220 }}>
          <Tooltip title={value} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
            <span style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value || '-'}
            </span>
          </Tooltip>
          {value ? (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(value, 'AI 回复')}
            />
          ) : null}
        </Space>
      ),
    },
    {
      title: 'AI 回复英文',
      dataIndex: 'ai_reply_en',
      key: 'ai_reply_en',
      width: 240,
      ellipsis: true,
      render: (value) => (
        <Space size={4} style={{ maxWidth: 220 }}>
          <Tooltip title={value} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
            <span style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value || '-'}
            </span>
          </Tooltip>
          {value ? (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(value, 'AI 回复英文')}
            />
          ) : null}
        </Space>
      ),
    },
    {
      title: '用户邮箱',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 220,
      ellipsis: true,
      render: (value) => (
        <Space size={4}>
          <span>{value || '-'}</span>
          {value ? (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(value, '用户邮箱')}
            />
          ) : null}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value, record) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={value}
          optionLabelProp="label"
          onChange={(next) => handleStatusChange(record, next)}
          options={[
            {
              label: (
                <Tag color={STATUS_META.pending.color} style={{ marginInlineEnd: 0 }}>
                  {STATUS_META.pending.label}
                </Tag>
              ),
              value: 'pending',
            },
            {
              label: (
                <Tag color={STATUS_META.processed.color} style={{ marginInlineEnd: 0 }}>
                  {STATUS_META.processed.label}
                </Tag>
              ),
              value: 'processed',
            },
          ]}
        />
      ),
    },
    {
      title: '产品',
      dataIndex: 'product',
      key: 'product',
      width: 140,
    },
    {
      title: '是否新需求',
      dataIndex: 'is_new_request',
      key: 'is_new_request',
      width: 130,
      render: (value) => (
        <Tag color={value ? 'red' : 'blue'}>{value ? '新需求' : '已知需求'}</Tag>
      ),
    },
    {
      title: '问题描述',
      dataIndex: 'user_question',
      key: 'user_question',
      width: 250,
      ellipsis: true,
      render: (value) => (
        <Tooltip title={value} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
          <span style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'AI处理',
      dataIndex: 'ai_processed',
      key: 'ai_processed',
      width: 100,
      render: (value) => (
        <Tag color={value ? 'green' : 'default'}>{value ? '已处理' : '未处理'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={analyzingIds.has(record.id)}
            onClick={() => handleAnalyzeSingle(record)}
          >
            AI分析
          </Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const columnOptions = [
    { label: '提交日期', value: 'date' },
    { label: '用户邮箱', value: 'user_email' },
    { label: '产品', value: 'product' },
    { label: '问题描述', value: 'user_question' },
    { label: '问题描述（中文）', value: 'user_question_cn' },
    { label: 'AI 回复', value: 'ai_reply' },
    { label: 'AI 回复英文', value: 'ai_reply_en' },
    { label: 'AI分类', value: 'ai_category' },
    { label: 'AI处理', value: 'ai_processed' },
    { label: '是否新需求', value: 'is_new_request' },
    { label: '状态', value: 'status' },
    { label: '操作', value: 'action' },
  ]

  const columns = allColumns.filter((item) => visibleColumns.includes(item.key))

  return (
    <div style={{ padding: 12 }}>
      <style>{`
        .feedback-list-highlight-row {
          background-color: #fff7e6 !important;
        }
        .feedback-list-highlight-row:hover > td {
          background-color: #ffe7ba !important;
        }
      `}</style>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={10}>
          <Search
            style={{ width: 280 }}
            placeholder="搜索邮箱、问题、AI回复..."
            value={filters.searchText}
            onChange={(event) => handleFilterChange('searchText', event.target.value)}
            allowClear
            enterButton={<SearchOutlined />}
          />

          <DatePicker.RangePicker
            value={filters.dateRange}
            onChange={(value) => handleFilterChange('dateRange', value)}
          />

          <Select
            style={{ width: 150 }}
            placeholder="产品"
            value={activeTab === 'all' ? undefined : activeTab}
            onChange={(value) => {
              setActiveTab(value || 'all')
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
            allowClear
            options={productOptions.map((item) => ({ label: item, value: item }))}
          />

          <Select
            style={{ width: 120 }}
            placeholder="状态"
            value={filters.status}
            onChange={(value) => handleFilterChange('status', value)}
            allowClear
            options={[
              { label: '待处理', value: 'pending' },
              { label: '已处理', value: 'processed' },
            ]}
          />

          <Select
            style={{ width: 140 }}
            placeholder="是否新需求"
            value={filters.isNewRequest}
            onChange={(value) => handleFilterChange('isNewRequest', value)}
            allowClear
            options={[
              { label: '新需求', value: true },
              { label: '已知需求', value: false },
            ]}
          />

          <Select
            style={{ width: 180 }}
            placeholder="AI分类"
            value={filters.aiCategory}
            onChange={(value) => handleFilterChange('aiCategory', value)}
            allowClear
            showSearch
            options={aiCategoryOptions.map((item) => ({ label: item, value: item }))}
          />

          <Button onClick={handleResetFilters}>重置</Button>
          <span style={{ color: '#999' }}>共 {pagination.total} 条</span>
        </Space>
      </Card>

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'column-settings',
                label: (
                  <div onClick={(event) => event.stopPropagation()}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>选择显示列</div>
                    <Select
                      mode="multiple"
                      style={{ width: 320 }}
                      value={visibleColumns}
                      onChange={handleColumnChange}
                      options={columnOptions}
                      maxTagCount="responsive"
                    />
                  </div>
                ),
              },
            ],
          }}
        >
          <Button icon={<SettingOutlined />}>列设置</Button>
        </Dropdown>

        <Button
          icon={<RobotOutlined />}
          loading={aiAnalyzeLoading}
          onClick={handleAiAnalyzeBatch}
        >
          AI 批量分析
        </Button>

        <Button icon={<UploadOutlined />} onClick={() => setIsImportModalOpen(true)}>
          批量导入
        </Button>

        <Button
          type="primary"
          icon={<CheckOutlined />}
          loading={mockInsertLoading}
          onClick={() => setIsMockModalOpen(true)}
        >
          手动插入数据
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key)
          setPagination((prev) => ({ ...prev, current: 1 }))
        }}
        items={productTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          children: (
            <Table
              rowKey="id"
              loading={loading}
              dataSource={groupedRows}
              columns={columns}
              scroll={{ x: 1500 }}
              rowClassName={(record) => (record._groupCount >= 2 ? 'feedback-list-highlight-row' : '')}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                showTotal: (total) => `共 ${total} 条记录`,
              }}
              onChange={(pager) => {
                setPagination((prev) => ({
                  ...prev,
                  current: pager.current,
                  pageSize: pager.pageSize,
                }))
              }}
            />
          ),
        }))}
      />

      <Modal
        title="手动插入数据"
        open={isMockModalOpen}
        onCancel={() => {
          setIsMockModalOpen(false)
          mockForm.resetFields()
        }}
        onOk={handleMockInsert}
        okText="确认插入"
        cancelText="取消"
        confirmLoading={mockInsertLoading}
      >
        <Form form={mockForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="用户邮箱" name="user_email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}> 
            <Input placeholder="选填，默认为 example@gmail.com" />
          </Form.Item>
          <Form.Item label="产品" name="product" rules={[{ required: true, message: '请选择产品' }]}> 
            <Select
              options={productOptions.map((item) => ({ label: item, value: item }))}
              placeholder="请选择产品"
              showSearch
            />
          </Form.Item>
          <Form.Item label="反馈渠道" name="channel" rules={[{ required: true, message: '请选择渠道' }]}> 
            <Select
              placeholder="请选择渠道"
              showSearch
              options={channelOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>
          <Form.Item label="问题详情" name="user_question" rules={[{ required: true, message: '请输入问题详情' }]}> 
            <TextArea rows={4} placeholder="请输入问题详情" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑反馈"
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false)
          setEditingRow(null)
          editForm.resetFields()
        }}
        onOk={handleSubmitEdit}
        okText="保存"
        cancelText="取消"
        width={760}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="date" label="提交日期">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="user_email" label="用户邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="product" label="产品">
            <Select
              allowClear
              showSearch
              options={productOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>
          <Form.Item name="channel" label="反馈渠道">
            <Select
              allowClear
              showSearch
              options={channelOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>
          <Form.Item name="user_question" label="问题详情">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="ai_category" label="AI分类">
            <Select
              allowClear
              showSearch
              options={aiCategoryOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>
          <Form.Item name="is_new_request" label="是否新需求">
            <Select
              options={[
                { label: '新需求', value: true },
                { label: '已知需求', value: false },
              ]}
            />
          </Form.Item>
          <Form.Item name="support_reply" label="人工回复（中文）">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="support_reply_en" label="人工回复（英文）">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '待处理', value: 'pending' },
                { label: '已处理', value: 'processed' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量导入反馈"
        open={isImportModalOpen}
        onCancel={() => {
          setIsImportModalOpen(false)
          setFileList([])
        }}
        footer={null}
      >
        <div style={{ marginTop: 12 }}>
          <Upload
            accept=".xlsx,.xls,.csv"
            fileList={fileList}
            beforeUpload={handleFileUpload}
            onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
            onRemove={() => setFileList([])}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />} loading={importLoading}>
              选择 Excel/CSV 文件
            </Button>
          </Upload>
          <div style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
            <p style={{ marginBottom: 6 }}>文件格式要求：</p>
            <ul style={{ marginTop: 0, paddingLeft: 18 }}>
              <li>支持 .xlsx / .xls / .csv</li>
              <li>必填字段：用户邮箱、产品、反馈渠道、用户问题</li>
              <li>支持中文列名与英文列名混用</li>
            </ul>
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault()
                const template = [
                  {
                    用户邮箱: 'example@email.com',
                    产品: '产品名称',
                    反馈渠道: '邮件',
                    用户问题: '问题描述',
                  },
                ]
                const ws = XLSX.utils.json_to_sheet(template)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, '反馈数据')
                XLSX.writeFile(wb, '反馈导入模板.xlsx')
              }}
            >
              下载导入模板
            </a>
          </div>
        </div>
      </Modal>

      <Drawer
        title="反馈详情"
        placement="right"
        size="large"
        open={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
      >
        {viewingRow ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <h3>基本信息</h3>
              <p><strong>提交日期：</strong>{toDateTimeString(viewingRow.date) || '-'}</p>
              <p><strong>用户邮箱：</strong>{viewingRow.user_email || '-'}</p>
              <p><strong>产品：</strong>{viewingRow.product || '-'}</p>
              <p><strong>反馈渠道：</strong>{viewingRow.channel || '-'}</p>
              <p>
                <strong>状态：</strong>
                <Tag color={viewingRow.status === 'processed' ? 'green' : 'orange'}>
                  {viewingRow.status === 'processed' ? '已处理' : '待处理'}
                </Tag>
              </p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <h3>问题描述</h3>
              <p><strong>原文：</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 10 }}>
                {viewingRow.user_question || '-'}
              </div>
              <p><strong>中文翻译：</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 10 }}>
                {viewingRow.user_question_cn || '-'}
              </div>
              <p><strong>用户需求：</strong>{viewingRow.user_request || '-'}</p>
              <p><strong>是否新需求：</strong>{viewingRow.is_new_request ? '是' : '否'}</p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <h3>AI 分析</h3>
              <p><strong>分类：</strong>{viewingRow.ai_category || '-'}</p>
              <p><strong>情绪：</strong>{viewingRow.ai_sentiment || '-'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>AI 自动回复（中文）</strong>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(viewingRow.ai_reply, 'AI 自动回复（中文）')}
                >
                  复制
                </Button>
              </div>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 10 }}>
                {viewingRow.ai_reply || '-'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>AI 自动回复（英文）</strong>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(viewingRow.ai_reply_en, 'AI 自动回复（英文）')}
                >
                  复制
                </Button>
              </div>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {viewingRow.ai_reply_en || '-'}
              </div>
            </div>

            <div>
              <h3>人工回复</h3>
              <p><strong>中文回复：</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 10 }}>
                {viewingRow.support_reply || '-'}
              </div>
              <p><strong>英文回复：</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {viewingRow.support_reply_en || '-'}
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}

export default FeedbackListPage
