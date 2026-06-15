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
  batchUpdateFeedbackStatusApi,
  createFeedbackApi,
  deleteFeedbackApi,
  getAllFeedbackApi,
  translateFeedbackReplyToEnglishApi,
  updateFeedbackApi,
  updateFeedbackStatusApi,
} from '../../api/feedback'
import { getAIPromptConfigApi, getImportantEmailConfigApi } from '../../api/aiConfig'
import { getDictItemsApi } from '../../api/configDict'
import {
  readImportantEmailConfigCache,
  writeImportantEmailConfigCache,
} from '../../utils/importantEmailConfig'

const { TextArea, Search } = Input

const VISIBLE_COLUMN_STORAGE_KEY = 'feedbackListVisibleColumns'
const HIDDEN_COLUMN_KEYS = new Set(['ai_secondary_categories'])
const DEFAULT_VISIBLE_COLUMNS = [
  'date',
  'email_subject',
  'user_question_cn',
  'ai_primary_category',
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
const PINNED_PRODUCT_OPTIONS = ['Pixpop', 'Facefame']
const PRODUCT_ALIAS_MAP = {
  a1: 'A1',
  beyo: 'Beyo',
  beatmo: 'Beatmo',
  couplelens: 'Couplelens',
  dradra: 'Dradra',
  facefame: 'Facefame',
  funpack: 'Funpack',
  gloglo: 'gloglo',
  heyo: 'Heyo',
  makmak: 'makmak',
  minimix: 'Minimix',
  popdoll: 'POPDoll',
  pixpop: 'Pixpop',
  usgen: 'Usgen',
  veeo: 'Veeo',
  vimi: 'Vimi',
  viyo: 'Viyo',
  zikzik: 'Zikzik',
}
const DEFAULT_CHANNEL_OPTIONS = ['邮件', '表单', '商店评论', '其他']
const DUPLICATE_TIME_WINDOW_MINUTES = 5
const DUPLICATE_TIME_WINDOW_MS = DUPLICATE_TIME_WINDOW_MINUTES * 60 * 1000
const AI_CATEGORY_PREVIEW_CHARS = 10
const AI_BATCH_ANALYZE_LIMIT = 50
const IMPORTANT_EMAIL_TAB_KEY = '__important__'
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
    const normalized = parsed
      .map((item) => (item === 'ai_category' ? 'ai_primary_category' : item))
      .filter((item) => !HIDDEN_COLUMN_KEYS.has(item))
    if (!normalized.includes('email_subject')) {
      const dateIndex = normalized.indexOf('date')
      if (dateIndex >= 0) {
        normalized.splice(dateIndex + 1, 0, 'email_subject')
      } else {
        normalized.unshift('email_subject')
      }
    }
    if (!normalized.includes('action')) {
      normalized.push('action')
    }
    return normalized
  } catch {
    return DEFAULT_VISIBLE_COLUMNS
  }
}

function persistVisibleColumns(next) {
  try {
    localStorage.setItem(
      VISIBLE_COLUMN_STORAGE_KEY,
      JSON.stringify((Array.isArray(next) ? next : []).filter((item) => !HIDDEN_COLUMN_KEYS.has(item))),
    )
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

function copyTextLegacy(text) {
  if (typeof document === 'undefined' || !document.body) return false
  const textarea = document.createElement('textarea')
  textarea.value = String(text || '')
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

async function copyTextWithFallback(text) {
  const normalizedText = String(text || '')
  if (!normalizedText) return false

  if (copyTextLegacy(normalizedText)) {
    return true
  }

  const canUseAsyncClipboard =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    typeof navigator?.clipboard?.writeText === 'function'

  if (!canUseAsyncClipboard) return false

  try {
    await navigator.clipboard.writeText(normalizedText)
    return true
  } catch {
    return false
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return email
}

function buildImportantEmailMap(value) {
  const list = Array.isArray(value) ? value : []
  const map = new Map()

  list.forEach((item) => {
    const email = normalizeEmail(item?.email)
    if (!email || item?.enabled === false) return
    map.set(email, {
      email,
      style: String(item?.style || 'STAR').trim().toUpperCase(),
      note: String(item?.note || '').trim(),
      enabled: true,
    })
  })

  return map
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

function normalizeCategoryList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[,\n，；;|]/).map((item) => String(item || '').trim()).filter(Boolean))]
  }
  return []
}

function parseCategoryConfig(value) {
  return normalizeCategoryList(value)
}

function normalizeOptionText(value) {
  return String(value || '').trim()
}

function normalizeProductName(value) {
  const text = normalizeOptionText(value)
  if (!text) return ''
  return PRODUCT_ALIAS_MAP[text.toLowerCase()] || text
}

function mergeProductOptions(...sources) {
  const map = new Map()
  sources.flat().forEach((item) => {
    const normalized = normalizeProductName(item)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (!map.has(key)) {
      map.set(key, normalized)
    }
  })
  return Array.from(map.values())
}

function getPrimaryCategory(record) {
  return String(record?.ai_primary_category || record?.ai_category || '').trim()
}

function getAllCategories(record) {
  const primary = getPrimaryCategory(record)
  const all = normalizeCategoryList(record?.ai_all_categories)
  if (all.length > 0) return all
  return [primary].filter(Boolean)
}

function parseImportRows(jsonRows) {
  return (Array.isArray(jsonRows) ? jsonRows : [])
    .map((row) => ({
      date: toDateTimeString(new Date()),
      user_email: row['用户邮箱'] || row.user_email || '',
      email_subject:
        row['邮件标题'] ||
        row['邮件主题'] ||
        row.email_subject ||
        row.subject ||
        row['标题'] ||
        row['主题'] ||
        '',
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
  const [observedProductNames, setObservedProductNames] = useState([])
  const [dictChannelNames, setDictChannelNames] = useState(DEFAULT_CHANNEL_OPTIONS)
  const [configuredAiCategoryNames, setConfiguredAiCategoryNames] = useState([])
  const [importantEmailRules, setImportantEmailRules] = useState(() => readImportantEmailConfigCache())
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false)
  const [replyTranslateLoading, setReplyTranslateLoading] = useState(false)
  const [analyzingIds, setAnalyzingIds] = useState(new Set())
  const [updatingNewRequestIds, setUpdatingNewRequestIds] = useState(new Set())
  const [mockInsertLoading, setMockInsertLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [fileList, setFileList] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [visibleColumns, setVisibleColumns] = useState(readVisibleColumns)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [batchStatusLoading, setBatchStatusLoading] = useState(false)
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
        const [productResult, channelResult, importantEmailResult, promptConfigResult] = await Promise.all([
          getDictItemsApi('feedback_product', { enabledOnly: true }).catch(() => null),
          getDictItemsApi('feedback_channel', { enabledOnly: true }).catch(() => null),
          getImportantEmailConfigApi().catch(() => null),
          getAIPromptConfigApi().catch(() => null),
        ])

        if (!active) return

        const productNames = (productResult?.data || [])
          .map((item) => normalizeProductName(item?.item_name))
          .filter(Boolean)
        const channelNames = (channelResult?.data || [])
          .map((item) => String(item?.item_name || '').trim())
          .filter(Boolean)

        if (productNames.length > 0) {
          setDictProductNames(productNames)
        } else if (!productResult?.success) {
          message.warning('产品字典加载失败，已使用反馈数据中的产品作为兜底选项')
        }
        if (channelNames.length > 0) {
          setDictChannelNames(channelNames)
        } else if (!channelResult?.success) {
          message.warning('反馈渠道字典加载失败，已使用反馈数据中的渠道作为兜底选项')
        }
        const nextImportantEmailRules = Array.isArray(importantEmailResult?.data) ? importantEmailResult.data : []
        setImportantEmailRules(nextImportantEmailRules)
        writeImportantEmailConfigCache(nextImportantEmailRules)

        setConfiguredAiCategoryNames(parseCategoryConfig(promptConfigResult?.data?.categories))
      } catch {
        setImportantEmailRules(readImportantEmailConfigCache())
      }
    }

    loadDictOptions()
    return () => {
      active = false
    }
  }, [])

  const importantEmailMap = useMemo(
    () => buildImportantEmailMap(importantEmailRules),
    [importantEmailRules],
  )

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
        product: activeTab !== 'all' && activeTab !== IMPORTANT_EMAIL_TAB_KEY ? activeTab : undefined,
        onlyImportantEmail: activeTab === IMPORTANT_EMAIL_TAB_KEY ? true : undefined,
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
      setObservedProductNames((prev) => {
        const next = new Set([...(Array.isArray(prev) ? prev : [])])
        data.forEach((item) => {
          const name = normalizeProductName(item?.product)
          if (name) next.add(name)
        })
        return Array.from(next)
      })
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
      _importantEmailMeta: importantEmailMap.get(normalizeEmail(item?.user_email)) || null,
    }))
  }, [importantEmailMap, rows])

  const mergedProductOptions = useMemo(
    () => mergeProductOptions(dictProductNames || [], observedProductNames || [], PINNED_PRODUCT_OPTIONS),
    [dictProductNames, observedProductNames],
  )

  const productTabs = useMemo(() => ([
    { key: 'all', label: '全部' },
    { key: IMPORTANT_EMAIL_TAB_KEY, label: '✨重点邮件' },
    ...mergedProductOptions.map((product) => ({ key: product, label: product })),
  ]), [mergedProductOptions])

  const productOptions = useMemo(
    () => mergedProductOptions,
    [mergedProductOptions],
  )

  const channelOptions = useMemo(
    () => [...new Set([...(dictChannelNames || []), ...(rows || []).map((item) => item.channel)].filter(Boolean))],
    [rows, dictChannelNames],
  )

  const aiCategoryOptions = useMemo(
    () => [
      ...new Set([
        ...(configuredAiCategoryNames || []),
        ...(rows || []).flatMap((item) => getAllCategories(item)),
      ].filter(Boolean)),
    ],
    [configuredAiCategoryNames, rows],
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
      ai_primary_category: getPrimaryCategory(record) || undefined,
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

  const handleStatusChange = async (record, newStatus) => {
    if (newStatus === record.status) return

    try {
      await updateFeedbackStatusApi(record.id, newStatus)
      message.success('状态更新成功')
      fetchRows()
    } catch (error) {
      message.error(error?.message || '状态更新失败')
    }
  }

  const handleBatchStatusChange = async (newStatus) => {
    if (!newStatus) return
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选需要修改状态的数据')
      return
    }

    setBatchStatusLoading(true)
    try {
      await batchUpdateFeedbackStatusApi(selectedRowKeys, newStatus)
      message.success('批量状态更新成功')
      setSelectedRowKeys([])
      fetchRows()
    } catch (error) {
      message.error(error?.message || '批量状态更新失败')
    } finally {
      setBatchStatusLoading(false)
    }
  }

  const handleToggleNewRequest = async (record) => {
    if (!record?.id || updatingNewRequestIds.has(record.id)) return

    setUpdatingNewRequestIds((prev) => {
      const next = new Set(prev)
      next.add(record.id)
      return next
    })

    try {
      await updateFeedbackApi(record.id, { is_new_request: !record.is_new_request })
      message.success('是否新需求已更新')
      fetchRows()
    } catch (error) {
      message.error(error?.message || '更新失败')
    } finally {
      setUpdatingNewRequestIds((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
    }
  }

  const handleSubmitEdit = async () => {
    if (!editingRow) return

    try {
      const values = await editForm.validateFields()
      const payload = {
        ...values,
        date: values.date ? values.date.format('YYYY-MM-DD HH:mm:ss') : null,
        ai_category: values.ai_primary_category || null,
        ai_primary_category: values.ai_primary_category || null,
        ai_secondary_categories: [],
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

  const handleTranslateEditReply = async ({ sourceField, targetField, sourceLabel }) => {
    const sourceText = String(editForm.getFieldValue(sourceField) || '').trim()
    if (!sourceText) {
      message.warning(`请先填写${sourceLabel}`)
      return
    }

    setReplyTranslateLoading(true)
    try {
      const result = await translateFeedbackReplyToEnglishApi(sourceText)
      const translatedText = String(result?.data?.text || result?.text || '').trim()
      if (!translatedText) {
        message.error('翻译失败，请稍后重试')
        return
      }
      editForm.setFieldValue(targetField, translatedText)
      message.success('英文翻译已生成')
    } catch (error) {
      message.error(error?.message || '翻译失败，请稍后重试')
    } finally {
      setReplyTranslateLoading(false)
    }
  }

  const handleMockInsert = async () => {
    try {
      const values = await mockForm.validateFields()
      const payload = {
        date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        user_email: values.user_email || 'example@gmail.com',
        email_subject: values.email_subject || null,
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
      content: `将最多分析 ${AI_BATCH_ANALYZE_LIMIT} 条未处理反馈，是否继续？`,
      okText: '开始分析',
      cancelText: '取消',
      onOk: async () => {
        setAiAnalyzeLoading(true)
        try {
          const result = await analyzeUnprocessedFeedbackApi(AI_BATCH_ANALYZE_LIMIT)
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
      title: '邮件标题',
      dataIndex: 'email_subject',
      key: 'email_subject',
      width: 220,
      ellipsis: true,
      render: (value) => (
        <Space size={4} style={{ maxWidth: 200 }}>
          <Tooltip title={value} placement="topLeft" styles={{ root: { maxWidth: 420 } }}>
            <span style={{ display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value || '-'}
            </span>
          </Tooltip>
          {value ? (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(value, '邮件标题')}
            />
          ) : null}
        </Space>
      ),
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
      dataIndex: 'ai_primary_category',
      key: 'ai_primary_category',
      width: 160,
      render: (_, record) => {
        const fullText = getPrimaryCategory(record)
        if (!fullText) return '-'
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
      width: 390,
      ellipsis: true,
      render: (value, record) => {
        const importantMeta = record?._importantEmailMeta || null
        const style = String(importantMeta?.style || '').trim().toUpperCase()
        const isRed = style === 'RED' || style === 'RED_STAR'
        const hasStar = style === 'STAR' || style === 'RED_STAR'

        return (
          <Space size={4} wrap>
            <Tooltip title={importantMeta?.note || undefined}>
              <span
                style={{
                  color: isRed ? '#be123c' : undefined,
                  fontWeight: isRed ? 600 : 400,
                }}
              >
                {value || '-'}
              </span>
            </Tooltip>
            {hasStar ? (
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                ✨重点
              </Tag>
            ) : null}
          {value ? (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(value, '用户邮箱')}
            />
          ) : null}
          </Space>
        )
      },
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
      render: (value, record) => {
        const updating = updatingNewRequestIds.has(record.id)
        return (
          <Button
            type="text"
            size="small"
            loading={updating}
            onClick={() => handleToggleNewRequest(record)}
            style={{ paddingInline: 0 }}
          >
            <Tag color={value ? 'red' : 'blue'} style={{ cursor: updating ? 'default' : 'pointer', marginInlineEnd: 0 }}>
              {value ? '新需求' : '已知需求'}
            </Tag>
          </Button>
        )
      },
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
    { label: '邮件标题', value: 'email_subject' },
    { label: '产品', value: 'product' },
    { label: '问题描述', value: 'user_question' },
    { label: '问题描述（中文）', value: 'user_question_cn' },
    { label: 'AI 回复', value: 'ai_reply' },
    { label: 'AI 回复英文', value: 'ai_reply_en' },
    { label: 'AI主分类', value: 'ai_primary_category' },
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
        .feedback-list-important-row > td {
          background-color: #fff1f0 !important;
        }
        .feedback-list-important-row:hover > td {
          background-color: #ffe4e6 !important;
        }
        .feedback-list-highlight-row.feedback-list-important-row > td {
          background: linear-gradient(90deg, #fff1f0 0%, #fff7e6 100%) !important;
        }
        .feedback-list-highlight-row.feedback-list-important-row:hover > td {
          background: linear-gradient(90deg, #ffe4e6 0%, #ffe7ba 100%) !important;
        }
      `}</style>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={10}>
          <Search
            style={{ width: 280 }}
            placeholder="搜索邮箱、邮件标题、问题、AI回复..."
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

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Space wrap>
          <span style={{ color: selectedRowKeys.length > 0 ? '#1677ff' : '#999' }}>
            已选 {selectedRowKeys.length} 条
          </span>
          <Select
            style={{ width: 180 }}
            placeholder="批量修改状态"
            disabled={selectedRowKeys.length === 0}
            loading={batchStatusLoading}
            value={undefined}
            onChange={handleBatchStatusChange}
            options={[
              { label: '改为待处理', value: 'pending' },
              { label: '改为已处理', value: 'processed' },
            ]}
          />
          <Button disabled={selectedRowKeys.length === 0} onClick={() => setSelectedRowKeys([])}>
            清空选择
          </Button>
        </Space>

        <Space wrap>
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
        </Space>
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
              rowSelection={{
                selectedRowKeys,
                preserveSelectedRowKeys: true,
                onChange: (nextSelectedRowKeys) => setSelectedRowKeys(nextSelectedRowKeys),
              }}
              scroll={{ x: 1500 }}
              rowClassName={(record) => {
                const classNames = []
                if (record?._groupCount >= 2) classNames.push('feedback-list-highlight-row')
                if (record?._importantEmailMeta) classNames.push('feedback-list-important-row')
                return classNames.join(' ')
              }}
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
          <Form.Item label="邮件标题" name="email_subject">
            <Input placeholder="选填，支持录入邮件标题" />
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
          <Form.Item name="email_subject" label="邮件标题">
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
          <Form.Item name="ai_primary_category" label="AI主分类">
            <Select
              allowClear
              showSearch
              options={aiCategoryOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>
          <Form.Item name="ai_reply" label="AI 回复（中文）">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item
            name="ai_reply_en"
            label={(
              <Space size={8}>
                <span>AI 回复（英文）</span>
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={replyTranslateLoading}
                  onClick={() => handleTranslateEditReply({
                    sourceField: 'ai_reply',
                    targetField: 'ai_reply_en',
                    sourceLabel: 'AI 回复（中文）',
                  })}
                >
                  翻译
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(editForm.getFieldValue('ai_reply_en'), 'AI 回复（英文）')}
                >
                  复制
                </Button>
              </Space>
            )}
          >
            <TextArea rows={4} />
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
          <Form.Item
            name="support_reply_en"
            label={(
              <Space size={8}>
                <span>人工回复（英文）</span>
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={replyTranslateLoading}
                  onClick={() => handleTranslateEditReply({
                    sourceField: 'support_reply',
                    targetField: 'support_reply_en',
                    sourceLabel: '人工回复（中文）',
                  })}
                >
                  翻译
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(editForm.getFieldValue('support_reply_en'), '人工回复（英文）')}
                >
                  复制
                </Button>
              </Space>
            )}
          >
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
              <li>可选字段：邮件标题</li>
              <li>支持中文列名与英文列名混用</li>
            </ul>
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault()
                const template = [
                  {
                    用户邮箱: 'example@email.com',
                    邮件标题: '误开通订阅，申请退款',
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
              <p>
                <strong>用户邮箱：</strong>
                <span
                  style={{
                    color:
                      viewingRow?._importantEmailMeta?.style === 'RED' ||
                      viewingRow?._importantEmailMeta?.style === 'RED_STAR'
                        ? '#be123c'
                        : undefined,
                    fontWeight:
                      viewingRow?._importantEmailMeta?.style === 'RED' ||
                      viewingRow?._importantEmailMeta?.style === 'RED_STAR'
                        ? 600
                        : 400,
                  }}
                >
                  {viewingRow.user_email || '-'}
                </span>
                {viewingRow?._importantEmailMeta?.style === 'STAR' ||
                viewingRow?._importantEmailMeta?.style === 'RED_STAR' ? (
                  <Tag color="gold" style={{ marginInlineStart: 8, marginInlineEnd: 0 }}>
                    ✨重点
                  </Tag>
                ) : null}
                {viewingRow?._importantEmailMeta?.note ? (
                  <span style={{ marginInlineStart: 8, color: '#667085' }}>
                    {viewingRow._importantEmailMeta.note}
                  </span>
                ) : null}
              </p>
              <p><strong>邮件标题：</strong>{viewingRow.email_subject || '-'}</p>
              <p><strong>产品：</strong>{viewingRow.product || '-'}</p>
              <p><strong>反馈渠道：</strong>{viewingRow.channel || '-'}</p>
              {viewingRow?._importantEmailMeta ? (
                <p>
                  <strong>重点标记：</strong>
                  <Tag color="red" style={{ marginInlineStart: 0 }}>
                    重点邮箱
                  </Tag>
                  <span style={{ color: '#667085' }}>
                    {viewingRow._importantEmailMeta.style === 'RED'
                      ? '标红'
                      : viewingRow._importantEmailMeta.style === 'RED_STAR'
                        ? '标红 + ✨展示'
                        : '✨展示'}
                  </span>
                </p>
              ) : null}
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
              <p><strong>主分类：</strong>{getPrimaryCategory(viewingRow) || '-'}</p>
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
