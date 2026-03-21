import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Empty, Row, Space, Table, Tabs, Tag, Typography, message } from 'antd'
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

function getFocusLevelTag(level) {
  if (level === 'OVERDUE') return <Tag color="error">逾期</Tag>
  if (level === 'DUE_TODAY') return <Tag color="warning">今日到期</Tag>
  return <Tag>普通</Tag>
}

function MorningStandupBoard() {
  const currentUser = useMemo(() => getCurrentUser(), [])
  const [loading, setLoading] = useState(false)
  const [activeTabKey, setActiveTabKey] = useState('')
  const [focusExpanded, setFocusExpanded] = useState(false)
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
      filled_users_today: 0,
      unfilled_users_today: 0,
      active_item_count: 0,
      overdue_item_count: 0,
      due_today_item_count: 0,
    },
    focus_summary: {
      overdue_count: 0,
      due_today_count: 0,
      active_count: 0,
      unfilled_count: 0,
    },
    focus_items: [],
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
      setFocusExpanded(false)
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
  const focusItems = Array.isArray(data.focus_items) ? data.focus_items : []
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

  const visibleFocusItems = useMemo(() => {
    const limit = focusExpanded ? 20 : 5
    return focusItems.slice(0, limit)
  }, [focusItems, focusExpanded])

  const focusColumns = useMemo(
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
        title: '状态',
        dataIndex: 'log_status',
        key: 'log_status',
        width: 96,
        render: (value) => <Tag color={getStatusTagColor(value)}>{value || '-'}</Tag>,
      },
    ],
    [],
  )

  const focusDataSource = useMemo(
    () =>
      visibleFocusItems.map((item) => ({
        ...item,
        key: `${item.id}-${item.user_id}`,
      })),
    [visibleFocusItems],
  )

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
    const todayFilled = Boolean(member?.today_filled)

    return (
      <Card
        key={member.user_id}
        size="small"
        title={
          <Space size={8}>
            <Text strong>{member.username}</Text>
            {Number(member.user_id) === Number(currentUser?.id) ? <Tag color="blue">我</Tag> : null}
            {todayFilled ? <Tag color="green">已填报</Tag> : <Tag color="orange">未填报</Tag>}
            <Tag>{`进行中 ${activeItems.length}`}</Tag>
          </Space>
        }
      >
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
                      <Tag color={getStatusTagColor(item.log_status)}>{item.log_status || 'IN_PROGRESS'}</Tag>
                      <Text strong>{item.item_type_name || '-'}</Text>
                    </Space>
                    <Space size={6} wrap>
                      {item.demand_id ? <Tag>{item.demand_name || item.demand_id}</Tag> : null}
                      {item.phase_name ? <Tag color="geekblue">{item.phase_name}</Tag> : null}
                    </Space>
                  </div>
                  <div style={{ marginTop: 6, color: '#667085', fontSize: 13 }}>
                    预计完成：
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
    <div style={{ padding: 12 }}>
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
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{toNumber(summary.team_size)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <CheckCircleOutlined />
                <Text type="secondary">今日已填报</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{toNumber(summary.filled_users_today)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <WarningOutlined />
                <Text type="secondary">今日未填报</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#d4380d' }}>
                {toNumber(summary.unfilled_users_today)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">进行中事项</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{toNumber(summary.active_item_count)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <WarningOutlined />
                <Text type="secondary">逾期事项</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#cf1322' }}>
                {toNumber(summary.overdue_item_count)}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Space>
                <ClockCircleOutlined />
                <Text type="secondary">今日到期</Text>
              </Space>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#d48806' }}>
                {toNumber(summary.due_today_item_count)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card size="small" title="未填报名单" variant="borderless" styles={{ body: { paddingTop: 8 } }}>
            {noFillMembers.length === 0 ? (
              <Text type="secondary">今天已全部填报</Text>
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

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card
            size="small"
            title="今日重点事项"
            variant="borderless"
            className="morning-focus-ultra"
            styles={{ body: { paddingTop: 10, paddingBottom: 8 } }}
            extra={
              focusItems.length > 5 ? (
                <Button type="link" size="small" onClick={() => setFocusExpanded((prev) => !prev)}>
                  {focusExpanded ? '收起' : '展开更多'}
                </Button>
              ) : null
            }
          >
            <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
              <Col xs={12} md={6}>
                <Card size="small" styles={{ body: { padding: 8 } }}>
                  <Text type="secondary">逾期事项</Text>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: '#cf1322', lineHeight: '20px' }}>
                    {toNumber(focusSummary.overdue_count)}
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small" styles={{ body: { padding: 8 } }}>
                  <Text type="secondary">今日到期</Text>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: '#d48806', lineHeight: '20px' }}>
                    {toNumber(focusSummary.due_today_count)}
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small" styles={{ body: { padding: 8 } }}>
                  <Text type="secondary">进行中事项</Text>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, lineHeight: '20px' }}>
                    {toNumber(focusSummary.active_count)}
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small" styles={{ body: { padding: 8 } }}>
                  <Text type="secondary">未填报人数</Text>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: '#d4380d', lineHeight: '20px' }}>
                    {toNumber(focusSummary.unfilled_count)}
                  </div>
                </Card>
              </Col>
            </Row>

            {visibleFocusItems.length === 0 ? (
              <Empty description="暂无重点事项" />
            ) : (
              <Table
                size="small"
                columns={focusColumns}
                dataSource={focusDataSource}
                pagination={false}
                bordered={false}
                className="morning-focus-table-ultra"
                scroll={{ x: 760 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="成员进行中事项" variant="borderless" loading={loading}>
        {members.length === 0 ? (
          <Empty description="当前范围暂无成员" />
        ) : (
          <Row gutter={[12, 12]}>
            {sortedMembers.map((member) => (
              <Col key={member.user_id} xs={24} md={12} xl={8}>
                {renderMemberCard(member)}
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </div>
  )
}

export default MorningStandupBoard