import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
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
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMatrixPackageApi,
  getMatrixPackagesApi,
  updateMatrixPackageApi,
} from '../../api/matrixPackage'
import { getDictItemsApi } from '../../api/configDict'
import { hasPermission } from '../../utils/access'
import './MatrixPackageSpecialPage.css'

const { Text } = Typography
const STATUS_DICT_KEY = 'matrix_package_status'
const HEALTH_DICT_KEY = 'matrix_package_health'
const DELIVERING_STATUS = 'DELIVERING'

const DEFAULT_STATUS_OPTIONS = [
  { item_code: 'COLD_STANDBY', item_name: '冷备包', color: 'blue' },
  { item_code: 'IN_REVIEW', item_name: '审核中', color: 'gold' },
  { item_code: 'HOT_STANDBY', item_name: '热备包', color: 'green' },
  { item_code: 'DELIVERING', item_name: '投放中', color: 'processing' },
  { item_code: 'BANNED', item_name: '已封禁', color: 'red' },
  { item_code: 'ARCHIVED', item_name: '已归档', color: 'default' },
]

const DEFAULT_HEALTH_OPTIONS = [
  { item_code: 'NORMAL', item_name: '正常', color: 'green' },
  { item_code: 'WATCH', item_name: '关注', color: 'gold' },
  { item_code: 'ABNORMAL', item_name: '异常', color: 'red' },
]

const HEALTH_ICON_MAP = {
  NORMAL: <span className="matrix-health-dot matrix-health-dot-normal" />,
  WATCH: <span className="matrix-health-dot matrix-health-dot-watch" />,
  ABNORMAL: <span className="matrix-health-dot matrix-health-dot-abnormal" />,
}

function normalizeDictItems(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source
    .filter((item) => Number(item.enabled ?? 1) === 1)
    .map((item) => ({
      code: String(item.item_code || '').trim().toUpperCase(),
      name: String(item.item_name || item.item_code || '').trim(),
      color: String(item.color || '').trim() || 'default',
      remark: String(item.remark || '').trim(),
    }))
    .filter((item) => item.code && item.name)
}

function buildDictMap(options) {
  return new Map((options || []).map((item) => [item.code, item]))
}

function getStatusTone(statusCode) {
  if (statusCode === 'DELIVERING') return 'active'
  if (statusCode === 'BANNED') return 'danger'
  if (statusCode === 'ARCHIVED') return 'muted'
  return 'steady'
}

function MatrixPackageSpecialPage() {
  const [form] = Form.useForm()
  const watchedStatusCode = Form.useWatch('status_code', form)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [packages, setPackages] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary] = useState({ total: 0, delivering: 0, abnormal: 0, standby: 0 })
  const [filters, setFilters] = useState({
    keyword: '',
    status_code: undefined,
    health_code: undefined,
    owner_name: '',
  })
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))
  const [healthOptions, setHealthOptions] = useState(DEFAULT_HEALTH_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))

  const canManage = hasPermission('demand.manage')
  const statusMap = useMemo(() => buildDictMap(statusOptions), [statusOptions])
  const healthMap = useMemo(() => buildDictMap(healthOptions), [healthOptions])
  const isDelivering = watchedStatusCode === DELIVERING_STATUS

  const fetchDicts = useCallback(async () => {
    const [statusResult, healthResult] = await Promise.allSettled([
      getDictItemsApi(STATUS_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi(HEALTH_DICT_KEY, { enabledOnly: true }),
    ])

    if (statusResult.status === 'fulfilled' && statusResult.value?.success) {
      setStatusOptions(normalizeDictItems(statusResult.value.data, DEFAULT_STATUS_OPTIONS))
    }
    if (healthResult.status === 'fulfilled' && healthResult.value?.success) {
      setHealthOptions(normalizeDictItems(healthResult.value.data, DEFAULT_HEALTH_OPTIONS))
    }
  }, [])

  const fetchPackages = useCallback(async (next = {}) => {
    const nextPage = next.page || 1
    const nextPageSize = next.pageSize || 20
    setLoading(true)
    try {
      const result = await getMatrixPackagesApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: filters.keyword || undefined,
        status_code: filters.status_code || undefined,
        health_code: filters.health_code || undefined,
        owner_name: filters.owner_name || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取矩阵包列表失败')
        return
      }

      const data = result.data || {}
      setPackages(Array.isArray(data.list) ? data.list : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
      setSummary({
        total: Number(data.summary?.total || data.total || 0),
        delivering: Number(data.summary?.delivering || 0),
        abnormal: Number(data.summary?.abnormal || 0),
        standby: Number(data.summary?.standby || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取矩阵包列表失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchDicts()
  }, [fetchDicts])

  useEffect(() => {
    fetchPackages({ page: 1 })
  }, [filters, fetchPackages])

  useEffect(() => {
    if (watchedStatusCode && watchedStatusCode !== DELIVERING_STATUS) {
      form.setFieldValue('health_code', undefined)
    }
  }, [form, watchedStatusCode])

  const handleCreate = () => {
    setEditingRecord(null)
    form.setFieldsValue({
      package_name: '',
      platform: 'Meta',
      owner_name: '',
      status_code: 'COLD_STANDBY',
      health_code: undefined,
      progress: 0,
      current_stage: '',
      risk_note: '',
      remark: '',
    })
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      package_name: record.package_name || '',
      platform: record.platform || '',
      owner_name: record.owner_name || '',
      status_code: record.status_code || 'COLD_STANDBY',
      health_code: record.health_code || undefined,
      progress: Number(record.progress || 0),
      current_stage: record.current_stage || '',
      risk_note: record.risk_note || '',
      remark: record.remark || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        health_code: values.status_code === DELIVERING_STATUS ? values.health_code : null,
        progress: Number(values.progress || 0),
      }

      setSaving(true)
      const result = editingRecord?.id
        ? await updateMatrixPackageApi(editingRecord.id, payload)
        : await createMatrixPackageApi(payload)

      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success(editingRecord?.id ? '矩阵包已更新' : '矩阵包已新增')
      setModalOpen(false)
      setEditingRecord(null)
      form.resetFields()
      fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '矩阵包',
      dataIndex: 'package_name',
      key: 'package_name',
      fixed: 'left',
      width: 240,
      render: (value, record) => (
        <div className="matrix-package-name-cell">
          <Text strong>{value || '-'}</Text>
          <Space size={4} wrap>
            {record.platform ? <Tag>{record.platform}</Tag> : null}
            {record.owner_name ? <Text type="secondary">{record.owner_name}</Text> : null}
          </Space>
        </div>
      ),
    },
    {
      title: '包状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 130,
      render: (value, record) => {
        const meta = statusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '健康度',
      dataIndex: 'health_code',
      key: 'health_code',
      width: 130,
      render: (value, record) => {
        if (record.status_code !== DELIVERING_STATUS) return <Text type="secondary">不适用</Text>
        const meta = healthMap.get(value) || { name: record.health_name || value || '-', color: record.health_color || 'default' }
        return (
          <Tag color={record.health_color || meta.color} className="matrix-health-tag">
            {HEALTH_ICON_MAP[value] || null}
            {meta.name}
          </Tag>
        )
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (value, record) => (
        <Progress
          percent={Number(value || 0)}
          size="small"
          status={record.health_code === 'ABNORMAL' || record.status_code === 'BANNED' ? 'exception' : 'active'}
        />
      ),
    },
    {
      title: '当前阶段',
      dataIndex: 'current_stage',
      key: 'current_stage',
      width: 180,
      render: (value) => value || '-',
    },
    {
      title: '风险说明',
      dataIndex: 'risk_note',
      key: 'risk_note',
      ellipsis: true,
      render: (value) => value || <Text type="secondary">暂无</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 96,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          disabled={!canManage}
          onClick={() => handleEdit(record)}
        >
          编辑
        </Button>
      ),
    },
  ]

  return (
    <div className="matrix-package-page">
      <div className="matrix-package-head">
        <div>
          <h1>矩阵包全景图</h1>
          <p>集中查看所有矩阵包状态，优先识别投放异常与可启用热备包。</p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} disabled={!canManage}>
            新增矩阵包
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} className="matrix-summary-row">
        <Col xs={12} lg={6}>
          <Card variant="borderless" className="matrix-summary-card matrix-summary-card-total">
            <Statistic title="矩阵包总数" value={summary.total} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card variant="borderless" className="matrix-summary-card">
            <Statistic title="投放中" value={summary.delivering} prefix={<FireOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card variant="borderless" className="matrix-summary-card">
            <Statistic title="需关注" value={summary.abnormal} prefix={<AlertOutlined />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card variant="borderless" className="matrix-summary-card">
            <Statistic title="备包池" value={summary.standby} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" className="matrix-filter-card">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={7}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索名称、平台、负责人、阶段"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              allowClear
              placeholder="包状态"
              value={filters.status_code}
              options={statusOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, status_code: value }))}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              allowClear
              placeholder="健康度"
              value={filters.health_code}
              options={healthOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, health_code: value }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <Input
              allowClear
              placeholder="负责人"
              value={filters.owner_name}
              onChange={(event) => setFilters((prev) => ({ ...prev, owner_name: event.target.value }))}
            />
          </Col>
        </Row>
      </Card>

      <Card variant="borderless" className="matrix-table-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={packages}
          scroll={{ x: 1180 }}
          rowClassName={(record) => `matrix-table-row-${getStatusTone(record.status_code)}`}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无矩阵包"
              />
            ),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchPackages({ page, pageSize }),
          }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑矩阵包' : '新增矩阵包'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="matrix-package-form">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="矩阵包名称"
                name="package_name"
                rules={[{ required: true, message: '请输入矩阵包名称' }]}
              >
                <Input placeholder="例如：Meta-US-热备包-01" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="平台" name="platform">
                <Select
                  allowClear
                  placeholder="选择平台"
                  options={[
                    { label: 'Meta', value: 'Meta' },
                    { label: 'Google', value: 'Google' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="负责人" name="owner_name">
                <Input placeholder="输入负责人" maxLength={80} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="包状态"
                name="status_code"
                rules={[{ required: true, message: '请选择包状态' }]}
              >
                <Select
                  options={statusOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="健康度"
                name="health_code"
                rules={isDelivering ? [{ required: true, message: '投放中必须选择健康度' }] : []}
              >
                <Select
                  disabled={!isDelivering}
                  placeholder={isDelivering ? '选择健康度' : '仅投放中生效'}
                  options={healthOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="进度" name="progress">
                <InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="当前阶段" name="current_stage">
                <Input placeholder="例如：审核等待、预算消耗、素材复盘" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="风险说明" name="risk_note">
                <Input.TextArea rows={3} placeholder="记录需要关注或排查的问题" maxLength={500} showCount />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="补充说明" maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default MatrixPackageSpecialPage
