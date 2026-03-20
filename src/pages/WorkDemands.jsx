import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDictItemsApi } from '../api/configDict'
import { getUsersApi } from '../api/users'
import { createWorkDemandApi, getWorkDemandsApi, updateWorkDemandApi } from '../api/work'
import { getCurrentUser, hasPermission } from '../utils/access'

const { Search } = Input
const { Text } = Typography

const STATUS_OPTIONS = [
  { label: '待开始', value: 'TODO' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
  { label: '已取消', value: 'CANCELLED' },
]

const PRIORITY_OPTIONS = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
]

function getStatusTagColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'CANCELLED') return 'default'
  return 'warning'
}

function getPriorityColor(priority) {
  if (priority === 'P0') return 'red'
  if (priority === 'P1') return 'orange'
  if (priority === 'P2') return 'blue'
  return 'default'
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function WorkDemands() {
  const canView = hasPermission('demand.view')
  const canManage = hasPermission('demand.manage')
  const currentUser = getCurrentUser()

  const [form] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDemand, setEditingDemand] = useState(null)

  const [demands, setDemands] = useState([])
  const [users, setUsers] = useState([])
  const [businessGroups, setBusinessGroups] = useState([])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [businessGroupFilter, setBusinessGroupFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('all')

  const ownerOptions = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (!map.has(user.id)) {
        map.set(user.id, {
          value: user.id,
          label: `${user.username} (${user.id})`,
        })
      }
    })

    if (currentUser?.id && !map.has(currentUser.id)) {
      map.set(currentUser.id, {
        value: currentUser.id,
        label: `${currentUser.username || '当前用户'} (${currentUser.id})`,
      })
    }

    return Array.from(map.values())
  }, [users, currentUser])

  const businessGroupOptions = useMemo(
    () =>
      businessGroups.map((item) => ({
        value: item.item_code,
        label: item.item_name || item.item_code,
      })),
    [businessGroups],
  )

  const loadUsers = useCallback(async () => {
    if (!canManage) return

    try {
      const result = await getUsersApi({ page: 1, pageSize: 200 })
      if (result?.success) {
        setUsers(result.data?.list || [])
      }
    } catch {
      // fallback to current user only
    }
  }, [canManage])

  const loadBusinessGroups = useCallback(async () => {
    try {
      const result = await getDictItemsApi('business_group', { enabledOnly: true })
      if (result?.success) {
        setBusinessGroups(result.data || [])
      }
    } catch {
      setBusinessGroups([])
    }
  }, [])

  const loadDemands = useCallback(async () => {
    if (!canView) return

    setLoading(true)
    try {
      const params = {
        page,
        pageSize,
      }

      if (keyword.trim()) params.keyword = keyword.trim()
      if (statusFilter) params.status = statusFilter
      if (priorityFilter) params.priority = priorityFilter
      if (businessGroupFilter) params.business_group_code = businessGroupFilter
      if (scopeFilter === 'mine') params.mine = true

      const result = await getWorkDemandsApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取需求列表失败')
        return
      }

      setDemands(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取需求列表失败')
    } finally {
      setLoading(false)
    }
  }, [canView, page, pageSize, keyword, statusFilter, priorityFilter, businessGroupFilter, scopeFilter])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    loadBusinessGroups()
  }, [loadBusinessGroups])

  useEffect(() => {
    loadDemands()
  }, [loadDemands])

  const openCreateModal = () => {
    setEditingDemand(null)
    setModalOpen(true)
    form.resetFields()
    form.setFieldsValue({
      owner_user_id: currentUser?.id || undefined,
      business_group_code: undefined,
      status: 'TODO',
      priority: 'P2',
    })
  }

  const openEditModal = (record) => {
    setEditingDemand(record)
    setModalOpen(true)
    form.resetFields()
    form.setFieldsValue({
      id: record.id,
      name: record.name,
      owner_user_id: record.owner_user_id,
      business_group_code: record.business_group_code || undefined,
      status: record.status,
      priority: record.priority,
      owner_estimate_hours: record.owner_estimate_hours,
      description: record.description || '',
    })
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingDemand(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        id: values.id || undefined,
        name: values.name,
        owner_user_id: values.owner_user_id,
        business_group_code: values.business_group_code ?? null,
        status: values.status,
        priority: values.priority,
        owner_estimate_hours: values.owner_estimate_hours,
        description: values.description || '',
      }

      const result = editingDemand
        ? await updateWorkDemandApi(editingDemand.id, payload)
        : await createWorkDemandApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingDemand ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingDemand ? '需求更新成功' : '需求创建成功')
      closeModal()
      loadDemands()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const demandColumns = [
    {
      title: '需求ID',
      dataIndex: 'id',
      key: 'id',
      width: 110,
      render: (value) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '需求名称',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      ellipsis: true,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '业务组',
      dataIndex: 'business_group_name',
      key: 'business_group_name',
      width: 150,
      render: (_, record) => record.business_group_name || record.business_group_code || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={getStatusTagColor(value)}>{value}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (value) => <Tag color={getPriorityColor(value)}>{value}</Tag>,
    },
    {
      title: 'Owner预估(h)',
      dataIndex: 'owner_estimate_hours',
      key: 'owner_estimate_hours',
      width: 140,
      render: (value) => (value === null || value === undefined ? '-' : toNumber(value, 0).toFixed(1)),
    },
    {
      title: '累计实际(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '最新剩余(h)',
      dataIndex: 'latest_remaining_hours',
      key: 'latest_remaining_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '偏差(h)',
      dataIndex: 'deviation_hours',
      key: 'deviation_hours',
      width: 110,
      render: (value) => {
        if (value === null || value === undefined) return '-'
        const num = toNumber(value, 0)
        const color = num > 0 ? '#d4380d' : num < 0 ? '#389e0d' : '#595959'
        return <span style={{ color }}>{num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1)}</span>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) =>
        canManage ? (
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
        ) : (
          '-'
        ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadDemands} loading={loading}>
              刷新
            </Button>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                新建需求
              </Button>
            ) : null}
          </Space>
        }
      >
        <Space wrap>
          <Search
            allowClear
            placeholder="搜索需求ID或名称"
            enterButton={<SearchOutlined />}
            onSearch={(value) => {
              setKeyword(value)
              setPage(1)
            }}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="状态"
            options={STATUS_OPTIONS}
            value={statusFilter || undefined}
            onChange={(value) => {
              setStatusFilter(value || '')
              setPage(1)
            }}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="优先级"
            options={PRIORITY_OPTIONS}
            value={priorityFilter || undefined}
            onChange={(value) => {
              setPriorityFilter(value || '')
              setPage(1)
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 180 }}
            placeholder="业务组"
            options={businessGroupOptions}
            value={businessGroupFilter || undefined}
            onChange={(value) => {
              setBusinessGroupFilter(value || '')
              setPage(1)
            }}
          />
          <Select
            style={{ width: 140 }}
            value={scopeFilter}
            options={[
              { label: '全部需求', value: 'all' },
              { label: '我负责/参与', value: 'mine' },
            ]}
            onChange={(value) => {
              setScopeFilter(value)
              setPage(1)
            }}
          />
        </Space>
      </Card>

      <Card variant="borderless">
        <Table
          rowKey="id"
          loading={loading}
          columns={demandColumns}
          dataSource={demands}
          scroll={{ x: 1740 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
          }}
          onChange={(pagination) => {
            setPage(pagination.current || 1)
            setPageSize(pagination.pageSize || 10)
          }}
        />
      </Card>

      <Modal
        title={editingDemand ? '编辑需求' : '新建需求'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        forceRender
      >
        <Form form={form} layout="vertical">
          {!editingDemand ? (
            <Form.Item
              label="需求ID（可选）"
              name="id"
              tooltip="不填则由系统自动生成，如 REQ001"
              rules={[
                {
                  pattern: /^$|^REQ\d{3,}$/,
                  message: '格式示例：REQ001',
                },
              ]}
            >
              <Input placeholder="例如：REQ001（可选）" maxLength={20} />
            </Form.Item>
          ) : null}

          <Form.Item label="需求名称" name="name" rules={[{ required: true, message: '请输入需求名称' }]}>
            <Input maxLength={200} placeholder="请输入需求名称" />
          </Form.Item>

          <Form.Item
            label="负责人"
            name="owner_user_id"
            rules={[{ required: true, message: '请选择负责人' }]}
          >
            <Select showSearch optionFilterProp="label" options={ownerOptions} placeholder="请选择负责人" />
          </Form.Item>

          <Form.Item label="业务组" name="business_group_code">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={businessGroupOptions}
              placeholder="请选择业务组（可选）"
            />
          </Form.Item>

          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请选择优先级' }]}>
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>

          <Form.Item label="Owner预估(h)" name="owner_estimate_hours">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} placeholder="可选" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} maxLength={2000} placeholder="补充需求背景、目标和注意事项" />
          </Form.Item>
        </Form>
      </Modal>

      {!canManage ? (
        <div style={{ marginTop: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UnorderedListOutlined />
          <span>当前账号为只读权限，如需创建/编辑需求，请分配 `demand.manage` 权限。</span>
        </div>
      ) : null}
    </div>
  )
}

export default WorkDemands
