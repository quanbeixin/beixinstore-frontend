import {
  EditOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SaveOutlined,
  UnorderedListOutlined,
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
  createWorkLogApi,
  getDemandPhasesApi,
  getMyWorkbenchApi,
  getWorkDemandsApi,
  getWorkItemTypesApi,
  getWorkLogsApi,
  updateWorkLogApi,
} from '../api/work'
import { hasPermission } from '../utils/access'

const { Text } = Typography
const ITEM_STATUS_OPTIONS = [
  { label: '待开始', value: 'TODO' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
]

function getTodayDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatDateOnly(value) {
  if (!value) return '-'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (text.includes('T')) return text.split('T')[0]
  return text.slice(0, 10)
}

function toDateInputValue(value) {
  const date = formatDateOnly(value)
  return date === '-' ? undefined : date
}

function getItemStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  return 'default'
}

function getItemStatusLabel(status) {
  const matched = ITEM_STATUS_OPTIONS.find((item) => item.value === status)
  return matched?.label || status || '进行中'
}

function isOverdueDate(value) {
  const date = formatDateOnly(value)
  if (!date || date === '-') return false
  return date < getTodayDateString()
}

function WorkLogs() {
  const canCreate = hasPermission('worklog.create')
  const canView = hasPermission('worklog.view.self')
  const canUpdate = hasPermission('worklog.update.self')

  const [form] = Form.useForm()
  const [actualForm] = Form.useForm()

  const [itemTypes, setItemTypes] = useState([])
  const [demands, setDemands] = useState([])
  const [demandPhases, setDemandPhases] = useState([])
  const [logs, setLogs] = useState([])
  const [workbench, setWorkbench] = useState({
    today: {
      log_count_today: 0,
      personal_estimate_hours_today: 0,
      actual_hours_today: 0,
      remaining_hours_today: 0,
    },
    active_items: [],
    recent_logs: [],
  })

  const [loadingBase, setLoadingBase] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [loadingPhases, setLoadingPhases] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actualSubmitting, setActualSubmitting] = useState(false)
  const [statusSubmittingId, setStatusSubmittingId] = useState(null)
  const [actualModalOpen, setActualModalOpen] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [activeItemKeyword, setActiveItemKeyword] = useState('')
  const [activeItemStatusFilter, setActiveItemStatusFilter] = useState('ALL')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const selectedTypeId = Form.useWatch('item_type_id', form)
  const selectedDemandId = Form.useWatch('demand_id', form)

  const selectedItemType = useMemo(
    () => itemTypes.find((item) => Number(item.id) === Number(selectedTypeId)) || null,
    [itemTypes, selectedTypeId],
  )

  const itemTypeOptions = useMemo(
    () =>
      itemTypes.map((item) => ({
        value: item.id,
        label: `${item.name}${Number(item.require_demand) === 1 ? '（需关联需求）' : ''}`,
      })),
    [itemTypes],
  )

  const demandOptions = useMemo(
    () =>
      demands.map((item) => ({
        value: item.id,
        label: `${item.id} - ${item.name}`,
      })),
    [demands],
  )

  const phaseOptions = useMemo(
    () =>
      demandPhases.map((item) => ({
        value: item.phase_key,
        label: `${item.phase_name} (${item.phase_key})`,
      })),
    [demandPhases],
  )

  const activeItems = useMemo(() => {
    const rows = Array.isArray(workbench?.active_items) ? workbench.active_items : []
    return rows.filter((item) => (item?.log_status || 'IN_PROGRESS') !== 'DONE')
  }, [workbench])

  const activeItemSummary = useMemo(() => {
    return activeItems.reduce(
      (acc, item) => {
        const status = item?.log_status || 'IN_PROGRESS'
        if (status === 'TODO') acc.todo += 1
        if (status === 'IN_PROGRESS') acc.inProgress += 1
        if (isOverdueDate(item?.expected_completion_date)) acc.overdue += 1
        if (!item?.expected_completion_date) acc.noDeadline += 1
        return acc
      },
      { todo: 0, inProgress: 0, overdue: 0, noDeadline: 0 },
    )
  }, [activeItems])

  const filteredActiveItems = useMemo(() => {
    const keyword = activeItemKeyword.trim().toLowerCase()
    const statusFilter = activeItemStatusFilter

    const list = activeItems
      .filter((item) => {
        if (statusFilter !== 'ALL' && (item?.log_status || 'IN_PROGRESS') !== statusFilter) return false
        if (!keyword) return true
        const text = `${item?.item_type_name || ''} ${item?.demand_id || ''} ${item?.phase_name || ''} ${
          item?.description || ''
        } ${item?.expected_completion_date || ''}`.toLowerCase()
        return text.includes(keyword)
      })
      .sort((a, b) => {
        const aDate = formatDateOnly(a?.expected_completion_date)
        const bDate = formatDateOnly(b?.expected_completion_date)
        const aHasDate = aDate && aDate !== '-'
        const bHasDate = bDate && bDate !== '-'
        if (aHasDate && bHasDate) {
          if (aDate !== bDate) return aDate.localeCompare(bDate)
        } else if (aHasDate && !bHasDate) {
          return -1
        } else if (!aHasDate && bHasDate) {
          return 1
        }
        return Number(b?.id || 0) - Number(a?.id || 0)
      })

    return list
  }, [activeItems, activeItemKeyword, activeItemStatusFilter])

  const loadBase = useCallback(async () => {
    setLoadingBase(true)
    try {
      const [typeResult, demandResult, benchResult] = await Promise.all([
        getWorkItemTypesApi({ enabled_only: 1 }),
        getWorkDemandsApi({ page: 1, pageSize: 1000 }),
        getMyWorkbenchApi(),
      ])

      if (!typeResult?.success) {
        message.error(typeResult?.message || '获取事项类型失败')
        return
      }

      if (!demandResult?.success) {
        message.error(demandResult?.message || '获取需求列表失败')
        return
      }

      if (!benchResult?.success) {
        message.error(benchResult?.message || '获取工作台数据失败')
        return
      }

      setItemTypes(typeResult.data || [])
      setDemands(demandResult.data?.list || [])
      setWorkbench(benchResult.data || {})
    } catch (error) {
      message.error(error?.message || '加载基础数据失败')
    } finally {
      setLoadingBase(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    if (!canView) return

    setLoadingLogs(true)
    try {
      const result = await getWorkLogsApi({
        page,
        pageSize,
      })
      if (!result?.success) {
        message.error(result?.message || '获取工作记录失败')
        return
      }

      setLogs(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取工作记录失败')
    } finally {
      setLoadingLogs(false)
    }
  }, [canView, page, pageSize])

  const loadDemandPhases = useCallback(
    async (demandId) => {
      if (!demandId) {
        setDemandPhases([])
        form.setFieldValue('phase_key', undefined)
        return
      }

      setLoadingPhases(true)
      try {
        const result = await getDemandPhasesApi(demandId)
        if (!result?.success) {
          message.error(result?.message || '获取需求阶段失败')
          setDemandPhases([])
          return
        }

        const rows = result.data || []
        setDemandPhases(rows)

        const currentPhase = form.getFieldValue('phase_key')
        const exists = rows.some((item) => item.phase_key === currentPhase)
        if (!exists) {
          form.setFieldValue('phase_key', rows[0]?.phase_key)
        }
      } catch (error) {
        message.error(error?.message || '获取需求阶段失败')
        setDemandPhases([])
      } finally {
        setLoadingPhases(false)
      }
    },
    [form],
  )

  useEffect(() => {
    form.setFieldsValue({
      log_date: getTodayDateString(),
      personal_estimate_hours: 1,
    })
    loadBase()
  }, [form, loadBase])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (!selectedDemandId) {
      setDemandPhases([])
      form.setFieldValue('phase_key', undefined)
      return
    }
    loadDemandPhases(selectedDemandId)
  }, [selectedDemandId, loadDemandPhases, form])

  const handleRefresh = async () => {
    await Promise.all([loadBase(), loadLogs()])
    if (selectedDemandId) {
      await loadDemandPhases(selectedDemandId)
    }
  }

  const handleCreateLog = async (values) => {
    if (!canCreate) return

    const requireDemand = Number(selectedItemType?.require_demand) === 1
    if (requireDemand && !values.demand_id) {
      message.warning('当前事项类型必须关联需求')
      return
    }

    if (values.demand_id && !values.phase_key) {
      message.warning('关联需求时必须选择阶段')
      return
    }

    try {
      setSubmitting(true)
      const result = await createWorkLogApi({
        log_date: values.log_date,
        item_type_id: values.item_type_id,
        demand_id: values.demand_id || null,
        phase_key: values.demand_id ? values.phase_key : null,
        expected_completion_date: values.expected_completion_date || null,
        description: values.description,
        personal_estimate_hours: values.personal_estimate_hours,
      })

      if (!result?.success) {
        message.error(result?.message || '提交失败')
        return
      }

      message.success('工作记录已提交')
      form.setFieldsValue({
        description: '',
        personal_estimate_hours: 1,
      })
      await Promise.all([loadBase(), loadLogs()])
    } catch (error) {
      message.error(error?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }
  const openActualModal = (record) => {
    setEditingLog(record)
    actualForm.setFieldsValue({
      personal_estimate_hours: toNumber(record.personal_estimate_hours, 0),
      actual_hours: toNumber(record.actual_hours, 0),
      expected_completion_date: toDateInputValue(record.expected_completion_date),
      log_completed_at: toDateInputValue(record.log_completed_at),
    })
    setActualModalOpen(true)
  }

  const closeActualModal = () => {
    setActualModalOpen(false)
    setEditingLog(null)
    actualForm.resetFields()
  }

  const handleUpdateActual = async () => {
    if (!editingLog?.id) return

    try {
      setActualSubmitting(true)
      const values = await actualForm.validateFields()
      const nextCompletedAt = values.log_completed_at || null
      const currentStatus = String(editingLog.log_status || 'IN_PROGRESS').toUpperCase()
      const payload = {
        personal_estimate_hours: values.personal_estimate_hours,
        actual_hours: values.actual_hours,
        expected_completion_date: values.expected_completion_date || null,
        log_completed_at: nextCompletedAt,
      }

      if (nextCompletedAt) {
        payload.log_status = 'DONE'
      } else if (currentStatus === 'DONE') {
        payload.log_status = 'IN_PROGRESS'
      }

      const result = await updateWorkLogApi(editingLog.id, {
        ...payload,
      })

      if (!result?.success) {
        message.error(result?.message || '实际工时登记失败')
        return
      }

      message.success('事项进展已更新')
      closeActualModal()
      await Promise.all([loadBase(), loadLogs()])
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查实际工时表单输入')
      } else {
        message.error(error?.message || '实际工时登记失败')
      }
    } finally {
      setActualSubmitting(false)
    }
  }

  const handleUpdateItemStatus = async (record, nextStatus) => {
    if (!record?.id || !nextStatus) return
    if (!canUpdate) return

    try {
      setStatusSubmittingId(record.id)
      const result = await updateWorkLogApi(record.id, {
        log_status: nextStatus,
      })

      if (!result?.success) {
        message.error(result?.message || '更新事项状态失败')
        return
      }

      message.success('事项状态已更新')
      await Promise.all([loadBase(), loadLogs()])
    } catch (error) {
      message.error(error?.message || '更新事项状态失败')
    } finally {
      setStatusSubmittingId(null)
    }
  }
  const logColumns = [
    {
      title: '日期',
      dataIndex: 'log_date',
      key: 'log_date',
      width: 120,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '关联需求',
      dataIndex: 'demand_id',
      key: 'demand_id',
      width: 220,
      render: (_, record) => (record.demand_id ? `${record.demand_id} - ${record.demand_name || '-'}` : '-'),
    },
    {
      title: '阶段',
      dataIndex: 'phase_name',
      key: 'phase_name',
      width: 150,
      render: (_, record) => (record.phase_name || record.phase_key || '-'),
    },
    {
      title: '预计完成日期',
      dataIndex: 'expected_completion_date',
      key: 'expected_completion_date',
      width: 140,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '完成日期',
      dataIndex: 'log_completed_at',
      key: 'log_completed_at',
      width: 130,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '预计用时(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 140,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 140,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_, record) =>
        canUpdate ? (
          <Button type='link' icon={<EditOutlined />} onClick={() => openActualModal(record)}>
            编辑进展
          </Button>
        ) : null,
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>个人工作台</h1>
        <p style={{ margin: '8px 0 0', color: '#667085' }}>
          每日填报工作记录，关联需求和阶段并沉淀数据，供个人和管理者查看进展。
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card variant="borderless">
            <Space>
              <UnorderedListOutlined />
              <Text type="secondary">今日填报条数</Text>
            </Space>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
              {toNumber(workbench?.today?.log_count_today, 0)}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless">
            <Space>
              <ClockCircleOutlined />
              <Text type="secondary">今日个人预估(h)</Text>
            </Space>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
              {toNumber(workbench?.today?.personal_estimate_hours_today, 0).toFixed(1)}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card variant="borderless">
            <Space>
              <FileTextOutlined />
              <Text type="secondary">今日实际工时(h)</Text>
            </Space>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
              {toNumber(workbench?.today?.actual_hours_today, 0).toFixed(1)}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title="快速填报"
            variant="borderless"
            extra={
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loadingBase || loadingLogs}>
                刷新
              </Button>
            }
          >
            <Form form={form} layout="vertical" onFinish={handleCreateLog} disabled={!canCreate || loadingBase}>
              <Form.Item label="填报日期" name="log_date" rules={[{ required: true, message: '请选择日期' }]}>
                <Input type="date" />
              </Form.Item>

              <Form.Item
                label="事项类型"
                name="item_type_id"
                rules={[{ required: true, message: '请选择事项类型' }]}
              >
                <Select options={itemTypeOptions} placeholder="请选择事项类型" />
              </Form.Item>

              <Form.Item
                label="关联需求"
                name="demand_id"
                rules={
                  Number(selectedItemType?.require_demand) === 1
                    ? [{ required: true, message: '当前事项类型需关联需求' }]
                    : []
                }
              >
                <Select
                  allowClear
                  showSearch
                  options={demandOptions}
                  placeholder="请选择需求池中的需求（可选）"
                  optionFilterProp="label"
                  onChange={(next) => {
                    if (!next) {
                      form.setFieldValue('phase_key', undefined)
                      setDemandPhases([])
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                label="需求阶段"
                name="phase_key"
                rules={selectedDemandId ? [{ required: true, message: '请选择需求阶段' }] : []}
              >
                <Select
                  allowClear
                  showSearch
                  loading={loadingPhases}
                  options={phaseOptions}
                  placeholder={selectedDemandId ? '请选择需求阶段' : '请先选择关联需求'}
                  optionFilterProp="label"
                  disabled={!selectedDemandId}
                />
              </Form.Item>

              <Form.Item label="预计完成日期" name="expected_completion_date">
                <Input type="date" />
              </Form.Item>

              {selectedDemandId && demandPhases.length === 0 ? (
                <div style={{ marginBottom: 12, color: '#d4380d' }}>
                  该需求尚未配置阶段预算，请先到需求池的“阶段预算”中维护。
                </div>
              ) : null}

              <Form.Item
                label="预计用时(h)"
                name="personal_estimate_hours"
                rules={[{ required: true, message: '请输入预计用时' }]}
              >
                <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="工作描述"
                name="description"
                rules={[{ required: true, message: '请填写工作描述' }]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={2000}
                  placeholder="建议写清楚：做了什么、产出了什么、是否有风险"
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={submitting}
                disabled={!canCreate}
              >
                提交记录
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="我的进行中事项" variant="borderless" style={{ marginBottom: 16 }}>
            {activeItems.length === 0 ? (
              <Empty description="暂无未完成事项" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                  }}
                >
                  <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, color: '#667085' }}>待开始</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{activeItemSummary.todo}</div>
                  </div>
                  <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, color: '#667085' }}>进行中</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{activeItemSummary.inProgress}</div>
                  </div>
                  <div style={{ border: '1px solid #ffe7ba', borderRadius: 8, padding: 8, background: '#fff7e6' }}>
                    <div style={{ fontSize: 12, color: '#d46b08' }}>已超期</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#d46b08' }}>{activeItemSummary.overdue}</div>
                  </div>
                  <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, color: '#667085' }}>未设截止日</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{activeItemSummary.noDeadline}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
                  <Input
                    allowClear
                    placeholder="搜索事项类型 / 需求ID / 阶段 / 描述"
                    value={activeItemKeyword}
                    onChange={(e) => setActiveItemKeyword(e.target.value)}
                  />
                  <Select
                    value={activeItemStatusFilter}
                    options={[
                      { label: '全部状态', value: 'ALL' },
                      ...ITEM_STATUS_OPTIONS,
                    ]}
                    onChange={(next) => setActiveItemStatusFilter(next)}
                  />
                </div>

                {filteredActiveItems.length === 0 ? (
                  <Empty description="没有匹配的进行中事项" />
                ) : null}

                {filteredActiveItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: isOverdueDate(item.expected_completion_date)
                        ? '1px solid #ffd591'
                        : '1px solid #e4e7ec',
                      borderLeft: `4px solid ${
                        item.log_status === 'TODO' ? '#8c8c8c' : item.log_status === 'IN_PROGRESS' ? '#1677ff' : '#52c41a'
                      }`,
                      borderRadius: 10,
                      padding: 12,
                      background: isOverdueDate(item.expected_completion_date) ? '#fffaf0' : '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 8,
                      }}
                    >
                      <Space wrap>
                        <Tag color="blue">#{item.id}</Tag>
                        <Tag color={getItemStatusColor(item.log_status)}>
                          {getItemStatusLabel(item.log_status || 'IN_PROGRESS')}
                        </Tag>
                        <Text strong style={{ wordBreak: 'break-all' }}>
                          {item.item_type_name || '事项'}
                        </Text>
                      </Space>
                      <Space wrap>
                        {item.demand_id ? <Tag>{item.demand_id}</Tag> : <Tag>无需求</Tag>}
                        {item.phase_name ? <Tag color="geekblue">{item.phase_name}</Tag> : null}
                      </Space>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 8,
                        marginBottom: 8,
                        fontSize: 13,
                        color: '#667085',
                      }}
                    >
                      <div>填报日期: {formatDateOnly(item.log_date)}</div>
                      <div style={{ color: isOverdueDate(item.expected_completion_date) ? '#d46b08' : '#667085' }}>
                        预计完成: {formatDateOnly(item.expected_completion_date)}
                      </div>
                    </div>

                    <div
                      style={{
                        color: '#475467',
                        fontSize: 13,
                        marginBottom: 10,
                        background: '#f8fafc',
                        border: '1px solid #eef2f6',
                        borderRadius: 8,
                        padding: '8px 10px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {item.description || '-'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Select
                        style={{ width: 140 }}
                        options={ITEM_STATUS_OPTIONS}
                        value={item.log_status || 'IN_PROGRESS'}
                        disabled={!canUpdate}
                        loading={statusSubmittingId === item.id}
                        onChange={(next) => handleUpdateItemStatus(item, next)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="我的工作记录" variant="borderless">
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <Table
                rowKey="id"
                loading={loadingLogs}
                columns={logColumns}
                dataSource={logs}
                size="middle"
                scroll={{ x: 1280 }}
                pagination={{
                  current: page,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  showTotal: (t) => `共 ${t} 条`,
                }}
                onChange={(pagination) => {
                  setPage(pagination.current || 1)
                  setPageSize(pagination.pageSize || 10)
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingLog ? `编辑事项进展：#${editingLog.id}` : '编辑事项进展'}
        open={actualModalOpen}
        onCancel={closeActualModal}
        onOk={handleUpdateActual}
        confirmLoading={actualSubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={actualForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="预计用时(h)"
            name="personal_estimate_hours"
            rules={[{ required: true, message: '请输入预计用时' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="实际工时(h)"
            name="actual_hours"
            rules={[{ required: true, message: '请输入实际工时' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="预计完成日期" name="expected_completion_date">
            <Input type="date" />
          </Form.Item>
          <Form.Item label="完成日期" name="log_completed_at">
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default WorkLogs






