import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
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
import { CopyOutlined, DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteAppVersionReleaseApi,
  getAppVersionReleasesApi,
  updateAppVersionReleaseApi,
} from '../../api/appVersionRelease'
import { getAccessSnapshot } from '../../utils/access'
import './AppVersionReleasePage.css'

const { Text } = Typography

const DEFAULT_PAGINATION = {
  current: 1,
  pageSize: 20,
  total: 0,
}

const FALLBACK_RELEASE_TYPE_OPTIONS = [
  { code: 'FIRST_RELEASE', name: '首次发版' },
  { code: 'VERSION_UPDATE', name: '版本迭代' },
]

function renderDate(value) {
  return value ? String(value).slice(0, 16) : '-'
}

function toDateTimeValue(value) {
  return value ? dayjs(value) : null
}

function formatDateTimeValue(value) {
  return value ? value.format('YYYY-MM-DD HH:mm:ss') : null
}

function canManageAppRelease() {
  const access = getAccessSnapshot()
  if (!access) return false
  if (access.is_super_admin) return true
  const roleKeys = Array.isArray(access.role_keys) ? access.role_keys : []
  return roleKeys
    .map((item) => String(item || '').trim().toUpperCase())
    .some((roleKey) => ['APP_RELEASE_MANAGER', 'RELEASE_MANAGER', 'APP_VERSION_RELEASE_MANAGER'].includes(roleKey))
}

function AppVersionReleasePage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [appNameFilter, setAppNameFilter] = useState('')
  const [developerFilter, setDeveloperFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [releaseStatus, setReleaseStatus] = useState('')
  const [requestNoFilter, setRequestNoFilter] = useState('')
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION)
  const [rows, setRows] = useState([])
  const [statusOptions, setStatusOptions] = useState([])
  const [releaseTypeOptions, setReleaseTypeOptions] = useState(FALLBACK_RELEASE_TYPE_OPTIONS)
  const [urgencyOptions, setUrgencyOptions] = useState([])
  const [editingRecord, setEditingRecord] = useState(null)

  const canManage = canManageAppRelease()

  const fetchList = useCallback(async (extra = {}) => {
    const nextPage = extra.page || 1
    const nextPageSize = extra.pageSize || DEFAULT_PAGINATION.pageSize
    setLoading(true)
    try {
      const result = await getAppVersionReleasesApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword,
        app_name: appNameFilter || undefined,
        app_developer: developerFilter || undefined,
        urgency_code: urgencyFilter || undefined,
        release_status: releaseStatus || undefined,
        release_request_no: requestNoFilter || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取APP版本发布列表失败')
        return
      }
      const data = result.data || {}
      setRows(Array.isArray(data.list) ? data.list : [])
      setStatusOptions(Array.isArray(data.release_status_options) ? data.release_status_options : [])
      setReleaseTypeOptions(Array.isArray(data.release_type_options) ? data.release_type_options : FALLBACK_RELEASE_TYPE_OPTIONS)
      setUrgencyOptions(Array.isArray(data.urgency_options) ? data.urgency_options : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取APP版本发布列表失败')
    } finally {
      setLoading(false)
    }
  }, [appNameFilter, developerFilter, keyword, releaseStatus, requestNoFilter, urgencyFilter])

  useEffect(() => {
    fetchList({ page: 1 })
  }, [fetchList])

  const statusSelectOptions = useMemo(() => [
    { label: '全部进度', value: '' },
    ...statusOptions.map((item) => ({ label: item.name, value: item.code })),
  ], [statusOptions])

  const urgencySelectOptions = useMemo(() => [
    { label: '全部紧急程度', value: '' },
    ...urgencyOptions.map((item) => ({ label: item.name, value: item.code })),
  ], [urgencyOptions])

  const openEditModal = useCallback((record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      release_type: record.release_type || 'VERSION_UPDATE',
      release_status: record.release_status || 'PENDING_PLAN',
      urgency_code: record.urgency_code || 'P1',
      expected_submit_at: toDateTimeValue(record.expected_submit_at),
      submitted_at: toDateTimeValue(record.submitted_at),
      listed_at: toDateTimeValue(record.listed_at),
      remark: record.remark || '',
    })
  }, [form])

  const handleSave = async () => {
    if (!editingRecord?.id) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = await updateAppVersionReleaseApi(editingRecord.id, {
        release_type: values.release_type,
        release_status: values.release_status,
        urgency_code: values.urgency_code,
        expected_submit_at: formatDateTimeValue(values.expected_submit_at),
        submitted_at: formatDateTimeValue(values.submitted_at),
        listed_at: formatDateTimeValue(values.listed_at),
        remark: values.remark || '',
      })
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      message.success('APP发版记录已保存')
      setEditingRecord(null)
      form.resetFields()
      fetchList({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = useCallback(async (record) => {
    if (!record?.id) return
    setDeletingId(record.id)
    try {
      const result = await deleteAppVersionReleaseApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除失败')
        return
      }
      message.success('APP发版记录已删除')
      fetchList({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }, [fetchList, pagination])

  const handleCopyRequestNo = useCallback(async (value) => {
    const text = String(value || '').trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      message.success('申请ID已复制')
    } catch (error) {
      message.error(error?.message || '复制失败')
    }
  }, [])

  const columns = useMemo(() => {
    const baseColumns = [
    {
      title: '申请ID',
      dataIndex: 'release_request_no',
      width: 150,
      render: (value) => value ? (
        <Space size={4} className="app-version-release-request-no-wrap">
          <Tooltip title={value}>
            <Text className="app-version-release-request-no">{value}</Text>
          </Tooltip>
          <Tooltip title="复制申请ID">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              className="app-version-release-copy-btn"
              onClick={() => handleCopyRequestNo(value)}
            />
          </Tooltip>
        </Space>
      ) : '-',
    },
    {
      title: '版本号',
      dataIndex: 'app_version',
      width: 120,
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value || '-'}</Text>
          <Tag color={record.release_type_color || 'default'}>{record.release_type_name || '-'}</Tag>
        </Space>
      ),
    },
    {
      title: '紧急程度',
      dataIndex: 'urgency_name',
      width: 92,
      render: (value, record) => <Tag color={record.urgency_color || 'default'}>{value || '-'}</Tag>,
    },
    {
      title: 'APP名称',
      dataIndex: 'app_name',
      width: 140,
      render: (value, record) => (
        <Tooltip
          title={(
            <Space direction="vertical" size={2}>
              <Text className="app-version-release-tooltip-text">{value || '-'}</Text>
              <Text className="app-version-release-tooltip-text">包ID：{record.app_id || '-'}</Text>
              <Text className="app-version-release-tooltip-text">域名：{record.domain_info || '-'}</Text>
            </Space>
          )}
        >
          <Text strong className="app-version-release-ellipsis app-version-release-app-name">
            {value || '-'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '开发者账号',
      dataIndex: 'app_developer',
      width: 130,
      render: (value) => value || '-',
    },
    {
      title: '公司主体',
      dataIndex: 'app_company_subject',
      width: 130,
      render: (value) => value || '-',
    },
    {
      title: 'APP后台地址',
      dataIndex: 'app_console_url',
      width: 220,
      render: (value) => value ? (
        <Tooltip title={value}>
          <a href={value} target="_blank" rel="noreferrer" className="app-version-release-link">
            {value}
          </a>
        </Tooltip>
      ) : '-',
    },
    {
      title: '发版进度',
      dataIndex: 'release_status_name',
      width: 110,
      render: (value, record) => <Tag color={record.release_status_color || 'default'}>{value || '-'}</Tag>,
    },
    {
      title: '送审预期',
      dataIndex: 'expected_submit_at',
      width: 150,
      render: renderDate,
    },
    {
      title: '送审日期',
      dataIndex: 'submitted_at',
      width: 150,
      render: renderDate,
    },
    {
      title: '上架日期',
      dataIndex: 'listed_at',
      width: 150,
      render: renderDate,
    },
    {
      title: '关联需求',
      dataIndex: 'related_demand_name',
      width: 160,
      render: (value, record) => {
        const demandId = String(record.related_demand_id || '').trim()
        if (!demandId && !value) return '-'
        return (
          <Space direction="vertical" size={2} className="app-version-release-demand">
            <Tooltip title={value || demandId}>
              <Text className="app-version-release-ellipsis">{value || demandId}</Text>
            </Tooltip>
            {demandId ? (
              <Tooltip title={demandId}>
                <Text type="secondary" className="app-version-release-ellipsis">{demandId}</Text>
              </Tooltip>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '申请信息',
      dataIndex: 'applicant_name',
      width: 150,
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{value || '-'}</Text>
          <Text type="secondary">{renderDate(record.requested_at)}</Text>
        </Space>
      ),
    },
    {
      title: '发版负责人',
      dataIndex: 'owner_name',
      width: 110,
      render: (value) => value || '-',
    },
    ]

    if (!canManage) return baseColumns

    return [
      ...baseColumns,
      {
        title: '操作',
        key: 'action',
        width: 148,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除这条发版记录？"
              description="删除后列表中将不再展示该记录。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: deletingId === record.id }}
              onConfirm={() => handleDelete(record)}
            >
              <Button
                danger
                type="link"
                size="small"
                icon={<DeleteOutlined />}
                loading={deletingId === record.id}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ]
  }, [canManage, deletingId, handleCopyRequestNo, handleDelete, openEditModal])

  return (
    <div className="app-version-release-page">
      <Card variant="borderless" className="app-version-release-card">
        <div className="app-version-release-toolbar">
          <Space size={8} wrap>
            <Input.Search
              allowClear
              placeholder="综合搜索"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={() => fetchList({ page: 1 })}
              className="app-version-release-search"
            />
            <Input
              allowClear
              placeholder="APP名称"
              value={appNameFilter}
              onChange={(event) => {
                setAppNameFilter(event.target.value)
                setPagination((current) => ({ ...current, current: 1 }))
              }}
              className="app-version-release-filter-input"
            />
            <Input
              allowClear
              placeholder="开发者"
              value={developerFilter}
              onChange={(event) => {
                setDeveloperFilter(event.target.value)
                setPagination((current) => ({ ...current, current: 1 }))
              }}
              className="app-version-release-filter-input"
            />
            <Select
              value={urgencyFilter}
              options={urgencySelectOptions}
              onChange={(value) => {
                setUrgencyFilter(value)
                setPagination((current) => ({ ...current, current: 1 }))
              }}
              className="app-version-release-urgency"
            />
            <Select
              value={releaseStatus}
              options={statusSelectOptions}
              onChange={(value) => {
                setReleaseStatus(value)
                setPagination((current) => ({ ...current, current: 1 }))
              }}
              className="app-version-release-status"
            />
            <Input.Search
              allowClear
              placeholder="记录ID"
              value={requestNoFilter}
              onChange={(event) => setRequestNoFilter(event.target.value)}
              onSearch={() => fetchList({ page: 1 })}
              className="app-version-release-record-search"
            />
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchList({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          size="middle"
          scroll={{ x: canManage ? 1470 : 1320 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={(nextPagination) => {
            fetchList({
              page: nextPagination.current,
              pageSize: nextPagination.pageSize,
            })
          }}
        />
      </Card>

      <Modal
        title={editingRecord ? `编辑APP发版：${editingRecord.app_name || '-'}` : '编辑APP发版'}
        open={Boolean(editingRecord)}
        onCancel={() => {
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="发版类型" name="release_type" rules={[{ required: true, message: '请选择发版类型' }]}>
                <Select disabled options={releaseTypeOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="发版进度" name="release_status" rules={[{ required: true, message: '请选择发版进度' }]}>
                <Select options={statusOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="紧急程度" name="urgency_code" rules={[{ required: true, message: '请选择紧急程度' }]}>
                <Select options={urgencyOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="送审预期" name="expected_submit_at">
                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="送审日期" name="submitted_at">
                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="上架日期" name="listed_at">
                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={4} maxLength={1000} showCount placeholder="记录发版安排、审核反馈、上架说明等" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default AppVersionReleasePage
