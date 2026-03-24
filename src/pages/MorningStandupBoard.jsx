import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Card, Col, Empty, Progress, Row, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMorningStandupBoardApi } from '../api/work'
import { getCurrentUser } from '../utils/access'
import { formatBeijingDate, getBeijingTodayDateString } from '../utils/datetime'
import './MorningStandupBoard.css'

const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function parseDepartmentIdFromTabKey(tabKey) {
  const raw = String(tabKey || '').trim().toLowerCase()
  if (!raw.startsWith('dept-')) return null
  const num = Number(raw.slice(5))
  return Number.isInteger(num) && num > 0 ? num : null
}

function getStatusTagColor(status) {
  if (status === 'TODO') return 'default'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'DONE') return 'success'
  return 'default'
}

function getStatusLabel(status) {
  if (status === 'TODO') return '待开始'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'DONE') return '已完成'
  return status || '-'
}

function truncateText(value, maxLength = 8) {
  const text = String(value || '').trim()
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return `${chars.slice(0, maxLength).join('')}...`
}

function getFocusLevelTag(level) {
  if (level === 'OVERDUE') return <Tag color="error">逾期</Tag>
  if (level === 'DUE_TODAY') return <Tag color="warning">今日到期</Tag>
  return <Tag>普通</Tag>
}

function getYesterdayCheckTag(checkResult) {
  if (checkResult === 'NOT_DONE') return <Tag color="error">未完成</Tag>
  if (checkResult === 'LATE_DONE') return <Tag color="warning">延迟完成</Tag>
  if (checkResult === 'ON_TIME') return <Tag color="success">按期完成</Tag>
  return <Tag>待检查</Tag>
}

function getStartHintTag(daysToStart) {
  const days = Number(daysToStart)
  if (!Number.isFinite(days)) return <Text type="secondary">-</Text>
  if (days < 0) return <Tag color="warning">{`开始已滞后 ${Math.abs(days)} 天`}</Tag>
  if (days === 0) return <Tag color="processing">今日启动</Tag>
  return <Tag color="blue">{`${days} 天后开始`}</Tag>
}

function clampPercent(value) {
  const num = toNumber(value, 0)
  return Math.max(0, Math.min(100, num))
}

function MorningStandupBoard() {
  const currentUser = useMemo(() => getCurrentUser(), [])
  const [loading, setLoading] = useState(false)
  const [activeTabKey, setActiveTabKey] = useState('')
  const [activeAlignmentTab, setActiveAlignmentTab] = useState('in_progress')
  const [data, setData] = useState({
    tabs: [],
    default_tab_key: '',
    current_tab_key: '',
    view_scope: {
      mode: 'DEPARTMENT',
      department_id: null,
      department_name: '',
      department_ids: [],
    },
    summary: {
      team_size: 0,
      scheduled_users_today: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      unscheduled_users_today: 0,
      total_planned_hours_today: 0,
      total_actual_hours_today: 0,
      active_item_count: 0,
      overdue_item_count: 0,
      due_today_item_count: 0,
    },
    focus_summary: {
      overdue_count: 0,
      due_today_count: 0,
      active_count: 0,
      unfilled_count: 0,
      yesterday_due_total: 0,
      yesterday_due_not_done_count: 0,
      yesterday_due_late_done_count: 0,
      in_progress_count: 0,
      todo_pending_count: 0,
    },
    focus_items: [],
    focus_yesterday_due_items: [],
    focus_in_progress_items: [],
    focus_todo_items: [],
    members: [],
    no_fill_members: [],
  })

  const loadBoard = useCallback(async (tabKey = '') => {
    setLoading(true)
    try {
      const params = {}
      const normalizedTabKey = String(tabKey || '').trim()
      if (normalizedTabKey) {
        params.tab_key = normalizedTabKey
      }

      const departmentId = parseDepartmentIdFromTabKey(normalizedTabKey)
      if (departmentId) {
        params.department_id = departmentId
      }

      const result = await getMorningStandupBoardApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取晨会看板失败')
        return
      }

      const payload = result.data || {}
      setData(payload)
      setActiveAlignmentTab('in_progress')
      const nextTabKey = payload.current_tab_key || payload.default_tab_key || normalizedTabKey || 'all'
      setActiveTabKey(nextTabKey)
    } catch (error) {
      message.error(error?.message || '获取晨会看板失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const tabs = Array.isArray(data.tabs) ? data.tabs : []
  const members = Array.isArray(data.members) ? data.members : []
  const noFillMembers = Array.isArray(data.no_fill_members) ? data.no_fill_members : []
  const summary = data.summary || {}
  const focusSummary = data.focus_summary || {}
  const focusYesterdayDueItems = Array.isArray(data.focus_yesterday_due_items)
    ? data.focus_yesterday_due_items
    : []
  const focusInProgressItems = Array.isArray(data.focus_in_progress_items)
    ? data.focus_in_progress_items
    : []
  const focusTodoItems = Array.isArray(data.focus_todo_items) ? data.focus_todo_items : []
  const todayDate = getBeijingTodayDateString()

  const sortedMembers = useMemo(() => {
    const currentUserId = Number(currentUser?.id)
    if (!Number.isInteger(currentUserId) || currentUserId <= 0) return members

    const index = members.findIndex((item) => Number(item?.user_id) === currentUserId)
    if (index <= 0) return members

    const copy = [...members]
    const [me] = copy.splice(index, 1)
    copy.unshift(me)
    return copy
  }, [members, currentUser?.id])

  const inProgressColumns = useMemo(
    () => [
      {
        title: '级别',
        dataIndex: 'focus_level',
        key: 'focus_level',
        width: 90,
        render: (value) => getFocusLevelTag(value),
      },
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 108,
        ellipsis: true,
      },
      {
        title: '事项类型',
        dataIndex: 'item_type_name',
        key: 'item_type_name',
        width: 104,
        ellipsis: true,
      },
      {
        title: '需求名称',
        dataIndex: 'demand_name',
        key: 'demand_name',
         width: 400,
        ellipsis: true,
        render: (value, record) => (
          <Space size={4} wrap>
            {record?.demand_priority ? <Tag color="volcano">{record.demand_priority}</Tag> : null}
            <Text>{value || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '预计完成',
        dataIndex: 'expected_completion_date',
        key: 'expected_completion_date',
        width: 112,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '进展',
        key: 'progress',
        width: 170,
        render: (_, record) => {
          const showProgress = Boolean(record?.progress_show)
          if (!showProgress) return <Text type="secondary">-</Text>

          const progressPercent = clampPercent(record?.progress_percent)
          const expectedPercent = clampPercent(record?.expected_progress_percent)
          const risky = Boolean(record?.progress_risk)

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text strong>{`${progressPercent.toFixed(0)}%`}</Text>
                {risky ? <Tag color="warning">风险</Tag> : null}
              </div>
              <Progress
                percent={progressPercent}
                size="small"
                showInfo={false}
                strokeColor={risky ? '#faad14' : '#1677ff'}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {`应达 ${expectedPercent.toFixed(0)}%`}
              </Text>
            </div>
          )
        },
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 96,
        render: (value) => <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
      },
      {
        title: '工作描述',
        dataIndex: 'description',
        key: 'description',
        render: (value) => {
          const fullText = String(value || '').trim()
          if (!fullText) return '-'
          const shortText = truncateText(fullText, 8)
          if (shortText === fullText) return shortText
          return (
            <Tooltip title={fullText}>
              <span>{shortText}</span>
            </Tooltip>
          )
        },
      },
    ],
    [],
  )

  const inProgressDataSource = useMemo(
    () =>
      focusInProgressItems.map((item) => ({
        ...item,
        key: `${item.id}-${item.user_id}`,
      })),
    [focusInProgressItems],
  )

  const yesterdayDueColumns = useMemo(
    () => [
      {
        title: '检查结果',
        dataIndex: 'check_result',
        key: 'check_result',
        width: 100,
        render: (value) => getYesterdayCheckTag(value),
      },
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 100,
        ellipsis: true,
      },
      {
        title: '事项',
        dataIndex: 'item_type_name',
        key: 'item_type_name',
        width: 100,
        ellipsis: true,
      },
      {
        title: '需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 180,
        ellipsis: true,
      },
      {
        title: '预计完成',
        dataIndex: 'expected_completion_date',
        key: 'expected_completion_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '实际完成',
        dataIndex: 'log_completed_at',
        key: 'log_completed_at',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 90,
        render: (value) => <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
      },
    ],
    [],
  )

  const yesterdayDueDataSource = useMemo(
    () =>
      focusYesterdayDueItems.map((item) => ({
        ...item,
        key: `y-${item.id}-${item.user_id}`,
      })),
    [focusYesterdayDueItems],
  )

  const todoColumns = useMemo(
    () => [
      {
        title: '负责人',
        dataIndex: 'username',
        key: 'username',
        width: 100,
        ellipsis: true,
      },
      {
        title: '事项',
        dataIndex: 'item_type_name',
        key: 'item_type_name',
        width: 100,
        ellipsis: true,
      },
      {
        title: '需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 180,
        ellipsis: true,
      },
      {
        title: '预计开始',
        dataIndex: 'expected_start_date',
        key: 'expected_start_date',
        width: 108,
        render: (value) => formatBeijingDate(value, '-'),
      },
      {
        title: '开始提示',
        dataIndex: 'days_to_start',
        key: 'days_to_start',
        width: 140,
        render: (value) => getStartHintTag(value),
      },
      {
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 90,
        render: (value) => <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
      },
    ],
    [],
  )

  const todoDataSource = useMemo(
    () =>
      focusTodoItems.map((item) => ({
        ...item,
        key: `t-${item.id}-${item.user_id}`,
      })),
    [focusTodoItems],
  )

  const alignmentTabItems = useMemo(
    () => [
      {
        key: 'in_progress',
        label: `进行中事项 (${toNumber(focusSummary.in_progress_count)})`,
      },
      {
        key: 'yesterday_due',
        label: `昨日应完成检查 (${toNumber(focusSummary.yesterday_due_total)})`,
      },
      {
        key: 'todo_pending',
        label: `待开始事项 (${toNumber(focusSummary.todo_pending_count)})`,
      },
      {
        key: 'members',
        label: `成员进行中事项 (${members.length})`,
      },
    ],
    [focusSummary, members.length],
  )

  const alignmentView = useMemo(() => {
    if (activeAlignmentTab === 'members') {
      return {
        columns: [],
        dataSource: [],
        emptyText: '当前范围暂无成员',
        scrollX: 0,
      }
    }
    if (activeAlignmentTab === 'yesterday_due') {
      return {
        columns: yesterdayDueColumns,
        dataSource: yesterdayDueDataSource,
        emptyText: '昨天无应完成事项',
        scrollX: 900,
      }
    }
    if (activeAlignmentTab === 'todo_pending') {
      return {
        columns: todoColumns,
        dataSource: todoDataSource,
        emptyText: '暂无待开始事项',
        scrollX: 820,
      }
    }
    return {
      columns: inProgressColumns,
      dataSource: inProgressDataSource,
      emptyText: '暂无进行中事项',
      scrollX: 1100,
    }
  }, [
    activeAlignmentTab,
    yesterdayDueColumns,
    yesterdayDueDataSource,
    todoColumns,
    todoDataSource,
    inProgressColumns,
    inProgressDataSource,
  ])

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
      })),
    [tabs],
  )

  const handleTabChange = async (nextKey) => {
    setActiveTabKey(nextKey)
    await loadBoard(nextKey)
  }

  const renderMemberCard = (member) => {
    const activeItems = Array.isArray(member?.active_items) ? member.active_items : []
    const todayScheduled = Boolean(member?.today_scheduled)
    const todayFilled = Boolean(member?.today_filled)
    const todayPlannedHours = toNumber(member?.today_planned_hours, 0)
    const todayActualHours = toNumber(member?.today_actual_hours, 0)
    const assignableHours = toNumber(member?.assignable_hours, 0)
    const todayTag = todayScheduled
      ? todayFilled
        ? <Tag color="green">今日已填报</Tag>
        : <Tag color="orange">今日待填报</Tag>
      : <Tag color="blue">今日未安排</Tag>

    return (
      <Card
        key={member.user_id}
        size="small"
        title={
          <Space size={8}>
            <Text strong>{member.username}</Text>
            {Number(member.user_id) === Number(currentUser?.id) ? <Tag color="blue">我</Tag> : null}
            {todayTag}
            <Tag>{`进行中 ${activeItems.length}`}</Tag>
          </Space>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
            gap: 6,
            marginBottom: 10,
          }}
        >
          <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: '6px 8px', background: '#f8fafc' }}>
            <div style={{ fontSize: 12, color: '#667085' }}>今日安排</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{todayPlannedHours.toFixed(1)}h</div>
          </div>
          <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: '6px 8px', background: '#f8fafc' }}>
            <div style={{ fontSize: 12, color: '#667085' }}>今日已填</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{todayActualHours.toFixed(1)}h</div>
          </div>
          <div style={{ border: '1px solid #e4e7ec', borderRadius: 8, padding: '6px 8px', background: '#f8fafc' }}>
            <div style={{ fontSize: 12, color: '#667085' }}>可指派</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}>{assignableHours.toFixed(1)}h</div>
          </div>
        </div>

        {activeItems.length === 0 ? (
          <Text type="secondary">暂无进行中事项</Text>
        ) : (
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {activeItems.map((item) => {
              const expectedDate = formatBeijingDate(item.expected_completion_date, '')
              const overdue = expectedDate && expectedDate < todayDate
              const dueToday = expectedDate && expectedDate === todayDate

              return (
                <div
                  key={item.id}
                  style={{
                    border: overdue ? '1px solid #ffccc7' : dueToday ? '1px solid #ffe58f' : '1px solid #e4e7ec',
                    borderRadius: 8,
                    padding: 10,
                    background: overdue ? '#fff1f0' : dueToday ? '#fffbe6' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Space size={6} wrap>
                      <Tag color="blue">#{item.id}</Tag>
                      <Tag color={getStatusTagColor(item.log_status)}>{getStatusLabel(item.log_status)}</Tag>
                      <Text strong>{item.item_type_name || '-'}</Text>
                    </Space>
                    <Space size={6} wrap>
                      {item.demand_id ? <Tag>{item.demand_name || item.demand_id}</Tag> : null}
                      {item.phase_name ? <Tag color="geekblue">{item.phase_name}</Tag> : null}
                    </Space>
                  </div>
                  <div style={{ marginTop: 6, color: '#667085', fontSize: 13 }}>
                    预计完成:
                    <span style={{ color: overdue ? '#cf1322' : dueToday ? '#d48806' : '#344054' }}>
                      {formatBeijingDate(item.expected_completion_date)}
                    </span>
                    {overdue ? '（逾期）' : dueToday ? '（今日到期）' : ''}
                  </div>
                  <div style={{ marginTop: 6, color: '#475467', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {item.description || '-'}
                  </div>
                </div>
              )
            })}
          </Space>
        )}
      </Card>
    )
  }

  return (
    <div
      style={{
        padding: 12,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Tag
            icon={<ReloadOutlined />}
            style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
            onClick={() => {
              if (!loading) loadBoard(activeTabKey)
            }}
          >
            刷新
          </Tag>
        }
      >
        {tabItems.length > 0 ? (
          <Tabs activeKey={activeTabKey || tabItems[0]?.key} items={tabItems} onChange={handleTabChange} />
        ) : (
          <Empty description="暂无可用部门数据" />
        )}

        <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{toNumber(summary.team_size)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日有安排</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
                {toNumber(summary.scheduled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <CheckCircleOutlined />
                <Text type="secondary">有安排已填报</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#389e0d' }}>
                {toNumber(summary.filled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <WarningOutlined />
                <Text type="secondary">有安排待填报</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#d4380d' }}>
                {toNumber(summary.unfilled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日未安排</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
                {toNumber(summary.unscheduled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">计划用时(h)</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
                {toNumber(summary.total_planned_hours_today).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">实际用时(h)</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
                {toNumber(summary.total_actual_hours_today).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card size="small">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">进行中事项</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
                {toNumber(summary.active_item_count)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card size="small" title="有安排待填报名单" variant="borderless" styles={{ body: { paddingTop: 8 } }}>
            {noFillMembers.length === 0 ? (
              <Text type="secondary">今天有安排成员均已填报</Text>
            ) : (
              <Space wrap>
                {noFillMembers.map((member) => (
                  <Tag key={member.id} color="orange">
                    {member.username}
                  </Tag>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16, flex: 1, minHeight: 0 }}>
        <Col span={24} style={{ display: 'flex', minHeight: 0 }}>
          <Card
            size="small"
            title="今日事项对齐"
            variant="borderless"
            style={{ flex: 1, minHeight: 0 }}
            styles={{ body: { paddingTop: 8, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 } }}
            extra={
              <Space size={6} wrap>
                <Tag color="error">{`昨日未完成 ${toNumber(focusSummary.yesterday_due_not_done_count)}`}</Tag>
                <Tag color="warning">{`延迟完成 ${toNumber(focusSummary.yesterday_due_late_done_count)}`}</Tag>
              </Space>
            }
          >
            <Tabs
              activeKey={activeAlignmentTab}
              onChange={setActiveAlignmentTab}
              items={alignmentTabItems}
              size="small"
            />
            <div style={{ marginTop: 6, flex: 1, minHeight: 0, overflow: 'auto' }}>
              {activeAlignmentTab === 'members' ? (
                members.length === 0 ? (
                  <Empty description="当前范围暂无成员" />
                ) : (
                  <Row gutter={[12, 12]}>
                    {sortedMembers.map((member) => (
                      <Col key={member.user_id} xs={24} md={12} xl={8}>
                        {renderMemberCard(member)}
                      </Col>
                    ))}
                  </Row>
                )
              ) : alignmentView.dataSource.length === 0 ? (
                <Empty description={alignmentView.emptyText} />
              ) : (
                <Table
                  size="small"
                  columns={alignmentView.columns}
                  dataSource={alignmentView.dataSource}
                  pagination={false}
                  bordered={false}
                  className="morning-focus-table-ultra"
                  scroll={{ x: alignmentView.scrollX }}
                />
              )}
            </div>
          </Card>
        </Col>
      </Row>

    </div>
  )
}

export default MorningStandupBoard
