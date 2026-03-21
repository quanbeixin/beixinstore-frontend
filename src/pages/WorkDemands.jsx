import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDictItemsApi } from '../api/configDict'
import { getUsersApi } from '../api/users'
import {
  createWorkDemandApi,
  deleteWorkDemandApi,
  getWorkDemandsApi,
  getWorkLogsApi,
  updateWorkDemandApi,
} from '../api/work'
import { getCurrentUser, getUserPreferences, hasPermission, hasRole } from '../utils/access'
import { formatBeijingDate, formatBeijingDateTime, getBeijingTodayDateString } from '../utils/datetime'

const { Search } = Input
const { Text } = Typography
const { RangePicker } = DatePicker

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

const DETAIL_LOG_FILTER_OPTIONS = [
  { label: '全部', value: 'ALL' },
  { label: '未完成', value: 'PENDING' },
  { label: '已逾期', value: 'OVERDUE' },
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

function isOverdueLogItem(item) {
  if (!item) return false
  if (String(item.log_status || '').toUpperCase() === 'DONE') return false
  const expectedDate = formatBeijingDate(item.expected_completion_date, '')
  if (!expectedDate) return false
  return expectedDate < getBeijingTodayDateString()
}

function WorkDemands() {
  const canView = hasPermission('demand.view')
  const canCreate = hasPermission('demand.manage')
  const canTransferOwner = hasPermission('demand.transfer_owner') || hasRole('ADMIN')
  const canViewSelfLogs = hasPermission('worklog.view.self')
  const canViewTeamLogs = hasPermission('worklog.view.team')
  const currentUser = getCurrentUser()

  const [form] = Form.useForm()
  const [detailForm] = Form.useForm()

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
  const [keywordInput, setKeywordInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [prioritySortOrder, setPrioritySortOrder] = useState()
  const [businessGroupFilter, setBusinessGroupFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState()
  const [updatedRange, setUpdatedRange] = useState([])
  const [scopeFilter, setScopeFilter] = useState('all')
  const [compactView, setCompactView] = useState(() => {
    const preferences = getUserPreferences()
    return Number(preferences?.demand_list_compact_default || 0) === 1
  })

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDemand, setDetailDemand] = useState(null)
  const [detailLogs, setDetailLogs] = useState([])
  const [detailLogsLoading, setDetailLogsLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailLogFilter, setDetailLogFilter] = useState('ALL')

  const detailLogStats = useMemo(() => {
    const total = detailLogs.length
    const pending = detailLogs.filter((item) => String(item?.log_status || '').toUpperCase() !== 'DONE').length
    const overdue = detailLogs.filter((item) => isOverdueLogItem(item)).length
    return { total, pending, overdue }
  }, [detailLogs])

  const filteredDetailLogs = useMemo(() => {
    if (detailLogFilter === 'PENDING') {
      return detailLogs.filter((item) => String(item?.log_status || '').toUpperCase() !== 'DONE')
    }
    if (detailLogFilter === 'OVERDUE') {
      return detailLogs.filter((item) => isOverdueLogItem(item))
    }
    return detailLogs
  }, [detailLogs, detailLogFilter])

  const canEditDemandRecord = useCallback(
    (record) => {
      if (!record) return false
      if (canTransferOwner) return true
      return Number(record.owner_user_id) === Number(currentUser?.id)
    },
    [canTransferOwner, currentUser?.id],
  )

  const ownerOptions = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      const displayName = user.real_name || user.username
      if (!map.has(user.id)) {
        map.set(user.id, {
          value: user.id,
          label: displayName,
        })
      }
    })

    demands.forEach((item) => {
      const ownerId = Number(item.owner_user_id)
      if (!Number.isInteger(ownerId) || ownerId <= 0 || map.has(ownerId)) return
      map.set(ownerId, {
        value: ownerId,
        label: item.owner_name || `用户${ownerId}`,
      })
    })

    if (currentUser?.id && !map.has(currentUser.id)) {
      const displayName = currentUser.real_name || currentUser.username || '当前用户'
      map.set(currentUser.id, {
        value: currentUser.id,
        label: displayName,
      })
    }

    return Array.from(map.values()).sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-CN'))
  }, [users, demands, currentUser])

  const businessGroupOptions = useMemo(
    () =>
      businessGroups.map((item) => ({
        value: item.item_code,
        label: item.item_name || item.item_code,
      })),
    [businessGroups],
  )

  const loadUsers = useCallback(async () => {
    if (!canView) return

    try {
      const result = await getUsersApi({ page: 1, pageSize: 200 })
      if (result?.success) {
        setUsers(result.data?.list || [])
      }
    } catch {
      // fallback to current user only
    }
  }, [canView])

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
      if (prioritySortOrder === 'ascend') params.priority_order = 'asc'
      if (prioritySortOrder === 'descend') params.priority_order = 'desc'
      if (businessGroupFilter) params.business_group_code = businessGroupFilter
      if (ownerFilter) params.owner_user_id = ownerFilter
      if (Array.isArray(updatedRange) && updatedRange.length === 2 && updatedRange[0] && updatedRange[1]) {
        params.updated_start_date = updatedRange[0].format('YYYY-MM-DD')
        params.updated_end_date = updatedRange[1].format('YYYY-MM-DD')
      }
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
  }, [
    canView,
    page,
    pageSize,
    keyword,
    statusFilter,
    priorityFilter,
    prioritySortOrder,
    businessGroupFilter,
    ownerFilter,
    updatedRange,
    scopeFilter,
  ])

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
    if (!canCreate) return
    setEditingDemand(null)
    setModalOpen(true)
    form.resetFields()
    form.setFieldsValue({
      owner_user_id: currentUser?.id || undefined,
      business_group_code: undefined,
      expected_release_date: null,
      status: 'TODO',
      priority: 'P2',
    })
  }

  const openEditModal = (record) => {
    if (!canEditDemandRecord(record)) {
      message.warning('仅需求负责人或管理员可编辑该需求')
      return
    }
    setEditingDemand(record)
    setModalOpen(true)
    form.resetFields()
    form.setFieldsValue({
      name: record.name,
      owner_user_id: record.owner_user_id,
      business_group_code: record.business_group_code || undefined,
      expected_release_date: record.expected_release_date ? dayjs(record.expected_release_date) : null,
      status: record.status,
      priority: record.priority,
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
        name: values.name,
        business_group_code: values.business_group_code ?? null,
        expected_release_date: values.expected_release_date ? values.expected_release_date.format('YYYY-MM-DD') : null,
        status: values.status,
        priority: values.priority,
        description: values.description || '',
      }
      if (!editingDemand || canTransferOwner) {
        payload.owner_user_id = values.owner_user_id
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

  const fetchDemandRelatedLogs = useCallback(
    async (demandId) => {
      if (!demandId || !canViewSelfLogs) {
        setDetailLogs([])
        return
      }

      setDetailLogsLoading(true)
      try {
        const params = {
          page: 1,
          pageSize: 12,
          demand_id: demandId,
        }
        if (canViewTeamLogs) {
          params.scope = 'team'
        }

        const result = await getWorkLogsApi(params)
        if (result?.success) {
          setDetailLogs(result.data?.list || [])
        } else {
          setDetailLogs([])
        }
      } catch {
        setDetailLogs([])
      } finally {
        setDetailLogsLoading(false)
      }
    },
    [canViewSelfLogs, canViewTeamLogs],
  )

  const openDetailDrawer = useCallback(
    (record) => {
      setDetailDemand(record)
      setDetailOpen(true)
      setDetailLogFilter('ALL')
      detailForm.setFieldsValue({
        status: record.status,
      })
      fetchDemandRelatedLogs(record.id)
    },
    [detailForm, fetchDemandRelatedLogs],
  )

  const closeDetailDrawer = () => {
    setDetailOpen(false)
    setDetailDemand(null)
    setDetailLogs([])
    setDetailLogFilter('ALL')
    detailForm.resetFields()
  }

  const refreshListAndDetail = async (nextDetail) => {
    await loadDemands()
    if (!nextDetail && !detailDemand) return
    const mergedDetail = {
      ...(detailDemand || {}),
      ...(nextDetail || {}),
    }
    setDetailDemand(mergedDetail)
    detailForm.setFieldsValue({
      status: mergedDetail.status,
    })
    fetchDemandRelatedLogs(mergedDetail.id)
  }

  const handleQuickStatusUpdate = async (record, nextStatus) => {
    if (!record?.id || !canEditDemandRecord(record)) return
    try {
      const result = await updateWorkDemandApi(record.id, {
        status: nextStatus,
      })
      if (!result?.success) {
        message.error(result?.message || '状态更新失败')
        return
      }
      message.success(nextStatus === 'DONE' ? '需求已完成' : '需求已重开')
      await refreshListAndDetail(result?.data || null)
    } catch (error) {
      message.error(error?.message || '状态更新失败')
    }
  }

  const handleSaveDetail = async () => {
    if (!detailDemand?.id || !canEditDemandRecord(detailDemand)) return
    try {
      const values = await detailForm.validateFields()
      setDetailSaving(true)
      const result = await updateWorkDemandApi(detailDemand.id, {
        status: values.status,
      })
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      message.success('需求信息已更新')
      await refreshListAndDetail(result?.data || null)
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '保存失败')
      }
    } finally {
      setDetailSaving(false)
    }
  }

  const handleDeleteDemand = async (record) => {
    if (!record?.id || !canTransferOwner) return
    try {
      const result = await deleteWorkDemandApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除需求失败')
        return
      }
      message.success(result?.message || '需求已删除')
      if (detailDemand?.id === record.id) {
        closeDetailDrawer()
      }
      loadDemands()
    } catch (error) {
      message.error(error?.message || '删除需求失败')
    }
  }

  const handleResetFilters = () => {
    setKeyword('')
    setKeywordInput('')
    setStatusFilter('')
    setPriorityFilter('')
    setPrioritySortOrder(undefined)
    setBusinessGroupFilter('')
    setOwnerFilter(undefined)
    setUpdatedRange([])
    setScopeFilter('all')
    setPage(1)
  }

  const demandColumns = useMemo(() => {
    const columns = [
      {
        title: '需求ID',
        dataIndex: 'id',
        key: 'id',
        width: 110,
        fixed: 'left',
        render: (value) => <Tag color="blue">{value}</Tag>,
      },
      {
        title: '需求名称',
        dataIndex: 'name',
        key: 'name',
        width: 260,
        fixed: 'left',
        ellipsis: true,
        render: (value, record) => (
          <Button type="link" style={{ padding: 0 }} onClick={() => openDetailDrawer(record)}>
            <Text strong>{value}</Text>
          </Button>
        ),
      },
      {
        title: '需求负责人',
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
        sorter: true,
        sortOrder: prioritySortOrder,
        sortDirections: ['ascend', 'descend'],
        render: (value) => <Tag color={getPriorityColor(value)}>{value}</Tag>,
      },
    ]

    if (!compactView) {
      columns.push(
        {
          title: '累计实际(h)',
          dataIndex: 'total_actual_hours',
          key: 'total_actual_hours',
          width: 120,
          render: (value) => toNumber(value, 0).toFixed(1),
        },
        {
          title: '预期上线日期',
          dataIndex: 'expected_release_date',
          key: 'expected_release_date',
          width: 130,
          render: (value) => formatBeijingDate(value),
        },
        {
          title: '最近更新',
          dataIndex: 'updated_at',
          key: 'updated_at',
          width: 160,
          render: (value) => formatBeijingDateTime(value),
        },
        {
          title: '完成日期',
          dataIndex: 'completed_at',
          key: 'completed_at',
          width: 120,
          render: (value) => formatBeijingDate(value),
        },
      )
    }

    columns.push({
      title: '操作',
      key: 'action',
      width: canTransferOwner ? 280 : 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Button type="link" onClick={() => openDetailDrawer(record)}>
            详情
          </Button>
          {canEditDemandRecord(record) ? (
            <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              编辑
            </Button>
          ) : null}
          {canEditDemandRecord(record) ? (
            record.status === 'DONE' || record.status === 'CANCELLED' ? (
              <Popconfirm
                title="确认重开该需求？"
                okText="重开"
                cancelText="取消"
                onConfirm={() => handleQuickStatusUpdate(record, 'IN_PROGRESS')}
              >
                <Button type="link">重开</Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="确认标记为已完成？"
                okText="完成"
                cancelText="取消"
                onConfirm={() => handleQuickStatusUpdate(record, 'DONE')}
              >
                <Button type="link">完成</Button>
              </Popconfirm>
            )
          ) : null}
          {canTransferOwner ? (
            <Popconfirm
              title="确认删除该需求？"
              description="若已有关联事项，将自动归档而不是物理删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDeleteDemand(record)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    })

    return columns
  }, [
    canTransferOwner,
    compactView,
    openDetailDrawer,
    openEditModal,
    canEditDemandRecord,
    handleQuickStatusUpdate,
    handleDeleteDemand,
  ])

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadDemands} loading={loading}>
              刷新
            </Button>
            {canCreate ? (
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
            value={keywordInput}
            onChange={(e) => {
              const nextValue = e.target.value
              setKeywordInput(nextValue)
              if (!nextValue) {
                setKeyword('')
                setPage(1)
              }
            }}
            onSearch={(value) => {
              setKeyword(value)
              setKeywordInput(value)
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
            placeholder="需求负责人"
            options={ownerOptions}
            value={ownerFilter}
            onChange={(value) => {
              setOwnerFilter(value)
              setPage(1)
            }}
          />
          <RangePicker
            style={{ width: 250 }}
            value={updatedRange?.length ? updatedRange : null}
            onChange={(values) => {
              setUpdatedRange(values || [])
              setPage(1)
            }}
            placeholder={['更新开始', '更新结束']}
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
          <Button onClick={handleResetFilters}>重置筛选</Button>
          <Space size={6}>
            <Text type="secondary">精简视图</Text>
            <Switch checked={compactView} onChange={setCompactView} />
          </Space>
        </Space>
      </Card>

      <Card variant="borderless">
        <Table
          rowKey="id"
          loading={loading}
          columns={demandColumns}
          dataSource={demands}
          scroll={{ x: compactView ? 1320 : 1860 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
          }}
          onChange={(pagination, _filters, sorter) => {
            setPage(pagination.current || 1)
            setPageSize(pagination.pageSize || 10)
            const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter
            if (nextSorter?.columnKey === 'priority') {
              setPrioritySortOrder(nextSorter.order || undefined)
            }
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
          <Form.Item label="需求名称" name="name" rules={[{ required: true, message: '请输入需求名称' }]}>
            <Input maxLength={200} placeholder="请输入需求名称" />
          </Form.Item>

          <Form.Item
            label="需求负责人"
            name="owner_user_id"
            rules={[{ required: true, message: '请选择需求负责人' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="请选择需求负责人"
              disabled={Boolean(editingDemand) && !canTransferOwner}
            />
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

          <Form.Item label="预期上线日期" name="expected_release_date">
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              placeholder="请选择预期上线日期（可选）"
            />
          </Form.Item>

          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请选择优先级' }]}>
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} maxLength={2000} placeholder="补充需求背景、目标和注意事项" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detailDemand ? `需求详情 · ${detailDemand.id}` : '需求详情'}
        open={detailOpen}
        onClose={closeDetailDrawer}
        width={920}
        extra={
          detailDemand && canEditDemandRecord(detailDemand) ? (
            <Space>
              {detailDemand.status === 'DONE' || detailDemand.status === 'CANCELLED' ? (
                <Button onClick={() => handleQuickStatusUpdate(detailDemand, 'IN_PROGRESS')}>重开需求</Button>
              ) : (
                <Button onClick={() => handleQuickStatusUpdate(detailDemand, 'DONE')}>标记完成</Button>
              )}
              <Button type="primary" onClick={handleSaveDetail} loading={detailSaving}>
                保存变更
              </Button>
            </Space>
          ) : null
        }
      >
        {detailDemand ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="需求ID">{detailDemand.id}</Descriptions.Item>
              <Descriptions.Item label="需求名称">{detailDemand.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="需求负责人">{detailDemand.owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="业务组">
                {detailDemand.business_group_name || detailDemand.business_group_code || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={getStatusTagColor(detailDemand.status)}>{detailDemand.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                <Tag color={getPriorityColor(detailDemand.priority)}>{detailDemand.priority}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预期上线日期">
                {formatBeijingDate(detailDemand.expected_release_date)}
              </Descriptions.Item>
              <Descriptions.Item label="累计实际(h)">
                {toNumber(detailDemand.total_actual_hours, 0).toFixed(1)}
              </Descriptions.Item>
              <Descriptions.Item label="最近更新">{formatBeijingDateTime(detailDemand.updated_at)}</Descriptions.Item>
              <Descriptions.Item label="完成日期">{formatBeijingDate(detailDemand.completed_at)}</Descriptions.Item>
            </Descriptions>

            {canEditDemandRecord(detailDemand) ? (
              <>
                <Divider orientation="left">快速维护</Divider>
                <Form form={detailForm} layout="vertical">
                  <Space wrap style={{ width: '100%' }}>
                    <Form.Item
                      label="状态"
                      name="status"
                      rules={[{ required: true, message: '请选择状态' }]}
                      style={{ minWidth: 220, marginBottom: 0 }}
                    >
                      <Select options={STATUS_OPTIONS} />
                    </Form.Item>
                  </Space>
                </Form>
              </>
            ) : null}

            <Divider orientation="left">最近关联事项</Divider>
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Space size={8}>
                <Text type="secondary">筛选</Text>
                <Select
                  size="small"
                  style={{ width: 140 }}
                  value={detailLogFilter}
                  options={DETAIL_LOG_FILTER_OPTIONS}
                  onChange={(value) => setDetailLogFilter(value || 'ALL')}
                />
              </Space>
              <Text type="secondary">
                全部 {detailLogStats.total} · 未完成 {detailLogStats.pending} · 逾期 {detailLogStats.overdue}
              </Text>
            </div>
            <Table
              rowKey="id"
              size="small"
              loading={detailLogsLoading}
              dataSource={filteredDetailLogs}
              pagination={false}
              locale={{
                emptyText: canViewSelfLogs ? '当前筛选下暂无关联事项' : '当前账号无工作记录查看权限',
              }}
              scroll={{ x: 980 }}
              columns={[
                {
                  title: '日期',
                  dataIndex: 'log_date',
                  key: 'log_date',
                  width: 110,
                  render: (value) => formatBeijingDate(value),
                },
                {
                  title: '执行人',
                  dataIndex: 'username',
                  key: 'username',
                  width: 120,
                  render: (value) => value || '-',
                },
                {
                  title: '阶段',
                  dataIndex: 'phase_name',
                  key: 'phase_name',
                  width: 140,
                  render: (_, row) => row.phase_name || row.phase_key || '-',
                },
                {
                  title: '预计完成',
                  dataIndex: 'expected_completion_date',
                  key: 'expected_completion_date',
                  width: 120,
                  render: (value, row) => (
                    <Space size={4}>
                      <span>{formatBeijingDate(value)}</span>
                      {isOverdueLogItem(row) ? <Tag color="error">逾期</Tag> : null}
                    </Space>
                  ),
                },
                {
                  title: '个人预估(h)',
                  dataIndex: 'personal_estimate_hours',
                  key: 'personal_estimate_hours',
                  width: 120,
                  render: (value) => toNumber(value, 0).toFixed(1),
                },
                {
                  title: '实际用时(h)',
                  dataIndex: 'actual_hours',
                  key: 'actual_hours',
                  width: 120,
                  render: (value) => toNumber(value, 0).toFixed(1),
                },
                {
                  title: '描述',
                  dataIndex: 'description',
                  key: 'description',
                  ellipsis: true,
                  render: (value) => value || '-',
                },
              ]}
            />
          </>
        ) : null}
      </Drawer>

      {!canCreate ? (
        <div style={{ marginTop: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UnorderedListOutlined />
          <span>当前账号无创建权限，如需新建需求，请分配 `demand.manage` 权限。</span>
        </div>
      ) : null}
    </div>
  )
}

export default WorkDemands
