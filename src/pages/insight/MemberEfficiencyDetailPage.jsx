import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getMemberEfficiencyDetailApi } from '../../api/work'
import { formatBeijingDate } from '../../utils/datetime'
import WorkTypeDistributionChart from './components/WorkTypeDistributionChart'
import './EfficiencyDetailPages.css'

const { RangePicker } = DatePicker
const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function getDefaultDateRange() {
  return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')]
}

function toDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = dayjs(text, 'YYYY-MM-DD', true)
  return parsed.isValid() ? parsed : null
}

function downloadCsv(filename, rows = []) {
  const content = rows.map((columns) => columns.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function getLogStatusTag(status) {
  if (status === 'DONE') return <Tag color="success">已完成</Tag>
  if (status === 'TODO') return <Tag color="default">待开始</Tag>
  return <Tag color="processing">进行中</Tag>
}

function MemberEfficiencyDetailPage() {
  const navigate = useNavigate()
  const { userId: routeUserId } = useParams()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState()
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [data, setData] = useState({
    summary: {
      username: '-',
      department_name: '-',
      job_level_name: '-',
      filled_days: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      avg_actual_hours_per_day: 0,
    },
    work_type_distribution: [],
    demand_summary_list: [],
    work_item_list: [],
    trend: [],
    phase_distribution: [],
  })

  useEffect(() => {
    const startDate = toDateValue(searchParams.get('start_date'))
    const endDate = toDateValue(searchParams.get('end_date'))
    setDateRange(startDate && endDate && !startDate.isAfter(endDate) ? [startDate, endDate] : getDefaultDateRange())
    setUserId(toPositiveInt(routeUserId) || undefined)
  }, [routeUserId, searchParams])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const result = await getMemberEfficiencyDetailApi({
        user_id: userId,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
      })
      if (!result?.success) {
        message.error(result?.message || '获取个人人效详情失败')
        return
      }
      setData(result.data || {})
    } catch (error) {
      message.error(error?.message || '获取个人人效详情失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, userId])

  useEffect(() => {
    if (!userId) return
    loadData()
  }, [loadData, userId])

  const navigateWithState = useCallback(
    (nextRange = dateRange) => {
      if (!userId) return
      const params = new URLSearchParams()
      if (nextRange?.[0]) params.set('start_date', nextRange[0].format('YYYY-MM-DD'))
      if (nextRange?.[1]) params.set('end_date', nextRange[1].format('YYYY-MM-DD'))
      navigate(`/efficiency/member/${userId}/detail?${params.toString()}`)
    },
    [dateRange, navigate, userId],
  )

  const summary = data.summary || {}
  const demandSummaryList = Array.isArray(data.demand_summary_list) ? data.demand_summary_list : []
  const workItemList = Array.isArray(data.work_item_list) ? data.work_item_list : []
  const phaseDistribution = Array.isArray(data.phase_distribution) ? data.phase_distribution : []
  const totalPhaseHours = phaseDistribution.reduce((sum, item) => sum + toNumber(item.actual_hours, 0), 0)

  const handleExport = () => {
    if (workItemList.length === 0) {
      message.warning('当前没有可导出的事项明细')
      return
    }
    const rows = [
      ['日期', '事项类型', '事项状态', '关联需求', '阶段', 'Owner预估(h)', '个人预估(h)', '实际工时(h)', '描述'],
      ...workItemList.map((item) => [
        item.log_date || '-',
        item.item_type_name || '-',
        item.log_status || '-',
        item.demand_name || item.demand_id || '-',
        item.phase_name || item.phase_key || '-',
        toNumber(item.owner_estimate_hours, 0).toFixed(1),
        toNumber(item.personal_estimate_hours, 0).toFixed(1),
        toNumber(item.actual_hours, 0).toFixed(1),
        item.description || '-',
      ]),
    ]
    downloadCsv(`${summary.username || '成员'}-${data.filters?.start_date || ''}-${data.filters?.end_date || ''}.csv`, rows)
    message.success('导出成功')
  }

  const demandColumns = [
    {
      title: '需求',
      dataIndex: 'demand_name',
      key: 'demand_name',
      render: (value, row) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value || row.demand_id || '-'}</Text>
          <Text type="secondary">{row.demand_id || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '业务组',
      dataIndex: 'business_group_name',
      key: 'business_group_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '阶段数',
      dataIndex: 'phase_count',
      key: 'phase_count',
      width: 90,
    },
    {
      title: 'Owner预估(h)',
      dataIndex: 'total_owner_estimate_hours',
      key: 'total_owner_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      render: (value) => <Text strong>{toNumber(value, 0).toFixed(1)}</Text>,
    },
    {
      title: '偏差(h)',
      dataIndex: 'variance_personal_hours',
      key: 'variance_personal_hours',
      width: 100,
      render: (value) => {
        const num = toNumber(value, 0)
        const color = num > 0 ? '#d92d20' : num < 0 ? '#1570ef' : '#98a2b3'
        return <span style={{ color, fontWeight: 600 }}>{num.toFixed(1)}</span>
      },
    },
    {
      title: '最近填报',
      dataIndex: 'last_log_date',
      key: 'last_log_date',
      width: 120,
      render: (value) => formatBeijingDate(value),
    },
  ]

  const workItemColumns = [
    {
      title: '日期',
      dataIndex: 'log_date',
      key: 'log_date',
      width: 110,
      render: (value) => formatBeijingDate(value),
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'log_status',
      key: 'log_status',
      width: 100,
      render: (value) => getLogStatusTag(value),
    },
    {
      title: '关联需求',
      key: 'demand',
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{row.demand_name || '-'}</Text>
          <Text type="secondary">{row.phase_name || row.phase_key || '未分阶段'}</Text>
        </Space>
      ),
    },
    {
      title: 'Owner预估(h)',
      dataIndex: 'owner_estimate_hours',
      key: 'owner_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 120,
      render: (value) => <Text strong>{toNumber(value, 0).toFixed(1)}</Text>,
    },
    {
      title: '排期',
      key: 'schedule',
      width: 200,
      render: (_, row) => `${row.expected_start_date || '-'} ~ ${row.expected_completion_date || '-'}`,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ]

  const summaryItems = [
    { label: 'Owner 预估总工时(h)', value: toNumber(summary.total_owner_estimate_hours, 0).toFixed(1), note: '按 Owner 预估口径汇总' },
    { label: '个人预估总工时(h)', value: toNumber(summary.total_personal_estimate_hours, 0).toFixed(1), note: '当前成员个人预估总和' },
    { label: '实际总工时(h)', value: toNumber(summary.total_actual_hours, 0).toFixed(1), note: '当前周期事项实际投入汇总' },
    { label: '填报天数', value: toNumber(summary.filled_days, 0), note: '当前周期产生有效记录的日期数' },
    { label: '日均实际工时(h)', value: toNumber(summary.avg_actual_hours_per_day, 0).toFixed(1), note: '实际总工时 / 有效填报天数' },
    { label: '净效率值', value: '-', note: '预留指标位，后续接入新口径' },
  ]

  return (
    <div className="efficiency-detail-page">
      <div className="efficiency-detail-page__layout">
        <Card variant="borderless" className="efficiency-detail-hero">
          <div className="efficiency-detail-hero__row">
            <div className="efficiency-detail-hero__main">
              <span className="efficiency-detail-hero__eyebrow">个人人效详情</span>
              <div className="efficiency-detail-hero__title">{summary.username || '个人人效详情'}</div>
              <div className="efficiency-detail-hero__subtitle">
                聚焦成员在当前周期内的需求投入、工作类型结构与事项执行明细，便于从整体投入快速下钻到具体工作。
              </div>
              <div className="efficiency-detail-hero__meta">
                <span className="efficiency-detail-meta-pill">部门：{summary.department_name || '-'}</span>
                <span className="efficiency-detail-meta-pill">职级：{summary.job_level_name || summary.job_level || '-'}</span>
                <span className="efficiency-detail-meta-pill">时间范围：{data.filters?.start_date || '-'} ~ {data.filters?.end_date || '-'}</span>
              </div>
            </div>
            <div className="efficiency-detail-hero__actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/efficiency/member')}>返回成员洞察</Button>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>刷新</Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </div>
          </div>
          <div className="efficiency-detail-toolbar">
            <RangePicker
              allowClear={false}
              value={dateRange}
              onChange={(values) => {
                const nextRange = values && values.length === 2 ? values : getDefaultDateRange()
                setDateRange(nextRange)
                navigateWithState(nextRange)
              }}
            />
            <span className="efficiency-detail-toolbar__hint">切换统计周期后，将同步刷新需求汇总与事项明细。</span>
          </div>
        </Card>

        <Row gutter={[16, 16]} className="efficiency-summary-grid">
          {summaryItems.map((item) => (
            <Col xs={24} sm={12} xl={8} key={item.label}>
              <div className="efficiency-summary-card">
                <div className="efficiency-summary-card__label">{item.label}</div>
                <div className="efficiency-summary-card__value">{item.value}</div>
                <div className="efficiency-summary-card__note">{item.note}</div>
              </div>
            </Col>
          ))}
        </Row>

        {!userId ? (
          <Card variant="borderless" className="efficiency-detail-card">
            <Empty description="当前成员不存在或尚未选择成员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Card>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={14}>
                <Card variant="borderless" className="efficiency-detail-section">
                  <WorkTypeDistributionChart data={data.work_type_distribution} loading={loading} />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card title="阶段分布" variant="borderless" className="efficiency-detail-section">
                  <div className="efficiency-insight-stack">
                    <div className="efficiency-phase-summary">
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">阶段数</div>
                        <div className="efficiency-phase-summary__value">{phaseDistribution.length}</div>
                      </div>
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">阶段总工时(h)</div>
                        <div className="efficiency-phase-summary__value">{toNumber(totalPhaseHours, 0).toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="efficiency-insight-block">
                      <div className="efficiency-insight-block__title">主要投入阶段</div>
                      <div className="efficiency-insight-block__subtle">按实际工时倒序展示当前周期内的阶段分布</div>
                      <div className="efficiency-note-row">
                        {phaseDistribution.slice(0, 10).map((item) => (
                          <span key={`${item.phase_key || 'none'}-${item.phase_name}`} className="efficiency-note-chip">
                            {`${item.phase_name} · ${toNumber(item.actual_hours, 0).toFixed(1)}h`}
                          </span>
                        ))}
                        {phaseDistribution.length === 0 ? <Text type="secondary">当前范围暂无阶段分布</Text> : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            <Card
              title="需求汇总"
              extra={<span className="efficiency-detail-toolbar__hint">按当前成员在需求上的累计投入汇总</span>}
              variant="borderless"
              className="efficiency-detail-section"
            >
              <Table
                rowKey="demand_id"
                loading={loading}
                columns={demandColumns}
                dataSource={demandSummaryList}
                size="small"
                className="efficiency-detail-table"
                scroll={{ x: 1080 }}
                pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条需求` }}
                locale={{ emptyText: '当前范围暂无需求汇总数据' }}
              />
            </Card>

            <Card
              title="事项明细"
              extra={<span className="efficiency-detail-toolbar__hint">保留事项级口径，便于核对阶段、排期与实际投入</span>}
              variant="borderless"
              className="efficiency-detail-section"
            >
              <Table
                rowKey="log_id"
                loading={loading}
                columns={workItemColumns}
                dataSource={workItemList}
                size="small"
                className="efficiency-detail-table"
                scroll={{ x: 1500 }}
                pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 条事项` }}
                locale={{ emptyText: '当前范围暂无事项明细' }}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default MemberEfficiencyDetailPage
