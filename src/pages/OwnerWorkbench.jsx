import {
  AlertOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Empty, Input, Progress, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOwnerWorkbenchApi, previewNoFillReminderApi } from '../api/work'

const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getPriorityColor(priority) {
  if (priority === 'P0') return 'red'
  if (priority === 'P1') return 'orange'
  if (priority === 'P2') return 'blue'
  return 'default'
}

function getStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'CANCELLED') return 'default'
  return 'warning'
}

function renderDeviation(value) {
  const num = toNumber(value, 0)
  const color = num > 0 ? '#d4380d' : num < 0 ? '#389e0d' : '#595959'
  return <span style={{ color }}>{num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1)}</span>
}

function renderDeviationRate(value) {
  if (value === null || value === undefined) return '-'
  const num = toNumber(value, 0)
  const color = num > 0 ? '#d4380d' : num < 0 ? '#389e0d' : '#595959'
  return <span style={{ color }}>{num > 0 ? `+${num.toFixed(1)}%` : `${num.toFixed(1)}%`}</span>
}

function formatDateTime(value) {
  if (!value) return '-'
  const text = String(value)
  if (text.includes('T')) return text.replace('T', ' ').slice(0, 19)
  return text.slice(0, 19)
}

function calcDemandDeviationRate(row) {
  const ownerEstimate = toNumber(row?.owner_estimate_hours, 0)
  if (ownerEstimate <= 0) return null
  return (toNumber(row?.deviation_hours, 0) / ownerEstimate) * 100
}

function OwnerWorkbench() {
  const [loading, setLoading] = useState(false)
  const [remindLoading, setRemindLoading] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const [demandKeyword, setDemandKeyword] = useState('')
  const [demandStatusFilter, setDemandStatusFilter] = useState('ALL')
  const [demandRiskFilter, setDemandRiskFilter] = useState('RISK_ONLY')

  const [phaseKeyword, setPhaseKeyword] = useState('')
  const [phaseStatusFilter, setPhaseStatusFilter] = useState('ALL')
  const [phaseRiskFilter, setPhaseRiskFilter] = useState('RISK_ONLY')

  const [data, setData] = useState({
    team_overview: {
      team_size: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      total_personal_estimate_hours_today: 0,
      total_actual_hours_today: 0,
    },
    no_fill_members: [],
    demand_risks: [],
    phase_risks: [],
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOwnerWorkbenchApi()
      if (!result?.success) {
        message.error(result?.message || '获取 Owner 工作台失败')
        return
      }
      setData(result.data || {})
      setLastLoadedAt(new Date().toISOString())
    } catch (error) {
      message.error(error?.message || '获取 Owner 工作台失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePreviewReminder = async () => {
    setRemindLoading(true)
    try {
      const result = await previewNoFillReminderApi()
      if (!result?.success) {
        message.error(result?.message || '生成提醒预览失败')
        return
      }
      const count = result?.data?.no_fill_members?.length || 0
      message.success(`提醒预览已生成，未填报 ${count} 人`)
    } catch (error) {
      message.error(error?.message || '生成提醒预览失败')
    } finally {
      setRemindLoading(false)
    }
  }

  const noFillColumns = useMemo(
    () => [
      {
        title: '用户ID',
        dataIndex: 'id',
        key: 'id',
        width: 100,
      },
      {
        title: '用户名',
        dataIndex: 'username',
        key: 'username',
      },
    ],
    [],
  )

  const demandRiskColumns = useMemo(
    () => [
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
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
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
        width: 130,
        render: (value) => toNumber(value, 0).toFixed(1),
      },
      {
        title: '累计个人预估(h)',
        dataIndex: 'total_personal_estimate_hours',
        key: 'total_personal_estimate_hours',
        width: 140,
        render: (value) => toNumber(value, 0).toFixed(1),
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
        render: (value) => renderDeviation(value),
      },
      {
        title: '偏差率',
        key: 'deviation_rate',
        width: 110,
        render: (_, row) => renderDeviationRate(calcDemandDeviationRate(row)),
      },
    ],
    [],
  )

  const phaseRiskColumns = useMemo(
    () => [
      {
        title: '需求ID',
        dataIndex: 'demand_id',
        key: 'demand_id',
        width: 110,
        render: (value) => <Tag color="blue">{value}</Tag>,
      },
      {
        title: '需求名称',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 220,
        ellipsis: true,
      },
      {
        title: '阶段',
        key: 'phase',
        width: 170,
        render: (_, row) => (
          <Space size={4}>
            <Tag color="geekblue">{row.phase_key}</Tag>
            <span>{row.phase_name}</span>
          </Space>
        ),
      },
      {
        title: '阶段Owner',
        dataIndex: 'owner_name',
        key: 'owner_name',
        width: 130,
        render: (value) => value || '-',
      },
      {
        title: '阶段状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
      },
      {
        title: '阶段预估(h)',
        dataIndex: 'estimate_hours',
        key: 'estimate_hours',
        width: 130,
        render: (value) => toNumber(value, 0).toFixed(1),
      },
      {
        title: '累计个人预估(h)',
        dataIndex: 'personal_estimate_hours',
        key: 'personal_estimate_hours',
        width: 140,
        render: (value) => toNumber(value, 0).toFixed(1),
      },
      {
        title: '累计实际(h)',
        dataIndex: 'actual_hours',
        key: 'actual_hours',
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
        render: (value) => renderDeviation(value),
      },
      {
        title: '偏差率',
        dataIndex: 'deviation_rate',
        key: 'deviation_rate',
        width: 100,
        render: (value) => renderDeviationRate(value),
      },
    ],
    [],
  )

  const overview = data.team_overview || {}
  const teamSize = toNumber(overview.team_size, 0)
  const filledUsers = toNumber(overview.filled_users_today, 0)
  const fillRate = teamSize > 0 ? Math.min(100, Math.max(0, (filledUsers / teamSize) * 100)) : 0

  const noFillMembers = useMemo(() => (Array.isArray(data.no_fill_members) ? data.no_fill_members : []), [data])
  const demandRisks = useMemo(() => (Array.isArray(data.demand_risks) ? data.demand_risks : []), [data])
  const phaseRisks = useMemo(() => (Array.isArray(data.phase_risks) ? data.phase_risks : []), [data])

  const demandRiskSummary = useMemo(
    () =>
      demandRisks.reduce(
        (acc, item) => {
          const deviation = toNumber(item?.deviation_hours, 0)
          if (deviation > 0) acc.risk += 1
          if (deviation <= 0) acc.safe += 1
          return acc
        },
        { risk: 0, safe: 0 },
      ),
    [demandRisks],
  )

  const phaseRiskSummary = useMemo(
    () =>
      phaseRisks.reduce(
        (acc, item) => {
          const deviation = toNumber(item?.deviation_hours, 0)
          if (deviation > 0) acc.risk += 1
          if (deviation <= 0) acc.safe += 1
          return acc
        },
        { risk: 0, safe: 0 },
      ),
    [phaseRisks],
  )

  const filteredDemandRisks = useMemo(() => {
    const keyword = demandKeyword.trim().toLowerCase()
    return demandRisks.filter((item) => {
      const status = String(item?.status || '').toUpperCase()
      const deviation = toNumber(item?.deviation_hours, 0)

      if (demandStatusFilter !== 'ALL' && status !== demandStatusFilter) return false
      if (demandRiskFilter === 'RISK_ONLY' && deviation <= 0) return false
      if (demandRiskFilter === 'SAFE_ONLY' && deviation > 0) return false

      if (!keyword) return true
      const text = `${item?.id || ''} ${item?.name || ''}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [demandRisks, demandKeyword, demandStatusFilter, demandRiskFilter])

  const filteredPhaseRisks = useMemo(() => {
    const keyword = phaseKeyword.trim().toLowerCase()
    return phaseRisks.filter((item) => {
      const status = String(item?.status || '').toUpperCase()
      const deviation = toNumber(item?.deviation_hours, 0)

      if (phaseStatusFilter !== 'ALL' && status !== phaseStatusFilter) return false
      if (phaseRiskFilter === 'RISK_ONLY' && deviation <= 0) return false
      if (phaseRiskFilter === 'SAFE_ONLY' && deviation > 0) return false

      if (!keyword) return true
      const text =
        `${item?.demand_id || ''} ${item?.demand_name || ''} ` +
        `${item?.phase_name || ''} ${item?.owner_name || ''}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [phaseRisks, phaseKeyword, phaseStatusFilter, phaseRiskFilter])

  return (
    <div style={{ padding: 24, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Owner工作台</h1>
        <p style={{ margin: '8px 0 0', color: '#667085' }}>
          面向团队负责人的每日视图：填报覆盖、工时投入、需求风险和阶段风险。
        </p>
      </div>

      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space wrap>
            <Text type="secondary">最近刷新：{formatDateTime(lastLoadedAt)}</Text>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              刷新
            </Button>
            <Button icon={<AlertOutlined />} loading={remindLoading} onClick={handlePreviewReminder}>
              未填报提醒预览
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{teamSize}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <AlertOutlined />
                <Text type="secondary">今日已填报</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{filledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日填报率</Text>
              </Space>
              <div style={{ marginTop: 10 }}>
                <Progress
                  percent={Number(fillRate.toFixed(1))}
                  size="small"
                  status={fillRate >= 85 ? 'success' : fillRate >= 60 ? 'normal' : 'exception'}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <WarningOutlined />
                <Text type="secondary">今日未填报</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#d4380d' }}>
                {toNumber(overview.unfilled_users_today, 0)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日预估(h)</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                {toNumber(overview.total_personal_estimate_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日实际(h)</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                {toNumber(overview.total_actual_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="今日未填报成员" variant="borderless">
            {noFillMembers.length === 0 ? (
              <Empty description="今日全员已填报" />
            ) : (
              <Table
                rowKey="id"
                loading={loading}
                columns={noFillColumns}
                dataSource={noFillMembers}
                pagination={false}
                size="small"
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="需求风险排行" variant="borderless">
            <div
              style={{
                marginBottom: 12,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 8,
              }}
            >
              <Input
                allowClear
                value={demandKeyword}
                onChange={(e) => setDemandKeyword(e.target.value)}
                prefix={<SearchOutlined />}
                placeholder="搜索需求ID/名称"
              />
              <Select
                value={demandStatusFilter}
                onChange={(value) => setDemandStatusFilter(value)}
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '待开始', value: 'TODO' },
                  { label: '进行中', value: 'IN_PROGRESS' },
                ]}
              />
              <Select
                value={demandRiskFilter}
                onChange={(value) => setDemandRiskFilter(value)}
                options={[
                  { label: '仅风险项', value: 'RISK_ONLY' },
                  { label: '全部项', value: 'ALL' },
                  { label: '仅健康项', value: 'SAFE_ONLY' },
                ]}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Space wrap>
                <Tag color="red">风险需求 {demandRiskSummary.risk}</Tag>
                <Tag color="green">健康需求 {demandRiskSummary.safe}</Tag>
                <Tag>筛选后 {filteredDemandRisks.length}</Tag>
              </Space>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <Table
                rowKey="id"
                loading={loading}
                columns={demandRiskColumns}
                dataSource={filteredDemandRisks}
                size="middle"
                scroll={{ x: 1360 }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: false,
                  showTotal: (count) => `共 ${count} 条`,
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="阶段风险排行" variant="borderless" style={{ marginTop: 16 }}>
        <div
          style={{
            marginBottom: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
          }}
        >
          <Input
            allowClear
            value={phaseKeyword}
            onChange={(e) => setPhaseKeyword(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="搜索需求/阶段/负责人"
          />
          <Select
            value={phaseStatusFilter}
            onChange={(value) => setPhaseStatusFilter(value)}
            options={[
              { label: '全部状态', value: 'ALL' },
              { label: '待开始', value: 'TODO' },
              { label: '进行中', value: 'IN_PROGRESS' },
            ]}
          />
          <Select
            value={phaseRiskFilter}
            onChange={(value) => setPhaseRiskFilter(value)}
            options={[
              { label: '仅风险项', value: 'RISK_ONLY' },
              { label: '全部项', value: 'ALL' },
              { label: '仅健康项', value: 'SAFE_ONLY' },
            ]}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Space wrap>
            <Tag color="red">风险阶段 {phaseRiskSummary.risk}</Tag>
            <Tag color="green">健康阶段 {phaseRiskSummary.safe}</Tag>
            <Tag>筛选后 {filteredPhaseRisks.length}</Tag>
          </Space>
        </div>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <Table
            rowKey={(row) => `${row.demand_id}_${row.phase_key}`}
            loading={loading}
            columns={phaseRiskColumns}
            dataSource={filteredPhaseRisks}
            size="middle"
            scroll={{ x: 1540 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (count) => `共 ${count} 条`,
            }}
          />
        </div>
      </Card>
    </div>
  )
}

export default OwnerWorkbench
