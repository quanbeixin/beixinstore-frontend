import {
  AlertOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
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
  Result,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createOwnerAssignedLogApi,
  getOwnerWorkbenchApi,
  getWorkDemandsApi,
  getWorkItemTypesApi,
  getWorkPhaseTypesApi,
  updateWorkLogOwnerEstimateApi,
} from '../api/work'
import { formatBeijingDate, formatBeijingDateTime, getBeijingTodayDateString } from '../utils/datetime'
import './OwnerWorkbench.css'

const { Text } = Typography
const EMPTY_ARRAY = []

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getSearchText(item) {
  return [
    item?.id,
    item?.username,
    item?.item_type_name,
    item?.demand_id,
    item?.demand_name,
    item?.assigned_by_name,
    item?.phase_name,
    item?.phase_key,
    item?.task_source,
    item?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getTaskSourceLabel(source) {
  if (source === 'OWNER_ASSIGN') return 'Owner指派'
  if (source === 'WORKFLOW_AUTO') return '流程待办'
  return '自主填报'
}

function getTaskSourceColor(source) {
  if (source === 'OWNER_ASSIGN') return 'purple'
  if (source === 'WORKFLOW_AUTO') return 'geekblue'
  return 'default'
}

function getSuggestedAssignStatusByStartDate(expectedStartDate) {
  const today = getBeijingTodayDateString()
  const startDate = String(expectedStartDate || '').trim() || today
  return startDate > today ? 'TODO' : 'IN_PROGRESS'
}

function OwnerWorkbench() {
  const [loading, setLoading] = useState(false)
  const [savingEstimate, setSavingEstimate] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [noAccess, setNoAccess] = useState(false)
  const [noAccessMessage, setNoAccessMessage] = useState('仅部门负责人可访问 Owner 工作台')

  const [estimateModalOpen, setEstimateModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignStatusManuallyChanged, setAssignStatusManuallyChanged] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [memberFilter, setMemberFilter] = useState()
  const [phaseFilter, setPhaseFilter] = useState()
  const [pendingOnly, setPendingOnly] = useState(true)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])

  const [estimateForm] = Form.useForm()
  const [batchForm] = Form.useForm()
  const [assignForm] = Form.useForm()

  const [data, setData] = useState({
    data_scope: {
      scope_type: 'SELF_DEPARTMENT',
      scope_label: '-',
      department_id: null,
      department_name: null,
      team_member_count: 0,
    },
    team_overview: {
      team_size: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      total_personal_estimate_hours_today: 0,
      total_actual_hours_today: 0,
    },
    no_fill_members: [],
    team_members: [],
    owner_estimate_items: [],
    owner_estimate_pending_count: 0,
  })

  const [itemTypes, setItemTypes] = useState([])
  const [demands, setDemands] = useState([])
  const [phaseDictItems, setPhaseDictItems] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOwnerWorkbenchApi()
      if (!result?.success) {
        message.error(result?.message || '获取 Owner 工作台失败')
        return
      }
      setNoAccess(false)
      setData(result.data || {})
      setLastLoadedAt(new Date())
      setSelectedRowKeys([])
    } catch (error) {
      if (error?.status === 403) {
        setNoAccess(true)
        setNoAccessMessage(error?.message || '仅部门负责人可访问 Owner 工作台')
      } else {
        message.error(error?.message || '获取 Owner 工作台失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAssignBase = useCallback(async () => {
    try {
      const [itemTypeResult, demandResult, phaseResult] = await Promise.all([
        getWorkItemTypesApi({ enabled_only: 1 }),
        getWorkDemandsApi({ page: 1, pageSize: 1000 }),
        getWorkPhaseTypesApi({ enabled_only: 1 }),
      ])
      if (itemTypeResult?.success) {
        setItemTypes(itemTypeResult.data || [])
      }
      if (demandResult?.success) {
        setDemands(demandResult.data?.list || [])
      }
      if (phaseResult?.success) {
        setPhaseDictItems(
          (phaseResult.data || []).map((item) => ({
            phase_key: item.phase_key,
            phase_name: item.phase_name,
          })),
        )
      }
    } catch {
      // keep owner panel available even if optional lists fail
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadAssignBase()
  }, [loadAssignBase])

  const overview = data.team_overview || {}
  const teamSize = toNumber(overview.team_size, 0)
  const scheduledUsers = toNumber(overview.scheduled_users_today, 0)
  const filledUsers = toNumber(overview.filled_users_today, 0)
  const unfilledUsers = toNumber(overview.unfilled_users_today, 0)
  const unscheduledUsers = toNumber(overview.unscheduled_users_today, 0)
  const scheduledFillRate =
    scheduledUsers > 0 ? Math.min(100, Math.max(0, (filledUsers / scheduledUsers) * 100)) : 100
  const noFillMembers = useMemo(
    () => (Array.isArray(data.no_fill_members) ? data.no_fill_members : EMPTY_ARRAY),
    [data.no_fill_members],
  )
  const teamMembers = useMemo(
    () => (Array.isArray(data.team_members) ? data.team_members : EMPTY_ARRAY),
    [data.team_members],
  )
  const sortedTeamMembers = useMemo(() => {
    const getStatusRank = (item) => {
      const todayScheduled = Boolean(item?.today_scheduled)
      const todayFilled = Boolean(item?.today_filled)
      if (!todayScheduled) return 0 // 未安排
      if (!todayFilled) return 1 // 待填报
      return 2 // 已填报
    }

    return [...teamMembers].sort((a, b) => {
      const rankDiff = getStatusRank(a) - getStatusRank(b)
      if (rankDiff !== 0) return rankDiff

      const assignableDiff = toNumber(b?.assignable_hours, 0) - toNumber(a?.assignable_hours, 0)
      if (assignableDiff !== 0) return assignableDiff

      return String(a?.username || '').localeCompare(String(b?.username || ''), 'zh-Hans-CN')
    })
  }, [teamMembers])
  const ownerEstimateItems = useMemo(
    () => (Array.isArray(data.owner_estimate_items) ? data.owner_estimate_items : EMPTY_ARRAY),
    [data.owner_estimate_items],
  )
  const pendingOwnerEstimateCount = toNumber(data.owner_estimate_pending_count, 0)
  const assignItemTypeId = Form.useWatch('item_type_id', assignForm)

  const memberOptions = useMemo(() => {
    const map = new Map()
    teamMembers.forEach((item) => {
      const id = Number(item.id)
      if (!Number.isInteger(id) || id <= 0) return
      if (!map.has(id)) {
        map.set(id, {
          value: id,
          label: item.username ? item.username : `User ${id}`,
        })
      }
    })
    ownerEstimateItems.forEach((item) => {
      const id = Number(item.user_id)
      if (!Number.isInteger(id)) return
      if (!map.has(id)) {
        map.set(id, {
          value: id,
          label: item.username ? item.username : `User ${id}`,
        })
      }
    })
    return Array.from(map.values())
  }, [ownerEstimateItems, teamMembers])

  const phaseOptions = useMemo(() => {
    const map = new Map()
    ownerEstimateItems.forEach((item) => {
      const key = String(item.phase_key || '')
      if (!key) return
      if (!map.has(key)) {
        const label = item.phase_name ? `${item.phase_name} (${key})` : key
        map.set(key, { value: key, label })
      }
    })
    return Array.from(map.values())
  }, [ownerEstimateItems])

  const assignItemTypeOptions = useMemo(
    () =>
      itemTypes.map((item) => ({
        value: item.id,
        label: `${item.name}${Number(item.require_demand) === 1 ? '（需关联需求）' : ''}`,
        require_demand: Number(item.require_demand) === 1 ? 1 : 0,
      })),
    [itemTypes],
  )

  const assignDemandOptions = useMemo(
    () =>
      demands.map((item) => ({
        value: item.id,
        label: `${item.id} - ${item.name}`,
      })),
    [demands],
  )

  const assignPhaseOptions = useMemo(
    () =>
      phaseDictItems.map((item) => ({
        value: item.phase_key,
        label: `${item.phase_name} (${item.phase_key})`,
      })),
    [phaseDictItems],
  )

  const selectedAssignItemType = useMemo(
    () => itemTypes.find((item) => Number(item.id) === Number(assignItemTypeId)) || null,
    [itemTypes, assignItemTypeId],
  )

  const filteredOwnerEstimateItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return ownerEstimateItems.filter((item) => {
      if (pendingOnly && item.owner_estimate_hours !== null && item.owner_estimate_hours !== undefined) return false
      if (memberFilter && Number(item.user_id) !== Number(memberFilter)) return false
      if (phaseFilter && String(item.phase_key || '') !== String(phaseFilter)) return false
      if (q && !getSearchText(item).includes(q)) return false
      return true
    })
  }, [ownerEstimateItems, keyword, memberFilter, phaseFilter, pendingOnly])

  const openEstimateModal = (item) => {
    setEditingItem(item)
    estimateForm.setFieldsValue({
      owner_estimate_hours:
        item?.owner_estimate_hours === null || item?.owner_estimate_hours === undefined
          ? undefined
          : toNumber(item.owner_estimate_hours, 0),
    })
    setEstimateModalOpen(true)
  }

  const closeEstimateModal = () => {
    setEstimateModalOpen(false)
    setEditingItem(null)
    estimateForm.resetFields()
  }

  const handleSaveOwnerEstimate = async () => {
    if (!editingItem?.id) return

    try {
      const values = await estimateForm.validateFields()
      setSavingEstimate(true)
      const result = await updateWorkLogOwnerEstimateApi(editingItem.id, {
        owner_estimate_hours: values.owner_estimate_hours,
      })

      if (!result?.success) {
        message.error(result?.message || 'Owner 预估更新失败')
        return
      }

      message.success('Owner 预估已更新')
      closeEstimateModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查 Owner 预估输入')
      } else {
        message.error(error?.message || 'Owner 预估更新失败')
      }
    } finally {
      setSavingEstimate(false)
    }
  }

  const openBatchModal = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要批量评估的事项')
      return
    }
    batchForm.setFieldsValue({ owner_estimate_hours: undefined })
    setBatchModalOpen(true)
  }

  const closeBatchModal = () => {
    setBatchModalOpen(false)
    batchForm.resetFields()
  }

  const handleBatchSave = async () => {
    try {
      const values = await batchForm.validateFields()
      const targets = filteredOwnerEstimateItems.filter((item) => selectedRowKeys.includes(item.id))
      if (targets.length === 0) {
        message.warning('当前筛选结果中没有可批量更新的事项')
        return
      }

      setBatchSaving(true)
      let successCount = 0
      for (const item of targets) {
        try {
          const result = await updateWorkLogOwnerEstimateApi(item.id, {
            owner_estimate_hours: values.owner_estimate_hours,
          })
          if (result?.success) successCount += 1
        } catch {
          // keep going for batch robustness
        }
      }

      message.success(`批量更新完成：成功 ${successCount}/${targets.length}`)
      closeBatchModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查批量评估输入')
      } else {
        message.error(error?.message || '批量更新失败')
      }
    } finally {
      setBatchSaving(false)
    }
  }

  const openAssignModal = () => {
    const today = getBeijingTodayDateString()
    assignForm.resetFields()
    assignForm.setFieldsValue({
      log_status: getSuggestedAssignStatusByStartDate(today),
      owner_estimate_hours: 1,
      expected_start_date: today,
      log_date: today,
    })
    setAssignStatusManuallyChanged(false)
    setAssignModalOpen(true)
  }

  const closeAssignModal = () => {
    setAssignModalOpen(false)
    setAssignStatusManuallyChanged(false)
    assignForm.resetFields()
  }

  const handleCreateOwnerAssign = async () => {
    try {
      const values = await assignForm.validateFields()
      const requireDemand = Number(selectedAssignItemType?.require_demand) === 1
      if (requireDemand && !values.demand_id) {
        message.warning('当前事项类型必须关联需求')
        return
      }
      if (values.demand_id && !values.phase_key) {
        message.warning('关联需求时必须选择阶段')
        return
      }

      setAssignSaving(true)
      const resolvedExpectedStartDate = values.expected_start_date || getBeijingTodayDateString()
      const payload = {
        assignee_user_id: values.assignee_user_id,
        item_type_id: values.item_type_id,
        demand_id: values.demand_id || null,
        phase_key: values.demand_id ? values.phase_key : null,
        description: values.description,
        owner_estimate_hours: values.owner_estimate_hours,
        expected_start_date: resolvedExpectedStartDate,
        expected_completion_date: values.expected_completion_date || null,
        log_status: values.log_status || getSuggestedAssignStatusByStartDate(resolvedExpectedStartDate),
        log_date: values.log_date || getBeijingTodayDateString(),
      }

      const result = await createOwnerAssignedLogApi(payload)
      if (!result?.success) {
        message.error(result?.message || '指派事项创建失败')
        return
      }

      message.success('指派事项已创建')
      closeAssignModal()
      await loadData()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '指派事项创建失败')
      }
    } finally {
      setAssignSaving(false)
    }
  }

  const ownerEstimateColumns = [
    {
      title: '事项ID',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (value) => <Tag color="blue">#{value}</Tag>,
    },
    {
      title: '成员',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '关联需求',
      key: 'demand',
      width: 240,
      render: (_, row) => (row.demand_id ? `${row.demand_id} - ${row.demand_name || '-'}` : '-'),
    },
    {
      title: '阶段',
      key: 'phase',
      width: 150,
      render: (_, row) => row.phase_name || row.phase_key || '-',
    },
    {
      title: '来源',
      key: 'task_source',
      width: 110,
      render: (_, row) => <Tag color={getTaskSourceColor(row.task_source)}>{getTaskSourceLabel(row.task_source)}</Tag>,
    },
    {
      title: '指派人',
      dataIndex: 'assigned_by_name',
      key: 'assigned_by_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '个人预估(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 100,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '预计完成日期',
      dataIndex: 'expected_completion_date',
      key: 'expected_completion_date',
      width: 130,
      render: (value) => formatBeijingDate(value),
    },
    {
      title: 'Owner评估(h)',
      dataIndex: 'owner_estimate_hours',
      key: 'owner_estimate_hours',
      width: 130,
      render: (value) =>
        value === null || value === undefined ? <Tag color="orange">待评估</Tag> : toNumber(value, 0).toFixed(1),
    },
    {
      title: 'Owner评估时间',
      dataIndex: 'owner_estimated_at',
      key: 'owner_estimated_at',
      width: 160,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => openEstimateModal(row)}>
          维护评估
        </Button>
      ),
    },
  ]

  const teamCapacityColumns = [
    {
      title: '成员',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '今日状态',
      key: 'today_status',
      width: 130,
      render: (_, row) => {
        const todayScheduled = Boolean(row?.today_scheduled)
        const todayFilled = Boolean(row?.today_filled)
        if (!todayScheduled) return <Tag color="blue">未安排</Tag>
        if (todayFilled) return <Tag color="green">已填报</Tag>
        return <Tag color="orange">待填报</Tag>
      },
    },
    {
      title: '今日计划(h)',
      dataIndex: 'today_planned_hours',
      key: 'today_planned_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '今日实际(h)',
      dataIndex: 'today_actual_hours',
      key: 'today_actual_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '可指派(h)',
      dataIndex: 'assignable_hours',
      key: 'assignable_hours',
      width: 120,
      render: (value) => <span className="owner-inline-accent">{toNumber(value, 0).toFixed(1)}</span>,
    },
  ]

  if (noAccess) {
    return (
      <div className="owner-workbench-page owner-workbench-page--no-access">
        <Card variant="borderless" className="owner-shell-card owner-no-access-card">
          <Result
            status="403"
            title="暂无访问权限"
            subTitle={noAccessMessage}
            extra={[
              <Button key="refresh" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                重新校验权限
              </Button>,
            ]}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="owner-workbench-page">
      <div className="owner-workbench-layout">
      <Card
        variant="borderless"
        className="owner-shell-card owner-overview-shell"
        extra={
          <Space wrap>
            <Text type="secondary" className="owner-refresh-text">
              最近刷新：{formatBeijingDateTime(lastLoadedAt)}
            </Text>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div className="owner-metric-value">{teamSize}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <AlertOutlined />
                <Text type="secondary">今日有安排</Text>
              </Space>
              <div className="owner-metric-value">{scheduledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <AlertOutlined />
                <Text type="secondary">有安排已填报</Text>
              </Space>
              <div className="owner-metric-value owner-metric-value--success">{filledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <WarningOutlined />
                <Text type="secondary">有安排待填报</Text>
              </Space>
              <div className="owner-metric-value owner-metric-value--danger">{unfilledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日未安排</Text>
              </Space>
              <div className="owner-metric-value">{unscheduledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">安排填报率</Text>
              </Space>
              <div className="owner-metric-value">{`${scheduledFillRate.toFixed(1)}%`}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card owner-metric-card--waitlist">
              <Space orientation="vertical" size={6} className="owner-metric-stack">
                <Space>
                  <WarningOutlined />
                  <Text type="secondary">待填报名单</Text>
                </Space>
                {noFillMembers.length === 0 ? (
                  <Text type="secondary" className="owner-metric-note">
                    今日有安排成员已填报
                  </Text>
                ) : (
                  <div className="owner-waitlist-tags">
                    {noFillMembers.map((member) => (
                      <Tag color="error" key={member.id}>
                        {member.username || `用户${member.id}`}
                      </Tag>
                    ))}
                  </div>
                )}
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日计划(h)</Text>
              </Space>
              <div className="owner-metric-value">
                {toNumber(overview.total_personal_estimate_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日实际(h)</Text>
              </Space>
              <div className="owner-metric-value">
                {toNumber(overview.total_actual_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={6} xl={3} className="owner-metric-col">
            <Card variant="borderless" className="owner-metric-card">
              <Space>
                <TeamOutlined />
                <Text type="secondary">可指派(h)</Text>
              </Space>
              <div className="owner-metric-value owner-metric-value--accent">
                {toNumber(overview.total_assignable_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="成员当日负载"
        variant="borderless"
        className="owner-section-card owner-member-section"
        extra={<Tag>{`成员 ${sortedTeamMembers.length}`}</Tag>}
      >
        {sortedTeamMembers.length === 0 ? (
          <Empty description="当前范围暂无成员数据" />
        ) : (
          <div className="owner-table-wrap">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              columns={teamCapacityColumns}
              dataSource={sortedTeamMembers}
              scroll={{ x: 680 }}
              className="owner-workbench-table"
            />
          </div>
        )}
      </Card>

      <Card
        title="事项 Owner 评估维护"
        variant="borderless"
        className="owner-section-card owner-estimate-section"
        extra={
          <Space wrap>
            <Tag color={pendingOwnerEstimateCount > 0 ? 'orange' : 'green'}>{`待评估 ${pendingOwnerEstimateCount}`}</Tag>
            <Tag>{`总事项 ${ownerEstimateItems.length}`}</Tag>
            <Tag>{`筛选后 ${filteredOwnerEstimateItems.length}`}</Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAssignModal}>
              添加事项
            </Button>
          </Space>
        }
      >
        <Space wrap className="owner-filter-toolbar">
          <Input
            allowClear
            placeholder="搜索成员/需求/阶段/描述"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="owner-filter-input owner-filter-input--keyword"
          />
          <Select
            allowClear
            placeholder="筛选成员"
            options={memberOptions}
            value={memberFilter}
            onChange={setMemberFilter}
            className="owner-filter-input owner-filter-input--member"
          />
          <Select
            allowClear
            placeholder="筛选阶段"
            options={phaseOptions}
            value={phaseFilter}
            onChange={setPhaseFilter}
            className="owner-filter-input owner-filter-input--phase"
          />
          <Space className="owner-toggle-group">
            <Text type="secondary">仅看待评估</Text>
            <Switch checked={pendingOnly} onChange={setPendingOnly} />
          </Space>
          <Button onClick={() => setSelectedRowKeys([])}>清空勾选</Button>
          <Button type="primary" disabled={selectedRowKeys.length === 0} onClick={openBatchModal}>
            批量评估
          </Button>
        </Space>

        {filteredOwnerEstimateItems.length === 0 ? (
          <Empty description="当前筛选下暂无可维护事项" />
        ) : (
          <div className="owner-table-wrap">
            <Table
              rowKey="id"
              loading={loading}
              columns={ownerEstimateColumns}
              dataSource={filteredOwnerEstimateItems}
              size="small"
              scroll={{ x: 1860 }}
              className="owner-workbench-table"
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
                preserveSelectedRowKeys: true,
              }}
              pagination={{
                pageSize: 10,
                showSizeChanger: false,
                showTotal: (count) => `共 ${count} 条`,
              }}
            />
          </div>
        )}
      </Card>

      <Modal
        title={editingItem ? `维护 Owner 评估：#${editingItem.id}` : '维护 Owner 评估'}
        open={estimateModalOpen}
        onCancel={closeEstimateModal}
        onOk={handleSaveOwnerEstimate}
        confirmLoading={savingEstimate}
        okText="保存"
        cancelText="取消"
        forceRender
        destroyOnHidden
      >
        <Form form={estimateForm} layout="vertical" className="owner-modal-form">
          <Form.Item
            label="Owner评估(h)"
            name="owner_estimate_hours"
            rules={[{ required: true, message: '请输入 Owner 评估用时' }]}
          >
            <InputNumber min={0} step={0.5} className="owner-input-number-full" />
          </Form.Item>
          {editingItem ? (
            <div className="owner-modal-note">
              事项: {editingItem.item_type_name || '-'} / 成员: {editingItem.username || '-'}
            </div>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={`批量评估（已选 ${selectedRowKeys.length} 项）`}
        open={batchModalOpen}
        onCancel={closeBatchModal}
        onOk={handleBatchSave}
        confirmLoading={batchSaving}
        okText="批量保存"
        cancelText="取消"
        forceRender
        destroyOnHidden
      >
        <Form form={batchForm} layout="vertical" className="owner-modal-form">
          <Form.Item
            label="统一 Owner评估(h)"
            name="owner_estimate_hours"
            rules={[{ required: true, message: '请输入评估用时' }]}
          >
            <InputNumber min={0} step={0.5} className="owner-input-number-full" />
          </Form.Item>
          <Text type="secondary">将对当前筛选结果中已勾选事项统一设置该评估值。</Text>
        </Form>
      </Modal>

      <Modal
        title="添加并指派事项"
        open={assignModalOpen}
        onCancel={closeAssignModal}
        onOk={handleCreateOwnerAssign}
        confirmLoading={assignSaving}
        okText="确认指派"
        cancelText="取消"
        forceRender
        destroyOnHidden
      >
        <Form
          form={assignForm}
          layout="vertical"
          className="owner-modal-form"
          onValuesChange={(changedValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues, 'item_type_id')) {
              const nextItemType = itemTypes.find((item) => Number(item.id) === Number(changedValues.item_type_id))
              if (Number(nextItemType?.require_demand) !== 1) {
                assignForm.setFieldsValue({
                  demand_id: undefined,
                  phase_key: undefined,
                })
              }
            }
            if (Object.prototype.hasOwnProperty.call(changedValues, 'demand_id') && !changedValues.demand_id) {
              assignForm.setFieldsValue({ phase_key: undefined })
            }
          }}
        >
          <Form.Item
            label="指派给成员"
            name="assignee_user_id"
            rules={[{ required: true, message: '请选择成员' }]}
          >
            <Select
              showSearch
              placeholder="请选择成员"
              options={memberOptions}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            label="事项类型"
            name="item_type_id"
            rules={[{ required: true, message: '请选择事项类型' }]}
          >
            <Select
              showSearch
              placeholder="请选择事项类型"
              options={assignItemTypeOptions}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            label="关联需求"
            name="demand_id"
            rules={[
              {
                validator(_, value) {
                  if (Number(selectedAssignItemType?.require_demand) === 1 && !value) {
                    return Promise.reject(new Error('当前事项类型必须关联需求'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Select
              allowClear
              showSearch
              placeholder={Number(selectedAssignItemType?.require_demand) === 1 ? '必选：请选择需求' : '可选：选择需求'}
              options={assignDemandOptions}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.demand_id !== next.demand_id}
          >
            {({ getFieldValue }) =>
              getFieldValue('demand_id') ? (
                <Form.Item
                  label="需求阶段"
                  name="phase_key"
                  rules={[{ required: true, message: '请选择需求阶段' }]}
                >
                  <Select
                    showSearch
                    placeholder="请选择阶段"
                    options={assignPhaseOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            label="工作描述"
            name="description"
            rules={[{ required: true, message: '请输入工作描述' }]}
          >
            <Input.TextArea rows={3} maxLength={2000} placeholder="请输入本次要指派的事项说明" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Owner评估(h)"
                name="owner_estimate_hours"
                rules={[{ required: true, message: '请输入Owner评估用时' }]}
              >
                <InputNumber min={0.5} step={0.5} className="owner-input-number-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="状态"
                name="log_status"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select
                  onChange={() => setAssignStatusManuallyChanged(true)}
                  options={[
                    { label: '待开始', value: 'TODO' },
                    { label: '进行中', value: 'IN_PROGRESS' },
                    { label: '已完成', value: 'DONE' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="预计开始日期"
                name="expected_start_date"
                rules={[{ required: true, message: '请选择预计开始日期' }]}
              >
                <Input
                  type="date"
                  onChange={(event) => {
                    const nextDate = event?.target?.value || ''
                    if (!assignStatusManuallyChanged) {
                      assignForm.setFieldValue('log_status', getSuggestedAssignStatusByStartDate(nextDate))
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="预计完成日期" name="expected_completion_date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="填报日期" name="log_date">
            <Input type="date" />
          </Form.Item>

          <Text type="secondary" className="owner-modal-note">
            指派事项会同步出现在被指派人的“我进行中的事项”中，并标记来源为“Owner指派”。
          </Text>
        </Form>
      </Modal>
      </div>
    </div>
  )
}

export default OwnerWorkbench
