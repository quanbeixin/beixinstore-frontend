import {
  BellOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
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
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  Upload,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCulturePushConfigApi,
  deleteCulturePushConfigApi,
  getCultureFeishuChatsApi,
  getCulturePushImageUploadPolicyApi,
  getCulturePushConfigLogsApi,
  getCulturePushConfigsApi,
  sendCulturePushConfigTestApi,
  updateCulturePushConfigApi,
  updateCulturePushConfigEnabledApi,
} from '../../api/culture'
import { pinyinSelectFilter } from '../../utils/selectSearch'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
]

const SCHEDULE_TYPE_OPTIONS = [
  { label: '定时只发送一次', value: 'ONCE' },
  { label: '定时循环发送', value: 'RECURRING' },
]

const RECURRING_TYPE_OPTIONS = [
  { label: '每天', value: 'DAILY' },
  { label: '每周', value: 'WEEKLY' },
]
const FEISHU_CHAT_QUERY_PAGE_SIZE = 100
const FEISHU_CHAT_QUERY_MAX_PAGES = 30
const FEISHU_CHAT_QUERY_MAX_ITEMS = 3000
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function buildUploadFormData(policy = {}, file = null) {
  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  return formData
}

function normalizeFeishuChatId(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^oc\._/i.test(normalized)) return `oc_${normalized.slice(4)}`
  if (/^oc\./i.test(normalized)) return `oc_${normalized.slice(3)}`
  return normalized
}

function normalizeImageUrls(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]/)
  return Array.from(
    new Set(
      source
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 9)
}

function buildImageUploadFileList(urls = []) {
  return normalizeImageUrls(urls).map((url, index) => ({
    uid: `culture-image-${index}-${url}`,
    name: `配图${index + 1}`,
    status: 'done',
    url,
  }))
}

function formatDateTime(value) {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value)
}

function formatSchedule(record) {
  const type = String(record?.schedule_type || 'DAILY').toUpperCase()
  if (type === 'ONCE') return `一次性 ${formatDateTime(record?.schedule_once_at)}`
  if (type === 'WEEKLY') {
    const weekdays = Array.isArray(record?.schedule_weekdays) ? record.schedule_weekdays : []
    const text = weekdays
      .map((value) => WEEKDAY_OPTIONS.find((item) => item.value === Number(value))?.label)
      .filter(Boolean)
      .join('、')
    return `${text || '未设置'} ${record?.schedule_time || ''}`
  }
  return `每天 ${record?.schedule_time || ''}`
}

function normalizeResultData(result) {
  const data = result?.data || {}
  return {
    list: Array.isArray(data.list) ? data.list : [],
    pagination: data.pagination || { page: 1, pageSize: 20, total: 0 },
  }
}

function buildPayload(values, selectedChat) {
  const scheduleMode = String(values.schedule_type || 'RECURRING').toUpperCase()
  const scheduleType = scheduleMode === 'ONCE'
    ? 'ONCE'
    : String(values.recurring_type || 'DAILY').toUpperCase()
  return {
    config_name: values.config_name,
    enabled: Boolean(values.enabled),
    target_chat_id: values.target_chat_id,
    target_chat_name: selectedChat?.label || selectedChat?.name || values.target_chat_name || '',
    schedule_type: scheduleType,
    schedule_time: scheduleType === 'ONCE' ? null : values.schedule_time?.format?.('HH:mm') || values.schedule_time || '',
    schedule_weekdays: scheduleType === 'WEEKLY' ? values.schedule_weekdays || [] : [],
    schedule_once_at: scheduleType === 'ONCE' ? values.schedule_once_at?.format?.('YYYY-MM-DD HH:mm:ss') || null : null,
    message_title: values.message_title,
    message_content: values.message_content,
    image_url: normalizeImageUrls(values.image_urls || values.image_url)[0] || '',
    image_urls: normalizeImageUrls(values.image_urls || values.image_url),
    link_text: values.link_text,
    link_url: values.link_url,
    remark: values.remark,
  }
}

function CulturePushConfigPage() {
  const [form] = Form.useForm()
  const scheduleType = Form.useWatch('schedule_type', form)
  const recurringType = Form.useWatch('recurring_type', form)
  const imageUrls = Form.useWatch('image_urls', form)
  const messageTitle = Form.useWatch('message_title', form)
  const messageContent = Form.useWatch('message_content', form)
  const linkText = Form.useWatch('link_text', form)
  const linkUrl = Form.useWatch('link_url', form)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageFileList, setImageFileList] = useState([])
  const [testingId, setTestingId] = useState(null)
  const [configs, setConfigs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 })
  const [filters, setFilters] = useState({ keyword: '', enabled: undefined })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [chatOptions, setChatOptions] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedChat, setSelectedChat] = useState(null)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [logRecord, setLogRecord] = useState(null)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)

  const getCurrentQuery = useCallback((overrides = {}) => ({
    page: pagination.page,
    pageSize: pagination.pageSize,
    keyword: filters.keyword,
    enabled: filters.enabled,
    ...overrides,
  }), [filters.enabled, filters.keyword, pagination.page, pagination.pageSize])

  const fetchConfigs = useCallback(async (next = {}) => {
    setLoading(true)
    try {
      const query = {
        page: next.page || 1,
        pageSize: next.pageSize || 20,
        keyword: next.keyword ?? '',
        enabled: next.enabled,
      }
      const result = await getCulturePushConfigsApi(query)
      if (!result?.success) {
        message.error(result?.message || '获取文化推送配置失败')
        return
      }
      const data = normalizeResultData(result)
      setConfigs(data.list)
      setPagination(data.pagination)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs({ page: 1, pageSize: 20 })
  }, [fetchConfigs])

  const loadFeishuChats = useCallback(async (keyword = '') => {
    setChatLoading(true)
    try {
      const normalizedKeyword = String(keyword || '').trim()
      const seen = new Set()
      const options = []
      let pageToken = ''
      let page = 0

      while (page < FEISHU_CHAT_QUERY_MAX_PAGES && options.length < FEISHU_CHAT_QUERY_MAX_ITEMS) {
        const result = await getCultureFeishuChatsApi({
          keyword: normalizedKeyword || undefined,
          page_size: FEISHU_CHAT_QUERY_PAGE_SIZE,
          page_token: pageToken || undefined,
        })
        if (!result?.success) {
          message.error(result?.message || '获取飞书群失败')
          return
        }

        const rows = Array.isArray(result?.data?.items)
          ? result.data.items
          : Array.isArray(result?.data?.list)
            ? result.data.list
            : []
        rows.forEach((item) => {
          const chatId = normalizeFeishuChatId(item?.chat_id)
          if (!chatId || seen.has(chatId)) return
          seen.add(chatId)
          const name = String(item?.name || '').trim() || chatId
          options.push({
            label: name,
            value: chatId,
            name,
            searchText: `${name} ${chatId}`.trim(),
          })
        })

        page += 1
        const hasMore = Boolean(result?.data?.has_more)
        const nextPageToken = String(
          result?.data?.next_page_token || result?.data?.page_token || '',
        ).trim()
        if (!hasMore || !nextPageToken) break
        pageToken = nextPageToken
      }

      setChatOptions((prev) => {
        const map = new Map()
        ;[...options, ...(Array.isArray(prev) ? prev : [])].forEach((item) => {
          map.set(item.value, item)
        })
        return Array.from(map.values())
      })
    } finally {
      setChatLoading(false)
    }
  }, [])

  const openCreate = () => {
    setEditingRecord(null)
    setSelectedChat(null)
    setImageFileList([])
    form.setFieldsValue({
      config_name: '',
      enabled: true,
      target_chat_id: undefined,
      schedule_type: 'RECURRING',
      recurring_type: 'DAILY',
      schedule_time: dayjs('09:00', 'HH:mm'),
      schedule_weekdays: [1],
      schedule_once_at: null,
      message_title: '',
      message_content: '',
      image_url: '',
      image_urls: [],
      link_text: '查看详情',
      link_url: '',
      remark: '',
    })
    setModalOpen(true)
    loadFeishuChats()
  }

  const openEdit = (record) => {
    const chatOption = {
      label: record.target_chat_name || record.target_chat_id,
      value: record.target_chat_id,
      name: record.target_chat_name || '',
    }
    setEditingRecord(record)
    setSelectedChat(chatOption)
    setChatOptions((prev) => {
      const map = new Map(prev.map((item) => [item.value, item]))
      map.set(chatOption.value, chatOption)
      return Array.from(map.values())
    })
    form.setFieldsValue({
      config_name: record.config_name || '',
      enabled: Boolean(record.enabled),
      target_chat_id: record.target_chat_id || undefined,
      schedule_type: record.schedule_type === 'ONCE' ? 'ONCE' : 'RECURRING',
      recurring_type: record.schedule_type === 'WEEKLY' ? 'WEEKLY' : 'DAILY',
      schedule_time: record.schedule_time ? dayjs(record.schedule_time, 'HH:mm') : null,
      schedule_weekdays: record.schedule_weekdays || [],
      schedule_once_at: record.schedule_once_at ? dayjs(record.schedule_once_at) : null,
      message_title: record.message_title || '',
      message_content: record.message_content || '',
      image_url: record.image_url || '',
      image_urls: normalizeImageUrls(record.image_urls || record.image_url),
      link_text: record.link_text || '查看详情',
      link_url: record.link_url || '',
      remark: record.remark || '',
    })
    setModalOpen(true)
    setImageFileList(buildImageUploadFileList(record.image_urls || record.image_url))
    loadFeishuChats()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = buildPayload(values, selectedChat)
      const result = editingRecord?.id
        ? await updateCulturePushConfigApi(editingRecord.id, payload)
        : await createCulturePushConfigApi(payload)
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      message.success('保存成功')
      setModalOpen(false)
      fetchConfigs(getCurrentQuery())
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (record, enabled) => {
    const result = await updateCulturePushConfigEnabledApi(record.id, enabled)
    if (!result?.success) {
      message.error(result?.message || '更新状态失败')
      return
    }
    message.success(enabled ? '已启用' : '已停用')
    fetchConfigs(getCurrentQuery())
  }

  const handleDelete = async (record) => {
    const result = await deleteCulturePushConfigApi(record.id)
    if (!result?.success) {
      message.error(result?.message || '删除失败')
      return
    }
    message.success('删除成功')
    fetchConfigs({ page: 1 })
  }

  const handleTestSend = async (record) => {
    setTestingId(record.id)
    try {
      const result = await sendCulturePushConfigTestApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '立即发送失败')
        return
      }
      message.success(result?.message || '测试发送成功')
      fetchConfigs(getCurrentQuery())
    } finally {
      setTestingId(null)
    }
  }

  const handleImageUpload = async ({ file, onSuccess, onError }) => {
    const selectedFile = file
    if (!selectedFile) {
      onError?.(new Error('请选择图片'))
      return
    }
    const mimeType = String(selectedFile.type || '').toLowerCase()
    if (mimeType && !IMAGE_MIME_TYPES.has(mimeType)) {
      const error = new Error('仅支持 JPG、PNG、GIF、WebP 图片')
      message.error(error.message)
      onError?.(error)
      return
    }
    if (Number(selectedFile.size || 0) > 10 * 1024 * 1024) {
      const error = new Error('图片大小不能超过 10MB')
      message.error(error.message)
      onError?.(error)
      return
    }

    setImageUploading(true)
    try {
      const policyResult = await getCulturePushImageUploadPolicyApi({
        file_name: selectedFile.name,
        file_size: selectedFile.size || 0,
        mime_type: selectedFile.type || '',
      })
      if (!policyResult?.success) {
        throw new Error(policyResult?.message || '获取上传策略失败')
      }
      const policy = policyResult.data || {}
      const uploadResponse = await fetch(policy.host, {
        method: 'POST',
        body: buildUploadFormData(policy, selectedFile),
      })
      if (!uploadResponse.ok) {
        throw new Error(`上传失败(${uploadResponse.status})`)
      }
      const objectUrl = String(policy.object_url || '').trim()
      const nextUrls = normalizeImageUrls([
        ...(form.getFieldValue('image_urls') || []),
        objectUrl,
      ])
      form.setFieldValue('image_urls', nextUrls)
      form.setFieldValue('image_url', nextUrls[0] || '')
      setImageFileList(buildImageUploadFileList(nextUrls))
      message.success('图片上传成功')
      onSuccess?.({ url: objectUrl }, selectedFile)
    } catch (error) {
      message.error(error?.message || '图片上传失败')
      onError?.(error)
    } finally {
      setImageUploading(false)
    }
  }

  const handleImageRemove = (file) => {
    const removeUrl = String(file?.url || file?.response?.url || '').trim()
    const nextUrls = normalizeImageUrls(form.getFieldValue('image_urls')).filter((url) => url !== removeUrl)
    form.setFieldValue('image_urls', nextUrls)
    form.setFieldValue('image_url', nextUrls[0] || '')
    setImageFileList(buildImageUploadFileList(nextUrls))
    return true
  }

  const loadLogs = useCallback(async (record) => {
    setLogsLoading(true)
    try {
      const result = await getCulturePushConfigLogsApi(record.id, { page: 1, pageSize: 20 })
      if (!result?.success) {
        message.error(result?.message || '获取发送记录失败')
        return
      }
      setLogs(Array.isArray(result?.data?.list) ? result.data.list : [])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const openLogs = (record) => {
    setLogRecord(record)
    setLogs([])
    setLogModalOpen(true)
    loadLogs(record)
  }

  const previewLink = useMemo(() => String(linkUrl || '').trim(), [linkUrl])

  const columns = [
    {
      title: '配置名称',
      dataIndex: 'config_name',
      key: 'config_name',
      width: 180,
      render: (value, record) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.message_title || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '飞书群',
      dataIndex: 'target_chat_name',
      key: 'target_chat_name',
      width: 180,
      render: (value, record) => value || record.target_chat_id || '-',
    },
    {
      title: '发送规则',
      key: 'schedule',
      width: 180,
      render: (_, record) => formatSchedule(record),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 110,
      render: (value, record) => (
        <Switch
          checked={Boolean(value)}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => handleToggle(record, checked)}
        />
      ),
    },
    {
      title: '最近发送',
      dataIndex: 'last_sent_at',
      key: 'last_sent_at',
      width: 150,
      render: formatDateTime,
    },
    {
      title: '下次发送',
      dataIndex: 'next_run_at',
      key: 'next_run_at',
      width: 150,
      render: formatDateTime,
    },
    {
      title: '最近结果',
      dataIndex: 'last_status',
      key: 'last_status',
      width: 120,
      render: (value) => {
        if (!value) return '-'
        const color = value === 'SUCCESS' ? 'green' : value === 'SKIPPED' ? 'gold' : 'red'
        return <Tag color={color}>{value}</Tag>
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            loading={testingId === record.id}
            onClick={() => handleTestSend(record)}
          >
            立即发送
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openLogs(record)}>
            记录
          </Button>
          <Popconfirm
            title="确认删除该文化推送配置？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const logColumns = [
    {
      title: '类型',
      dataIndex: 'send_type',
      key: 'send_type',
      width: 100,
      render: (value) => (value === 'TEST' ? '测试发送' : '定时发送'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value) => <Tag color={value === 'SUCCESS' ? 'green' : value === 'SKIPPED' ? 'gold' : 'red'}>{value}</Tag>,
    },
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: 160,
      render: formatDateTime,
    },
    {
      title: '失败原因',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (value) => value || '-',
    },
  ]

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <BellOutlined style={{ color: '#1677ff', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>文化推送配置</div>
              <Text type="secondary">配置文化中心内容，并定时发送到指定飞书群。</Text>
            </div>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => fetchConfigs(getCurrentQuery())} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建配置
            </Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search
            allowClear
            placeholder="搜索配置名称 / 标题 / 飞书群"
            style={{ width: 300 }}
            value={filters.keyword}
            onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            onSearch={(value) => {
              setFilters((prev) => ({ ...prev, keyword: value }))
              fetchConfigs(getCurrentQuery({ page: 1, keyword: value }))
            }}
          />
          <Select
            allowClear
            placeholder="启用状态"
            style={{ width: 140 }}
            value={filters.enabled}
            options={[
              { label: '启用', value: 1 },
              { label: '停用', value: 0 },
            ]}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, enabled: value }))
              fetchConfigs(getCurrentQuery({ page: 1, enabled: value }))
            }}
          />
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={configs}
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchConfigs(getCurrentQuery({ page, pageSize })),
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文化推送配置" />,
          }}
        />
      </Card>

      <Modal
        title={editingRecord?.id ? '编辑文化推送配置' : '新建文化推送配置'}
        open={modalOpen}
        width={960}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20 }}>
          <Form form={form} layout="vertical">
            <Form.Item label="配置名称" name="config_name" rules={[{ required: true, message: '请输入配置名称' }]}>
              <Input placeholder="例如：周五文化墙推送" maxLength={128} />
            </Form.Item>

            <Form.Item label="发送飞书群" name="target_chat_id" rules={[{ required: true, message: '请选择飞书群' }]}>
              <Select
                allowClear
                showSearch
                filterOption={pinyinSelectFilter}
                loading={chatLoading}
                options={chatOptions}
                notFoundContent={chatLoading ? '加载中...' : '暂无可选飞书群'}
                placeholder="搜索并选择飞书群"
                onSearch={loadFeishuChats}
                onFocus={() => loadFeishuChats()}
                onChange={(value, option) => {
                  setSelectedChat(option || chatOptions.find((item) => item.value === value) || null)
                }}
              />
            </Form.Item>

            <Space size={12} align="start" style={{ width: '100%' }}>
              <Form.Item label="发送频率" name="schedule_type" rules={[{ required: true, message: '请选择发送频率' }]} style={{ width: 180 }}>
                <Select
                  options={SCHEDULE_TYPE_OPTIONS}
                  onChange={(value) => {
                    if (value !== 'ONCE' && !form.getFieldValue('recurring_type')) {
                      form.setFieldValue('recurring_type', 'DAILY')
                    }
                  }}
                />
              </Form.Item>
              {scheduleType === 'ONCE' ? (
                <Form.Item label="发送时间" name="schedule_once_at" rules={[{ required: true, message: '请选择发送时间' }]} style={{ width: 240 }}>
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                <>
                  <Form.Item label="循环频率" name="recurring_type" rules={[{ required: true, message: '请选择循环频率' }]} style={{ width: 140 }}>
                    <Select options={RECURRING_TYPE_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="发送时间" name="schedule_time" rules={[{ required: true, message: '请选择发送时间' }]} style={{ width: 160 }}>
                    <TimePicker format="HH:mm" style={{ width: '100%' }} />
                  </Form.Item>
                </>
              )}
              {scheduleType !== 'ONCE' && recurringType === 'WEEKLY' ? (
                <Form.Item label="发送日期" name="schedule_weekdays" rules={[{ required: true, message: '请选择发送日期' }]} style={{ flex: 1, minWidth: 260 }}>
                  <Select mode="multiple" options={WEEKDAY_OPTIONS} placeholder="选择周几发送" />
                </Form.Item>
              ) : null}
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Space>

            <Form.Item label="自定义标题" name="message_title" rules={[{ required: true, message: '请输入标题' }]}>
              <Input placeholder="飞书卡片标题" maxLength={255} />
            </Form.Item>

            <Form.Item label="主内容文案" name="message_content" rules={[{ required: true, message: '请输入主内容文案' }]}>
              <TextArea rows={8} placeholder="输入要发送到群里的主内容" maxLength={10000} showCount />
            </Form.Item>

            <Form.Item name="image_url" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="image_urls" hidden>
              <Input />
            </Form.Item>
            <Form.Item label="主内容配图" extra="支持上传多张图片，最多 9 张；发送时会按当前顺序展示。">
              <Upload
                accept="image/jpeg,image/png,image/gif,image/webp"
                customRequest={handleImageUpload}
                fileList={imageFileList}
                listType="picture-card"
                multiple
                onRemove={handleImageRemove}
                disabled={imageUploading || imageFileList.length >= 9}
              >
                {imageFileList.length >= 9 ? null : (
                  <div>
                    <UploadOutlined />
                    <div style={{ marginTop: 8 }}>{imageUploading ? '上传中' : '上传'}</div>
                  </div>
                )}
              </Upload>
            </Form.Item>

            <Space size={12} align="start" style={{ width: '100%' }}>
              <Form.Item label="底部链接文案" name="link_text" style={{ width: 180 }}>
                <Input placeholder="查看详情" maxLength={80} />
              </Form.Item>
              <Form.Item label="底部链接地址" name="link_url" style={{ flex: 1 }}>
                <Input placeholder="完整链接优先使用" maxLength={1000} />
              </Form.Item>
            </Space>

            <Form.Item label="备注" name="remark">
              <TextArea rows={3} placeholder="内部说明，可选" maxLength={500} showCount />
            </Form.Item>
          </Form>

          <Card size="small" title="消息预览">
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Text strong>{messageTitle || '自定义标题'}</Text>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {messageContent || '主内容文案会展示在这里'}
              </Paragraph>
              {normalizeImageUrls(imageUrls).length > 0 ? (
                <Image.PreviewGroup>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    {normalizeImageUrls(imageUrls).map((url, index) => (
                      <Image
                        key={url}
                        src={url}
                        alt={`主内容配图${index + 1}`}
                        style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }}
                      />
                    ))}
                  </div>
                </Image.PreviewGroup>
              ) : null}
              {previewLink ? (
                <Button type="primary" block>
                  {linkText || '查看详情'}
                </Button>
              ) : (
                <Text type="secondary">未配置底部链接</Text>
              )}
            </Space>
          </Card>
        </div>
      </Modal>

      <Modal
        title={`发送记录${logRecord?.config_name ? `：${logRecord.config_name}` : ''}`}
        open={logModalOpen}
        width={760}
        footer={null}
        onCancel={() => setLogModalOpen(false)}
      >
        <Table
          rowKey="id"
          columns={logColumns}
          dataSource={logs}
          loading={logsLoading}
          pagination={false}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无发送记录" />,
          }}
        />
      </Modal>
    </Space>
  )
}

export default CulturePushConfigPage
