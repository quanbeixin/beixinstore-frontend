import {
  EditOutlined,
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
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createDeveloperAccountApi,
  getDeveloperAccountsApi,
  updateDeveloperAccountApi,
} from '../../api/developerAccount'
import { getMatrixPackagesApi } from '../../api/matrixPackage'
import { getDictItemsApi } from '../../api/configDict'
import { getUsersApi } from '../../api/users'
import { hasPermission } from '../../utils/access'
import './DeveloperAccountPage.css'

const { Text } = Typography
const STATUS_DICT_KEY = 'developer_account_status'
const DELIVERING_STATUS = 'DELIVERING'

const DEFAULT_STATUS_OPTIONS = [
  { item_code: 'NORMAL', item_name: '正常', color: 'green' },
  { item_code: 'RISK', item_name: '风险', color: 'gold' },
  { item_code: 'BANNED', item_name: '封禁', color: 'red' },
  { item_code: 'DISABLED', item_name: '停用', color: 'default' },
]

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

function getRowTone(statusCode) {
  if (statusCode === 'RISK') return 'risk'
  if (statusCode === 'BANNED') return 'banned'
  if (statusCode === 'DISABLED') return 'disabled'
  return 'normal'
}

function DeveloperAccountPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [packageModalOpen, setPackageModalOpen] = useState(false)
  const [packageModalAccount, setPackageModalAccount] = useState(null)
  const [packageLoading, setPackageLoading] = useState(false)
  const [accountPackages, setAccountPackages] = useState([])
  const [accounts, setAccounts] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [filters, setFilters] = useState({
    keyword: '',
    company_name: '',
    status_code: undefined,
    owner_name: '',
  })
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
  })))
  const [userOptions, setUserOptions] = useState([])
  const [packageStatusOptions, setPackageStatusOptions] = useState([])
  const [packageHealthOptions, setPackageHealthOptions] = useState([])

  const canManage = hasPermission('demand.manage')
  const statusMap = useMemo(() => buildDictMap(statusOptions), [statusOptions])
  const packageStatusMap = useMemo(() => buildDictMap(packageStatusOptions), [packageStatusOptions])
  const packageHealthMap = useMemo(() => buildDictMap(packageHealthOptions), [packageHealthOptions])

  const fetchDicts = useCallback(async () => {
    const [accountStatusResult, packageStatusResult, packageHealthResult] = await Promise.allSettled([
      getDictItemsApi(STATUS_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi('matrix_package_status', { enabledOnly: true }),
      getDictItemsApi('matrix_package_health', { enabledOnly: true }),
    ])

    if (accountStatusResult.status === 'fulfilled' && accountStatusResult.value?.success) {
      setStatusOptions(normalizeDictItems(accountStatusResult.value.data, DEFAULT_STATUS_OPTIONS))
    }
    if (packageStatusResult.status === 'fulfilled' && packageStatusResult.value?.success) {
      setPackageStatusOptions(normalizeDictItems(packageStatusResult.value.data, []))
    }
    if (packageHealthResult.status === 'fulfilled' && packageHealthResult.value?.success) {
      setPackageHealthOptions(normalizeDictItems(packageHealthResult.value.data, []))
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    const result = await getUsersApi({ page: 1, pageSize: 1000, keyword: '', sort_by: 'real_name', sort_order: 'asc' })
    if (result?.success) {
      setUserOptions(Array.isArray(result.data?.list) ? result.data.list : [])
    }
  }, [])

  const fetchAccounts = useCallback(async (next = {}) => {
    const nextPage = next.page || 1
    const nextPageSize = next.pageSize || 20
    setLoading(true)
    try {
      const result = await getDeveloperAccountsApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: filters.keyword || undefined,
        company_name: filters.company_name || undefined,
        status_code: filters.status_code || undefined,
        owner_name: filters.owner_name || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取开发者账号列表失败')
        return
      }

      const data = result.data || {}
      setAccounts(Array.isArray(data.list) ? data.list : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取开发者账号列表失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchDicts()
  }, [fetchDicts])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchAccounts({ page: 1 })
  }, [filters, fetchAccounts])

  const handleCreate = () => {
    setEditingRecord(null)
    form.setFieldsValue({
      company_name: '',
      account_name: '',
      account_id: '',
      status_code: 'NORMAL',
      owner_user_id: undefined,
    })
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      company_name: record.company_name || '',
      account_name: record.account_name || '',
      account_id: record.account_id || '',
      status_code: record.status_code || 'NORMAL',
      owner_user_id: record.owner_user_id || undefined,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = editingRecord?.id
        ? await updateDeveloperAccountApi(editingRecord.id, values)
        : await createDeveloperAccountApi(values)

      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success(editingRecord?.id ? '开发者账号已更新' : '开发者账号已新增')
      setModalOpen(false)
      setEditingRecord(null)
      form.resetFields()
      fetchAccounts({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const openPackageModal = async (record) => {
    setPackageModalAccount(record)
    setPackageModalOpen(true)
    setPackageLoading(true)
    try {
      const result = await getMatrixPackagesApi({
        page: 1,
        pageSize: 100,
        developer_account_id: record.id,
      })
      if (!result?.success) {
        message.error(result?.message || '获取账号矩阵包失败')
        setAccountPackages([])
        return
      }
      setAccountPackages(Array.isArray(result.data?.list) ? result.data.list : [])
    } catch (error) {
      message.error(error?.message || '获取账号矩阵包失败')
      setAccountPackages([])
    } finally {
      setPackageLoading(false)
    }
  }

  const packageColumns = [
    {
      title: '矩阵包',
      dataIndex: 'package_name',
      key: 'package_name',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value || '-'}</Text>
          {record.owner_name ? <Text type="secondary">{record.owner_name}</Text> : null}
        </Space>
      ),
    },
    {
      title: '包状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 130,
      render: (value, record) => {
        const meta = packageStatusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
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
        const meta = packageHealthMap.get(value) || { name: record.health_name || value || '-', color: record.health_color || 'default' }
        return <Tag color={record.health_color || meta.color}>{meta.name}</Tag>
      },
    },
  ]

  const columns = [
    {
      title: '开发者账号',
      dataIndex: 'account_name',
      key: 'account_name',
      fixed: 'left',
      width: 260,
      render: (value, record) => (
        <div className="developer-account-name-cell">
          <Text strong>{value || '-'}</Text>
          <Text type="secondary">{record.company_name || '-'}</Text>
        </div>
      ),
    },
    {
      title: '账号ID',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 180,
      render: (value) => value || <Text type="secondary">未填写</Text>,
    },
    {
      title: '账号状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 120,
      render: (value, record) => {
        const meta = statusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '负责人',
      dataIndex: 'owner_user_id',
      key: 'owner_name',
      width: 140,
      render: (_, record) => record.owner_name || <Text type="secondary">未设置</Text>,
    },
    {
      title: '矩阵包数量',
      dataIndex: 'package_count',
      key: 'package_count',
      width: 120,
      render: (value, record) => {
        const count = Number(value || 0)
        if (count <= 0) return count
        return (
          <Button type="link" className="developer-account-package-count" onClick={() => openPackageModal(record)}>
            {count}
          </Button>
        )
      },
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
    <div className="developer-account-page">
      <div className="developer-account-head">
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchAccounts({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} disabled={!canManage}>
            新增开发者账号
          </Button>
        </Space>
      </div>

      <Card variant="borderless" className="developer-account-filter-card">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={7}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索主体、账号、账号ID、负责人"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <Input
              allowClear
              placeholder="公司主体"
              value={filters.company_name}
              onChange={(event) => setFilters((prev) => ({ ...prev, company_name: event.target.value }))}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              allowClear
              placeholder="账号状态"
              value={filters.status_code}
              options={statusOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, status_code: value }))}
            />
          </Col>
          <Col xs={12} md={5}>
            <Input
              allowClear
              placeholder="负责人"
              value={filters.owner_name}
              onChange={(event) => setFilters((prev) => ({ ...prev, owner_name: event.target.value }))}
            />
          </Col>
        </Row>
      </Card>

      <Card variant="borderless" className="developer-account-table-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={accounts}
          scroll={{ x: 1080 }}
          rowClassName={(record) => `developer-account-row-${getRowTone(record.status_code)}`}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无开发者账号"
              />
            ),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchAccounts({ page, pageSize }),
          }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑开发者账号' : '新增开发者账号'}
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
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="developer-account-form">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="公司主体"
                name="company_name"
                rules={[{ required: true, message: '请输入公司主体' }]}
              >
                <Input placeholder="输入公司主体" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="开发者账号名称"
                name="account_name"
                rules={[{ required: true, message: '请输入开发者账号名称' }]}
              >
                <Input placeholder="输入账号名称" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="账号ID" name="account_id">
                <Input placeholder="输入平台侧账号ID" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="账号状态"
                name="status_code"
                rules={[{ required: true, message: '请选择账号状态' }]}
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
              <Form.Item label="负责人" name="owner_user_id">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择系统用户"
                  optionFilterProp="label"
                  options={userOptions.map((item) => {
                    const name = item.real_name || item.username || `用户${item.id}`
                    return {
                      label: item.department_name ? `${name} / ${item.department_name}` : name,
                      value: item.id,
                    }
                  })}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={packageModalAccount ? `${packageModalAccount.account_name || '开发者账号'} 的矩阵包` : '账号矩阵包'}
        open={packageModalOpen}
        onCancel={() => {
          setPackageModalOpen(false)
          setPackageModalAccount(null)
          setAccountPackages([])
        }}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Table
          rowKey="id"
          loading={packageLoading}
          columns={packageColumns}
          dataSource={accountPackages}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该账号下暂无矩阵包"
              />
            ),
          }}
        />
      </Modal>
    </div>
  )
}

export default DeveloperAccountPage
