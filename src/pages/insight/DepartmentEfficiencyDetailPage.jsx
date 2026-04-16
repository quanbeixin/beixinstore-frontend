import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  DownloadOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getDepartmentEfficiencyDetailApi, getInsightFilterOptionsApi } from '../../api/work'
import { getAccessSnapshot } from '../../utils/access'
import { formatBeijingDate } from '../../utils/datetime'
import WorkTypeDistributionChart from './components/WorkTypeDistributionChart'
import './EfficiencyDetailPages.css'

const { RangePicker } = DatePicker
const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatNetEfficiencyValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toFixed(2)
}

function getNetEfficiencyTextColor(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '#344054'
  if (num > 8) return '#d92d20'
  if (num > 2) return '#f04438'
  if (num >= -2) return '#344054'
  if (num >= -8) return '#039855'
  return '#0f766e'
}

function formatHours(value) {
  return toNumber(value, 0).toFixed(1)
}

function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${num.toFixed(2)}%`
}

function getVarianceTextColor(value, mode = 'owner') {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '#344054'
  const palette =
    mode === 'personal'
      ? {
          severePositive: '#e35d6a',
          mildPositive: '#f38744',
          neutral: '#344054',
          mildNegative: '#12a36b',
          severeNegative: '#17807a',
        }
      : {
          severePositive: '#d92d20',
          mildPositive: '#f04438',
          neutral: '#344054',
          mildNegative: '#039855',
          severeNegative: '#0f766e',
        }
  if (num > 4) return palette.severePositive
  if (num > 1) return palette.mildPositive
  if (num >= -1) return palette.neutral
  if (num >= -4) return palette.mildNegative
  return palette.severeNegative
}

function getComparableTagColor(covered, required) {
  const coveredCount = toNumber(covered, 0)
  const requiredCount = toNumber(required, 0)
  if (requiredCount <= 0) return 'default'
  const rate = coveredCount / requiredCount
  if (rate >= 1) return 'success'
  if (rate >= 0.5) return 'warning'
  return 'error'
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

function DepartmentEfficiencyDetailPage() {
  const navigate = useNavigate()
  const { departmentId: routeDepartmentId } = useParams()
  const [searchParams] = useSearchParams()
  const access = useMemo(() => getAccessSnapshot() || {}, [])

  const [loading, setLoading] = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)
  const [departmentId, setDepartmentId] = useState()
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [filters, setFilters] = useState({ departments: [] })
  const [data, setData] = useState({
    summary: {
      department_name: '-',
      member_count: 0,
      total_item_count: 0,
      total_owner_required_item_count: 0,
      total_owner_estimate_covered_item_count: 0,
      total_owner_estimate_missing_item_count: 0,
      total_owner_estimate_non_owner_item_count: 0,
      owner_estimate_coverage_rate: 0,
      total_owner_baseline_hours: 0,
      total_owner_comparable_actual_hours: 0,
      variance_owner_baseline_hours: 0,
      total_personal_estimate_item_count: 0,
      personal_estimate_coverage_rate: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      avg_actual_hours_per_member: 0,
      variance_owner_hours: 0,
      variance_personal_hours: 0,
    },
    work_type_distribution: [],
    member_ranking: [],
    demand_top_list: [],
    trend: [],
    alerts: {
      high_load_members: [],
      low_load_members: [],
      high_variance_demands: [],
    },
  })

  const managedDepartmentIds = useMemo(
    () =>
      Array.isArray(access?.managed_department_ids)
        ? access.managed_department_ids.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
        : [],
    [access],
  )
  const canViewAllDepartments = Boolean(access?.is_super_admin) || Boolean((access?.role_keys || []).includes('ADMIN'))

  useEffect(() => {
    const startDate = toDateValue(searchParams.get('start_date'))
    const endDate = toDateValue(searchParams.get('end_date'))
    setDateRange(startDate && endDate && !startDate.isAfter(endDate) ? [startDate, endDate] : getDefaultDateRange())
    setDepartmentId(toPositiveInt(routeDepartmentId) || undefined)
  }, [routeDepartmentId, searchParams])

  const departmentOptions = useMemo(() => {
    const rows = Array.isArray(filters.departments) ? filters.departments : []
    const mapped = rows.map((item) => ({ value: item.id, label: item.name }))
    if (canViewAllDepartments) return mapped
    const managedSet = new Set(managedDepartmentIds)
    return mapped.filter((item) => managedSet.has(Number(item.value)))
  }, [canViewAllDepartments, filters.departments, managedDepartmentIds])

  const navigateWithState = useCallback(
    (nextDepartmentId, nextRange = dateRange) => {
      if (!nextDepartmentId) return
      const params = new URLSearchParams()
      if (nextRange?.[0]) params.set('start_date', nextRange[0].format('YYYY-MM-DD'))
      if (nextRange?.[1]) params.set('end_date', nextRange[1].format('YYYY-MM-DD'))
      navigate(`/efficiency/department/${nextDepartmentId}/detail?${params.toString()}`)
    },
    [dateRange, navigate],
  )

  const loadFilters = useCallback(async () => {
    setFilterLoading(true)
    try {
      const result = await getInsightFilterOptionsApi()
      if (!result?.success) {
        message.error(result?.message || '获取筛选项失败')
        return
      }
      setFilters(result.data || { departments: [] })
    } catch (error) {
      message.error(error?.message || '获取筛选项失败')
    } finally {
      setFilterLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    if (departmentId) return
    if (departmentOptions.length === 0) return
    navigateWithState(departmentOptions[0].value, dateRange)
  }, [dateRange, departmentId, departmentOptions, navigateWithState])

  const loadData = useCallback(async () => {
    if (!departmentId) return
    setLoading(true)
    try {
      const result = await getDepartmentEfficiencyDetailApi({
        department_id: departmentId,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
      })
      if (!result?.success) {
        message.error(result?.message || '获取部门人效详情失败')
        return
      }
      setData(result.data || {})
    } catch (error) {
      message.error(error?.message || '获取部门人效详情失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, departmentId])

  useEffect(() => {
    if (!departmentId) return
    loadData()
  }, [departmentId, loadData])

  const summary = data.summary || {}
  const memberRanking = Array.isArray(data.member_ranking) ? data.member_ranking : []
  const demandTopList = Array.isArray(data.demand_top_list) ? data.demand_top_list : []
  const alerts = data.alerts || {}

  const renderComparableCell = useCallback((row) => {
    const covered = toNumber(row?.owner_estimate_covered_item_count, 0)
    const required = toNumber(row?.owner_required_item_count, 0)
    const missing = toNumber(row?.owner_estimate_missing_item_count, 0)
    const nonOwner = toNumber(row?.owner_estimate_non_owner_item_count, 0)
    return (
      <Tooltip
        title={
          <Space direction="vertical" size={2}>
            <span>{`可比事项：${covered} 个`}</span>
            <span>{`应评估事项：${required} 个`}</span>
            <span>{`缺失评估：${missing} 个`}</span>
            <span>{`非 Owner 事项：${nonOwner} 个`}</span>
          </Space>
        }
      >
        <Space size={6}>
          <Text strong>{`${covered}/${required}`}</Text>
          {required > 0 ? <Tag color={getComparableTagColor(covered, required)}>{required === covered ? '完整' : `缺 ${missing}`}</Tag> : null}
        </Space>
      </Tooltip>
    )
  }, [])

  const renderVarianceValue = useCallback((value, mode = 'owner') => (
    <Text style={{ color: getVarianceTextColor(value, mode) }}>
      {Number(value) > 0 ? '+' : ''}
      {formatHours(value)}
    </Text>
  ), [])

  const handleExport = () => {
    if (memberRanking.length === 0) {
      message.warning('当前没有可导出的部门排行数据')
      return
    }
    const rows = [
      ['排名', '成员', '职级', '事项数', '可比/应评估', 'Owner评估覆盖率', 'Owner真实基线(h)', 'Owner可比实际(h)', 'Owner偏差(h)', '个人预估(h)', '实际工时(h)', '个人偏差(h)', '净效率值', '趋势', '最近填报'],
      ...memberRanking.map((item) => [
        item.rank,
        item.username || '-',
        item.job_level_name || item.job_level || '-',
        toNumber(item.item_count, 0),
        `${toNumber(item.owner_estimate_covered_item_count, 0)}/${toNumber(item.owner_required_item_count, 0)}`,
        formatPercent(item.owner_estimate_coverage_rate),
        formatHours(item.total_owner_baseline_hours),
        formatHours(item.total_owner_comparable_actual_hours),
        formatHours(item.variance_owner_baseline_hours),
        formatHours(item.total_personal_estimate_hours),
        formatHours(item.total_actual_hours),
        formatHours(item.variance_personal_hours),
        formatNetEfficiencyValue(item.net_efficiency_value),
        item.trend_direction === 'UP' ? '上升' : item.trend_direction === 'DOWN' ? '下降' : '持平',
        item.last_log_date || '-',
      ]),
    ]
    downloadCsv(`${summary.department_name || '部门'}-${data.filters?.start_date || ''}-${data.filters?.end_date || ''}.csv`, rows)
    message.success('导出成功')
  }

  const goMemberDetail = (userId) => {
    if (!userId) return
    const params = new URLSearchParams()
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    window.open(`/efficiency/member/${userId}/detail?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const memberColumns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '成员',
      key: 'username',
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Button type="link" className="efficiency-table-link" onClick={() => goMemberDetail(row.user_id)}>
            {row.username || '-'}
          </Button>
          <Space size={6}>
            <Tag color="blue">#{row.user_id}</Tag>
            <Tag color="processing">{row.job_level_name || row.job_level || '-'}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '事项数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      render: (value) => toNumber(value, 0),
    },
    {
      title: '可比/应评估',
      key: 'owner_comparable_ratio',
      width: 150,
      render: (_, row) => renderComparableCell(row),
    },
    {
      title: (
        <Space size={4}>
          <span>Owner评估覆盖率</span>
          <Tooltip title="只统计应由 Owner 评估的事项；可比事项才进入真实分析口径">
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'owner_estimate_coverage_rate',
      key: 'owner_estimate_coverage_rate',
      width: 150,
      render: (value) => formatPercent(value),
    },
    {
      title: 'Owner真实基线(h)',
      dataIndex: 'total_owner_baseline_hours',
      key: 'total_owner_baseline_hours',
      width: 120,
      render: (value) => formatHours(value),
    },
    {
      title: 'Owner可比实际(h)',
      dataIndex: 'total_owner_comparable_actual_hours',
      key: 'total_owner_comparable_actual_hours',
      width: 120,
      render: (value) => <Text strong>{formatHours(value)}</Text>,
    },
    {
      title: 'Owner偏差(h)',
      dataIndex: 'variance_owner_baseline_hours',
      key: 'variance_owner_baseline_hours',
      width: 120,
      render: (value) => renderVarianceValue(value, 'owner'),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 120,
      render: (value) => formatHours(value),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      render: (value) => <Text strong>{formatHours(value)}</Text>,
    },
    {
      title: '个人偏差(h)',
      dataIndex: 'variance_personal_hours',
      key: 'variance_personal_hours',
      width: 120,
      render: (value) => renderVarianceValue(value, 'personal'),
    },
    {
      title: '净效率值',
      dataIndex: 'net_efficiency_value',
      key: 'net_efficiency_value',
      width: 110,
      render: (value) =>
        value === null || value === undefined ? (
          <Text type="secondary">-</Text>
        ) : (
          <Text strong style={{ color: getNetEfficiencyTextColor(value) }}>
            {formatNetEfficiencyValue(value)}
          </Text>
        ),
    },
    {
      title: '趋势',
      key: 'trend',
      width: 120,
      render: (_, row) => {
        const delta = toNumber(row.trend_delta_actual_hours, 0).toFixed(1)
        if (row.trend_direction === 'UP') {
          return <Tag color="error" icon={<ArrowUpOutlined />}>{`+${delta}h`}</Tag>
        }
        if (row.trend_direction === 'DOWN') {
          return <Tag color="processing" icon={<ArrowDownOutlined />}>{`${delta}h`}</Tag>
        }
        return <Tag icon={<MinusOutlined />}>持平</Tag>
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

  const demandColumns = [
    {
      title: '需求',
      dataIndex: 'demand_name',
      key: 'demand_name',
      width: 240,
      render: (value, row) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value || row.demand_id || '-'}</Text>
          <Text type="secondary">{`${row.demand_id || '-'} · ${row.business_group_name || '-'}`}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '事项数',
      dataIndex: 'total_item_count',
      key: 'total_item_count',
      width: 90,
      render: (value) => toNumber(value, 0),
    },
    {
      title: '参与人数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 90,
    },
    {
      title: '可比/应评估',
      key: 'owner_comparable_ratio',
      width: 150,
      render: (_, row) => renderComparableCell(row),
    },
    {
      title: 'Owner评估覆盖率',
      dataIndex: 'owner_estimate_coverage_rate',
      key: 'owner_estimate_coverage_rate',
      width: 150,
      render: (value) => formatPercent(value),
    },
    {
      title: 'Owner真实基线(h)',
      dataIndex: 'total_owner_baseline_hours',
      key: 'total_owner_baseline_hours',
      width: 120,
      render: (value) => formatHours(value),
    },
    {
      title: 'Owner可比实际(h)',
      dataIndex: 'total_owner_comparable_actual_hours',
      key: 'total_owner_comparable_actual_hours',
      width: 130,
      render: (value) => <Text strong>{formatHours(value)}</Text>,
    },
    {
      title: 'Owner偏差(h)',
      dataIndex: 'variance_owner_baseline_hours',
      key: 'variance_owner_baseline_hours',
      width: 120,
      render: (value) => renderVarianceValue(value, 'owner'),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 120,
      render: (value) => formatHours(value),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      render: (value) => <Text strong>{formatHours(value)}</Text>,
    },
    {
      title: '个人偏差(h)',
      dataIndex: 'variance_personal_hours',
      key: 'variance_personal_hours',
      width: 120,
      render: (value) => renderVarianceValue(value, 'personal'),
    },
    {
      title: '最近填报',
      dataIndex: 'last_log_date',
      key: 'last_log_date',
      width: 120,
      render: (value) => formatBeijingDate(value),
    },
  ]

  const summaryItems = [
    { label: '部门人数', value: toNumber(summary.member_count, 0), note: '当前范围内纳入统计的有效成员' },
    { label: '事项数', value: toNumber(summary.total_item_count, 0), note: '当前周期内全部事项总数，已与排行页、个人人效详情页口径对齐' },
    { label: '可比/应评估', valueNode: renderComparableCell(summary), note: 'Owner 真实分析先看这一项，缺评估会直接暴露出来' },
    { label: 'Owner评估覆盖率', value: formatPercent(summary.owner_estimate_coverage_rate), note: '只统计应由 Owner 评估的事项；非 Owner 事项不计入分母' },
    { label: 'Owner真实基线(h)', value: formatHours(summary.total_owner_baseline_hours), note: '只累计存在真实 Owner 评估值的事项' },
    { label: 'Owner可比实际(h)', value: formatHours(summary.total_owner_comparable_actual_hours), note: '只累计进入 Owner 可比口径的实际工时' },
    { label: 'Owner偏差(h)', valueNode: renderVarianceValue(summary.variance_owner_baseline_hours, 'owner'), note: 'Owner偏差 = Owner可比实际 - Owner真实基线' },
    { label: '个人预估覆盖率', value: formatPercent(summary.personal_estimate_coverage_rate), note: '当前周期事项中，已填写个人预估的覆盖情况' },
    { label: '个人预估总工时(h)', value: formatHours(summary.total_personal_estimate_hours), note: '成员个人预估总和' },
    { label: '实际总工时(h)', value: formatHours(summary.total_actual_hours), note: '当前周期内实际投入汇总' },
    { label: '个人偏差(h)', valueNode: renderVarianceValue(summary.variance_personal_hours, 'personal'), note: '个人偏差 = 实际工时 - 个人预估工时' },
    { label: '人均实际工时(h)', value: toNumber(summary.avg_actual_hours_per_member, 0).toFixed(1), note: '实际总工时 / 成员人数' },
    {
      label: '净效率值',
      valueNode:
        summary.net_efficiency_value === null || summary.net_efficiency_value === undefined ? (
          '-'
        ) : (
          <span style={{ color: getNetEfficiencyTextColor(summary.net_efficiency_value) }}>
            {formatNetEfficiencyValue(summary.net_efficiency_value)}
          </span>
        ),
      note: `当前按公式口径计算，任务难度系数 ${toNumber(summary.task_difficulty_coefficient, 1).toFixed(2)}，职级权重系数 ${toNumber(summary.job_level_weight_coefficient, 1).toFixed(2)}`,
    },
  ]

  return (
    <div className="efficiency-detail-page">
      <div className="efficiency-detail-page__layout">
        <Card variant="borderless" className="efficiency-detail-hero">
          <div className="efficiency-detail-hero__row">
            <div className="efficiency-detail-hero__main">
              <span className="efficiency-detail-hero__eyebrow">部门人效详情</span>
              <div className="efficiency-detail-hero__title">{summary.department_name || '部门人效详情'}</div>
              <div className="efficiency-detail-hero__subtitle">
                聚焦部门在当前周期内全部事项的可比/应评估、Owner真实基线与偏差表现，便于从团队视角统一判断资源质量与投入节奏。
              </div>
              <div className="efficiency-detail-hero__meta">
                <span className="efficiency-detail-meta-pill">时间范围：{data.filters?.start_date || '-'} ~ {data.filters?.end_date || '-'}</span>
                <span className="efficiency-detail-meta-pill">成员数：{toNumber(summary.member_count, 0)}</span>
                <span className="efficiency-detail-meta-pill">高负载成员：{toNumber(alerts.high_load_members?.length, 0)}</span>
              </div>
            </div>
            <div className="efficiency-detail-hero__actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/efficiency/department-ranking')}>返回排行</Button>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>刷新</Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </div>
          </div>
          <div className="efficiency-detail-toolbar">
            <Select
              allowClear={false}
              loading={filterLoading}
              style={{ width: 240 }}
              placeholder="选择部门"
              options={departmentOptions}
              value={departmentId}
              onChange={(value) => navigateWithState(value, dateRange)}
            />
            <RangePicker
              allowClear={false}
              value={dateRange}
              onChange={(values) => {
                const nextRange = values && values.length === 2 ? values : getDefaultDateRange()
                setDateRange(nextRange)
                if (departmentId) navigateWithState(departmentId, nextRange)
              }}
            />
            <span className="efficiency-detail-toolbar__hint">支持直接切换部门与统计周期，页面会同步刷新；当前口径已与部门排行页、个人人效详情页统一。</span>
          </div>
        </Card>

        <Row gutter={[16, 16]} className="efficiency-summary-grid">
          {summaryItems.map((item) => (
            <Col xs={24} sm={12} xl={8} key={item.label}>
              <div className="efficiency-summary-card">
                <div className="efficiency-summary-card__label">{item.label}</div>
                <div className="efficiency-summary-card__value">{item.valueNode || item.value}</div>
                <div className="efficiency-summary-card__note">{item.note}</div>
              </div>
            </Col>
          ))}
        </Row>

        {!departmentId ? (
          <Card variant="borderless" className="efficiency-detail-card">
            <Empty description="请先选择部门后查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Card>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={15}>
                <Card variant="borderless" className="efficiency-detail-section">
                  <WorkTypeDistributionChart data={data.work_type_distribution} loading={loading} />
                </Card>
              </Col>
              <Col xs={24} xl={9}>
                <Card title="管理提示" variant="borderless" className="efficiency-detail-section">
                  <div className="efficiency-insight-stack">
                    <div className="efficiency-phase-summary">
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">高负载成员</div>
                        <div className="efficiency-phase-summary__value">{toNumber(alerts.high_load_members?.length, 0)}</div>
                      </div>
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">低负载成员</div>
                        <div className="efficiency-phase-summary__value">{toNumber(alerts.low_load_members?.length, 0)}</div>
                      </div>
                    </div>
                    <div className="efficiency-insight-block">
                      <div className="efficiency-insight-block__title">高负载成员</div>
                      <div className="efficiency-insight-block__subtle">优先关注持续超 100% 饱和度的成员</div>
                      <div className="efficiency-note-row">
                        {(alerts.high_load_members || []).slice(0, 6).map((item) => (
                          <span className="efficiency-note-chip" key={`high-${item.user_id}`}>{`${item.username} · ${toNumber(item.avg_saturation_rate, 0).toFixed(1)}%`}</span>
                        ))}
                        {toNumber(alerts.high_load_members?.length, 0) === 0 ? <Text type="secondary">当前暂无高负载成员</Text> : null}
                      </div>
                    </div>
                    <div className="efficiency-insight-block">
                      <div className="efficiency-insight-block__title">低负载成员</div>
                      <div className="efficiency-insight-block__subtle">适合承接新增事项或补位协作</div>
                      <div className="efficiency-note-row">
                        {(alerts.low_load_members || []).slice(0, 6).map((item) => (
                          <span className="efficiency-note-chip" key={`low-${item.user_id}`}>{`${item.username} · ${toNumber(item.avg_saturation_rate, 0).toFixed(1)}%`}</span>
                        ))}
                        {toNumber(alerts.low_load_members?.length, 0) === 0 ? <Text type="secondary">当前暂无低负载成员</Text> : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            <Card
              title="成员排行"
              extra={<span className="efficiency-detail-toolbar__hint">点击成员可继续下钻到个人人效详情</span>}
              variant="borderless"
              className="efficiency-detail-section"
            >
              <Table
                rowKey="user_id"
                loading={loading}
                columns={memberColumns}
                dataSource={memberRanking}
                size="small"
                className="efficiency-detail-table"
                scroll={{ x: 1560 }}
                pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 位成员` }}
                locale={{ emptyText: '当前范围暂无成员排行数据' }}
              />
            </Card>

            <Card
              title="需求投入 Top"
              extra={<span className="efficiency-detail-toolbar__hint">按实际工时排序，帮助快速锁定主要占用需求</span>}
              variant="borderless"
              className="efficiency-detail-section"
            >
              <Table
                rowKey="demand_id"
                loading={loading}
                columns={demandColumns}
                dataSource={demandTopList}
                size="small"
                className="efficiency-detail-table"
                scroll={{ x: 1800 }}
                pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条需求` }}
                locale={{ emptyText: '当前范围暂无需求投入数据' }}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default DepartmentEfficiencyDetailPage
