import {
  EditOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMatrixPackagesApi,
  updateMatrixPackageApi,
} from '../../api/matrixPackage'
import { getDeveloperAccountOptionsApi } from '../../api/developerAccount'
import { getDictItemsApi } from '../../api/configDict'
import { hasPermission } from '../../utils/access'
import './ColdStandbyProductionPage.css'

const { Text } = Typography
const STATUS_DICT_KEY = 'matrix_package_status'
const PRODUCTION_STAGE_DICT_KEY = 'matrix_package_production_stage'
const PRODUCTION_STATUS_CODES = ['IN_DEVELOPMENT', 'COLD_STANDBY']

const DEFAULT_STATUS_OPTIONS = [
  { item_code: 'IN_DEVELOPMENT', item_name: '开发中', color: 'cyan' },
  { item_code: 'COLD_STANDBY', item_name: '冷备包', color: 'blue' },
]

const DEFAULT_STAGE_OPTIONS = [
  { item_code: 'REQUIREMENT_CONFIRM', item_name: '需求确认', color: 'default' },
  { item_code: 'ASSET_PREPARE', item_name: '素材准备', color: 'blue' },
  { item_code: 'DEVELOPING', item_name: '开发中', color: 'cyan' },
  { item_code: 'PACKAGING', item_name: '打包中', color: 'geekblue' },
  { item_code: 'SELF_TEST', item_name: '自测中', color: 'gold' },
  { item_code: 'READY_FOR_COLD_STANDBY', item_name: '待转冷备', color: 'green' },
]

const CHECKLIST_TOTAL = 6

function normalizeDictItems(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source
    .filter((item) => Number(item.enabled ?? 1) === 1)
    .map((item) => ({
      code: String(item.item_code || '').trim().toUpperCase(),
      name: String(item.item_name || item.item_code || '').trim(),
      color: String(item.color || '').trim() || 'default',
    }))
    .filter((item) => item.code && item.name)
}

function buildDictMap(options) {
  return new Map((options || []).map((item) => [item.code, item]))
}

function getChecklistPercent(values) {
  const checked = Array.isArray(values) ? values.length : 0
  return Math.round((checked / CHECKLIST_TOTAL) * 100)
}

function getConfigCompletionPercent(record) {
  const sideNotePercent = Number(record?.side_note_completion_percent)
  if (Number.isFinite(sideNotePercent)) return sideNotePercent
  return getChecklistPercent(record?.production_checklist)
}

function getRowTone(statusCode) {
  if (statusCode === 'COLD_STANDBY') return 'done'
  if (statusCode === 'IN_DEVELOPMENT') return 'active'
  return 'pending'
}

function ColdStandbyProductionPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [packages, setPackages] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [filters, setFilters] = useState({
    keyword: '',
    developer_account_id: undefined,
    status_code: undefined,
    production_stage_code: undefined,
  })
  const [developerAccountOptions, setDeveloperAccountOptions] = useState([])
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
  })))
  const [stageOptions, setStageOptions] = useState(DEFAULT_STAGE_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
  })))

  const canManage = hasPermission('matrix_package.manage')
  const statusMap = useMemo(() => buildDictMap(statusOptions), [statusOptions])
  const stageMap = useMemo(() => buildDictMap(stageOptions), [stageOptions])

  const fetchDicts = useCallback(async () => {
    const [statusResult, stageResult] = await Promise.allSettled([
      getDictItemsApi(STATUS_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi(PRODUCTION_STAGE_DICT_KEY, { enabledOnly: true }),
    ])
    if (statusResult.status === 'fulfilled' && statusResult.value?.success) {
      const items = normalizeDictItems(statusResult.value.data, DEFAULT_STATUS_OPTIONS)
      setStatusOptions(items.filter((item) => PRODUCTION_STATUS_CODES.includes(item.code)))
    }
    if (stageResult.status === 'fulfilled' && stageResult.value?.success) {
      setStageOptions(normalizeDictItems(stageResult.value.data, DEFAULT_STAGE_OPTIONS))
    }
  }, [])

  const fetchDeveloperAccounts = useCallback(async () => {
    const result = await getDeveloperAccountOptionsApi()
    if (result?.success) {
      setDeveloperAccountOptions(Array.isArray(result.data) ? result.data : [])
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
        production_only: 1,
        keyword: filters.keyword || undefined,
        developer_account_id: filters.developer_account_id || undefined,
        status_code: filters.status_code || undefined,
        production_stage_code: filters.production_stage_code || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取冷备包生产线失败')
        return
      }
      const data = result.data || {}
      setPackages(Array.isArray(data.list) ? data.list : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取冷备包生产线失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchDicts()
  }, [fetchDicts])

  useEffect(() => {
    fetchDeveloperAccounts()
  }, [fetchDeveloperAccounts])

  useEffect(() => {
    fetchPackages({ page: 1 })
  }, [filters, fetchPackages])

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      status_code: record.status_code || 'IN_DEVELOPMENT',
      expected_cold_ready_date: record.expected_cold_ready_date ? dayjs(record.expected_cold_ready_date) : null,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!editingRecord?.id) return
    try {
      const values = await form.validateFields()
      const payload = {
        package_name: editingRecord.package_name,
        developer_account_id: editingRecord.developer_account_id || null,
        platform: editingRecord.platform || '',
        owner_name: editingRecord.owner_name || '',
        health_code: editingRecord.health_code || null,
        status_code: values.status_code,
        expected_cold_ready_date: values.expected_cold_ready_date
          ? values.expected_cold_ready_date.format('YYYY-MM-DD')
          : null,
      }

      setSaving(true)
      const result = await updateMatrixPackageApi(editingRecord.id, payload)
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      message.success('快速编辑已保存')
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
        <div className="cold-production-name-cell">
          <Text strong>{value || '-'}</Text>
          <Space size={4} wrap>
            {record.new_package_version ? <Tag color="blue">{record.new_package_version}</Tag> : null}
            {record.owner_name ? <Text type="secondary">{record.owner_name}</Text> : null}
          </Space>
        </div>
      ),
    },
    {
      title: '开发者账号',
      dataIndex: 'developer_account_id',
      key: 'developer_account_id',
      width: 220,
      render: (_, record) => (
        <div className="cold-production-account-cell">
          <Text>{record.developer_account_name || '-'}</Text>
          {record.developer_company_name ? <Text type="secondary">{record.developer_company_name}</Text> : null}
        </div>
      ),
    },
    {
      title: '包状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 120,
      render: (value, record) => {
        const meta = statusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '生产节点',
      dataIndex: 'production_stage_code',
      key: 'production_stage_code',
      width: 130,
      render: (value, record) => {
        if (!value) return <Text type="secondary">未设置</Text>
        const meta = stageMap.get(value) || { name: record.production_stage_name || value, color: record.production_stage_color || 'default' }
        return <Tag color={record.production_stage_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '预计冷备完成',
      dataIndex: 'expected_cold_ready_date',
      key: 'expected_cold_ready_date',
      width: 140,
      render: (value) => value || <Text type="secondary">未设置</Text>,
    },
    {
      title: '配置完整度',
      dataIndex: 'side_note_completion_percent',
      key: 'side_note_completion_percent',
      width: 150,
      render: (_, record) => <Progress percent={getConfigCompletionPercent(record)} size="small" />,
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
      width: 240,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" icon={<FileTextOutlined />} onClick={() => navigate(`/matrix-package-special/cold-standby-production/${record.id}`)}>
            生产详情
          </Button>
          <Button type="link" icon={<EditOutlined />} disabled={!canManage} onClick={() => handleEdit(record)}>
            快速编辑
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="cold-production-page">
      <div className="cold-production-head">
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Card variant="borderless" className="cold-production-filter-card">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={7}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索包名、账号、负责人"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <Select
              allowClear
              showSearch
              placeholder="开发者账号"
              value={filters.developer_account_id}
              optionFilterProp="label"
              options={developerAccountOptions.map((item) => ({
                label: `${item.company_name || '-'} / ${item.account_name || '-'}`,
                value: item.id,
              }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, developer_account_id: value }))}
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
              placeholder="生产节点"
              value={filters.production_stage_code}
              options={stageOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, production_stage_code: value }))}
            />
          </Col>
        </Row>
      </Card>

      <Card variant="borderless" className="cold-production-table-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={packages}
          scroll={{ x: 1280 }}
          rowClassName={(record) => `cold-production-row-${getRowTone(record.status_code)}`}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无冷备包生产任务"
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
        title={editingRecord ? `快速编辑：${editingRecord.package_name || ''}` : '快速编辑'}
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
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="cold-production-form">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="包状态"
                name="status_code"
                rules={[{ required: true, message: '请选择包状态' }]}
              >
                <Select options={statusOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="预计冷备完成时间" name="expected_cold_ready_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default ColdStandbyProductionPage
