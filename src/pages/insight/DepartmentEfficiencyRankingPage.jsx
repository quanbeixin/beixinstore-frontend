import {
  DownloadOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDepartmentEfficiencyRankingApi, getInsightFilterOptionsApi } from '../../api/work'
import { getAccessSnapshot } from '../../utils/access'
import { formatBeijingDate } from '../../utils/datetime'

const { RangePicker } = DatePicker
const { Text } = Typography
const ALL_DEPARTMENTS_VALUE = '__ALL__'

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
  if (num > 8) return '#0f766e'
  if (num > 2) return '#039855'
  if (num <= -8) return '#d92d20'
  if (num < -2) return '#f04438'
  return '#344054'
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
  if (!Number.isFinite(num) || num === 0) return undefined
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

function getThisWeekRange() {
  const today = dayjs()
  const day = today.day()
  const start = today.subtract(day === 0 ? 6 : day - 1, 'day')
  return [start.startOf('day'), today.endOf('day')]
}

function getThisMonthRange() {
  const today = dayjs()
  return [today.startOf('month'), today.endOf('day')]
}

function getDefaultCustomRange() {
  const yesterday = dayjs().subtract(1, 'day')
  return [yesterday.startOf('day'), yesterday.endOf('day')]
}

function buildCsvContent(rows = []) {
  const headers = [
    '排名',
    '员工姓名',
    '职级',
    '事项数',
    '可比/应评估',
    'Owner评估覆盖率',
    'Owner真实基线(h)',
    '个人预估总工时(h)',
    '实际总工时(h)',
    'Owner偏差(h)',
    '个人偏差(h)',
    '净效率值',
    '最近填报日期',
  ]
  const csvRows = rows.map((row) => [
    row.rank,
    row.username || '-',
    row.job_level_name || row.job_level || '-',
    toNumber(row.item_count, 0),
    `${toNumber(row.owner_estimate_covered_item_count, 0)}/${toNumber(row.owner_required_item_count, 0)}`,
    formatPercent(row.owner_estimate_coverage_rate),
    formatHours(row.total_owner_baseline_hours),
    formatHours(row.total_personal_estimate_hours),
    formatHours(row.total_actual_hours),
    formatHours(row.variance_owner_baseline_hours),
    formatHours(row.variance_personal_hours),
    row.net_efficiency_value === null || row.net_efficiency_value === undefined ? '-' : row.net_efficiency_value,
    row.last_log_date || '-',
  ])

  return [headers, ...csvRows]
    .map((columns) => columns.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n')
}

function downloadCsv(filename, content) {
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

function DepartmentEfficiencyRankingPage() {
  const navigate = useNavigate()
  const access = useMemo(() => getAccessSnapshot() || {}, [])
  const managedDepartmentIds = useMemo(
    () =>
      Array.isArray(access?.managed_department_ids)
        ? access.managed_department_ids
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0)
        : [],
    [access],
  )
  const canViewAllDepartments = Boolean(access?.is_super_admin) || Boolean((access?.role_keys || []).includes('ADMIN'))

  const [loading, setLoading] = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)
  const [periodType, setPeriodType] = useState('custom')
  const [dateRange, setDateRange] = useState(getDefaultCustomRange)
  const [departmentId, setDepartmentId] = useState(ALL_DEPARTMENTS_VALUE)
  const [keyword, setKeyword] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [filters, setFilters] = useState({ departments: [] })
  const [data, setData] = useState({
    summary: {
      department_id: null,
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
      avg_actual_hours: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      net_efficiency_value: null,
      net_efficiency_formula_text: '',
    },
    rows: [],
    filters: {},
  })

  const departmentOptions = useMemo(() => {
    const baseOptions = (filters.departments || []).map((item) => ({
      value: item.id,
      label: item.name,
    }))
    const visibleOptions = canViewAllDepartments
      ? baseOptions
      : (() => {
          const managedSet = new Set(managedDepartmentIds)
          return baseOptions.filter((item) => managedSet.has(Number(item.value)))
        })()
    if (visibleOptions.length === 0) return []
    return [{ value: ALL_DEPARTMENTS_VALUE, label: '全部' }, ...visibleOptions]
  }, [canViewAllDepartments, filters.departments, managedDepartmentIds])

  const selectedDepartmentId = useMemo(() => {
    const id = Number(departmentId)
    return Number.isInteger(id) && id > 0 ? id : null
  }, [departmentId])
  const isAllDepartmentsSelected = departmentId === ALL_DEPARTMENTS_VALUE

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
    if (departmentId === ALL_DEPARTMENTS_VALUE || selectedDepartmentId) return
    if (departmentOptions.length === 0) return
    if (departmentOptions.some((item) => item.value === ALL_DEPARTMENTS_VALUE)) {
      setDepartmentId(ALL_DEPARTMENTS_VALUE)
      return
    }
    if (!canViewAllDepartments) {
      setDepartmentId(departmentOptions[0].value)
    }
  }, [canViewAllDepartments, departmentId, departmentOptions, selectedDepartmentId])

  const loadData = useCallback(async () => {
    if (!isAllDepartmentsSelected && !selectedDepartmentId) return
    setLoading(true)
    try {
      const result = await getDepartmentEfficiencyRankingApi({
        department_id: selectedDepartmentId || undefined,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
        keyword: String(keyword || '').trim() || undefined,
        sort_order: sortOrder,
        completed_only: false,
      })

      if (!result?.success) {
        message.error(result?.message || '获取部门人效排行失败')
        return
      }

      setData(result.data || { summary: {}, rows: [], filters: {} })
    } catch (error) {
      message.error(error?.message || '获取部门人效排行失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, isAllDepartmentsSelected, keyword, selectedDepartmentId, sortOrder])

  useEffect(() => {
    if (!isAllDepartmentsSelected && !selectedDepartmentId) return
    loadData()
  }, [isAllDepartmentsSelected, selectedDepartmentId, loadData])

  const handlePeriodChange = (value) => {
    setPeriodType(value)
    if (value === 'week') {
      setDateRange(getThisWeekRange())
      return
    }
    if (value === 'month') {
      setDateRange(getThisMonthRange())
      return
    }
    setDateRange(getDefaultCustomRange())
  }

  const handleExport = () => {
    const rows = Array.isArray(data.rows) ? data.rows : []
    if (rows.length === 0) {
      message.warning('当前没有可导出的数据')
      return
    }

    const departmentName = data.summary?.department_name || '部门人效排行'
    const startDate = data.filters?.start_date || dayjs().format('YYYY-MM-DD')
    const endDate = data.filters?.end_date || startDate
    downloadCsv(`${departmentName}-${startDate}-${endDate}.csv`, buildCsvContent(rows))
    message.success('导出成功')
  }

  const goMemberDetail = (row) => {
    if (!row?.user_id) return
    const params = new URLSearchParams()
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    window.open(`/efficiency/member/${row.user_id}/detail?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const goDepartmentDetail = () => {
    if (!selectedDepartmentId) return
    const params = new URLSearchParams()
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    navigate(`/efficiency/department/${selectedDepartmentId}/detail?${params.toString()}`)
  }

  const summary = data.summary || {}
  const rows = Array.isArray(data.rows) ? data.rows : []
  const summaryCardStyle = {
    borderRadius: 14,
    border: '1px solid #edf0f5',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
  }
  const summaryCardBodyStyle = {
    padding: '12px 14px',
  }
  const summaryStatisticStyles = {
    title: { fontSize: 12, color: '#667085', marginBottom: 6 },
    content: { fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: '#101828' },
  }
  const hoursSorter = (field) => (left, right) => toNumber(left?.[field], 0) - toNumber(right?.[field], 0)
  const countSorter = (field) => (left, right) => toNumber(left?.[field], 0) - toNumber(right?.[field], 0)
  const netEfficiencyFormulaTip = summary.net_efficiency_formula_text ? (
    <Space orientation="vertical" size={2}>
      <span>当前页统计范围：统计当前周期内全部事项</span>
      <span>当前默认按净效率值排序，可切换为从高到低或从低到高</span>
      <span>实际公式：实际总工时 = SUM(当前周期事项的 actual_hours)</span>
      <span>{`净效率值公式：${summary.net_efficiency_formula_text}`}</span>
      <span>当前口径下，正值表示低于 Owner 评估、节省工时；负值表示超出 Owner 评估、存在超时</span>
    </Space>
  ) : (
    '当前净效率值按已配置公式计算'
  )
  const ownerCoverageTip = (
    <Space orientation="vertical" size={2}>
      <span>只统计当前周期内需要 Owner 评估的事项。</span>
      <span>{`当前范围内需要 Owner 评估事项：${toNumber(summary.total_owner_required_item_count, 0)} 个`}</span>
      <span>{`可比事项：${toNumber(summary.total_owner_estimate_covered_item_count, 0)} 个`}</span>
      <span>{`缺失：${toNumber(summary.total_owner_estimate_missing_item_count, 0)} 个`}</span>
      <span>{`非 Owner 事项：${toNumber(summary.total_owner_estimate_non_owner_item_count, 0)} 个，不计入覆盖率分母`}</span>
    </Space>
  )
  const ownerBaselineTip = (
    <Space orientation="vertical" size={2}>
      <span>Owner真实基线只累计存在真实 Owner 评估值的事项。</span>
      <span>{`可比事项数：${toNumber(summary.total_owner_estimate_covered_item_count, 0)} 个`}</span>
      <span>{`真实基线：${formatHours(summary.total_owner_baseline_hours)} h`}</span>
      <span>{`Owner可比实际：${formatHours(summary.total_owner_comparable_actual_hours)} h`}</span>
      <span>{`Owner偏差：${formatHours(summary.variance_owner_baseline_hours)} h`}</span>
    </Space>
  )
  const personalCoverageTip = (
    <Space orientation="vertical" size={2}>
      <span>个人预估覆盖率按当前周期事项统计。</span>
      <span>{`当前周期事项：${toNumber(summary.total_item_count, 0)} 个`}</span>
      <span>{`存在个人预估：${toNumber(summary.total_personal_estimate_item_count, 0)} 个`}</span>
      <span>{`覆盖率：${formatPercent(summary.personal_estimate_coverage_rate)}`}</span>
    </Space>
  )

  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '员工姓名',
      key: 'username',
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Button type="link" style={{ paddingInline: 0, fontWeight: 600 }} onClick={() => goMemberDetail(row)}>
            {row.username || '-'}
          </Button>
          <Space size={6}>
            <Tag color="blue">#{row.user_id}</Tag>
            <Tag>{row.department_name || '-'}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '职级',
      dataIndex: 'job_level_name',
      key: 'job_level_name',
      width: 100,
      render: (_, row) => <Tag color="processing">{row.job_level_name || row.job_level || '-'}</Tag>,
    },
    {
      title: '事项数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 110,
      sorter: countSorter('item_count'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => toNumber(value, 0),
    },
    {
      title: '可比/应评估',
      key: 'owner_comparable_ratio',
      width: 150,
      sorter: (left, right) => {
        const leftCovered = toNumber(left?.owner_estimate_covered_item_count, 0)
        const rightCovered = toNumber(right?.owner_estimate_covered_item_count, 0)
        const leftRequired = toNumber(left?.owner_required_item_count, 0)
        const rightRequired = toNumber(right?.owner_required_item_count, 0)
        if (leftRequired !== rightRequired) return leftRequired - rightRequired
        return leftCovered - rightCovered
      },
      sortDirections: ['descend', 'ascend'],
      render: (_, row) => {
        const covered = toNumber(row.owner_estimate_covered_item_count, 0)
        const required = toNumber(row.owner_required_item_count, 0)
        return (
          <Tooltip
          title={
            <Space orientation="vertical" size={2}>
              <span>{`可比事项：${covered} 个`}</span>
              <span>{`应评估事项：${required} 个`}</span>
              <span>{`缺失评估：${toNumber(row.owner_estimate_missing_item_count, 0)} 个`}</span>
              <span>{`非 Owner 事项：${toNumber(row.owner_estimate_non_owner_item_count, 0)} 个`}</span>
            </Space>
          }
        >
          <Space size={6}>
            <Text strong>{`${covered}/${required}`}</Text>
            {toNumber(row.owner_estimate_missing_item_count, 0) > 0 ? (
              <Tag color="warning">缺 {toNumber(row.owner_estimate_missing_item_count, 0)}</Tag>
            ) : null}
          </Space>
        </Tooltip>
      )
    },
    },
    {
      title: (
        <Space size={4}>
          <span>Owner评估覆盖率</span>
          <Tooltip title="只统计需要 Owner 评估的事项，非 Owner 事项不计入分母；可比事项数会进入真实分析口径">
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'owner_estimate_coverage_rate',
      key: 'owner_estimate_coverage_rate',
      width: 150,
      sorter: hoursSorter('owner_estimate_coverage_rate'),
      sortDirections: ['descend', 'ascend'],
      render: (value, row) => (
        <Tooltip
          title={
            <Space orientation="vertical" size={2}>
              <span>{`需要 Owner 评估：${toNumber(row.owner_required_item_count, 0)} 个`}</span>
              <span>{`可比事项：${toNumber(row.owner_estimate_covered_item_count, 0)} 个`}</span>
              <span>{`缺失：${toNumber(row.owner_estimate_missing_item_count, 0)} 个`}</span>
              <span>{`非 Owner 事项：${toNumber(row.owner_estimate_non_owner_item_count, 0)} 个`}</span>
            </Space>
          }
        >
          <Text>{formatPercent(value)}</Text>
        </Tooltip>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Owner真实基线(h)</span>
          <Tooltip title="仅统计有真实 Owner 评估值的事项，不混入非 Owner 事项与兜底口径；与 Owner可比实际一起形成可比分析">
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'total_owner_baseline_hours',
      key: 'total_owner_baseline_hours',
      width: 150,
      sorter: hoursSorter('total_owner_baseline_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value, row) => (
        <Tooltip
          title={
            <Space orientation="vertical" size={2}>
              <span>{`真实基线：${formatHours(value)} h`}</span>
              <span>{`Owner可比实际：${formatHours(row.total_owner_comparable_actual_hours)} h`}</span>
              <span>{`Owner偏差：${formatHours(row.variance_owner_baseline_hours)} h`}</span>
            </Space>
          }
        >
          <Text>{formatHours(value)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 130,
      sorter: hoursSorter('total_personal_estimate_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => formatHours(value),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      sorter: hoursSorter('total_actual_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => <Text strong>{formatHours(value)}</Text>,
    },
    {
      title: (
        <Space size={4}>
          <span>Owner偏差(h)</span>
          <Tooltip title="按可比口径计算：Owner偏差 = Owner可比实际 - Owner真实基线，只统计存在真实 Owner 评估值的事项">
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'variance_owner_baseline_hours',
      key: 'variance_owner_baseline_hours',
      width: 130,
      sorter: hoursSorter('variance_owner_baseline_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => (
        <Text style={{ color: getVarianceTextColor(value, 'owner') }}>
          {Number(value) > 0 ? '+' : ''}
          {formatHours(value)}
        </Text>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>个人偏差(h)</span>
          <Tooltip title="按成员个人预估口径计算：个人偏差 = 实际工时 - 个人预估工时">
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'variance_personal_hours',
      key: 'variance_personal_hours',
      width: 130,
      sorter: hoursSorter('variance_personal_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => (
        <Text style={{ color: getVarianceTextColor(value, 'personal') }}>
          {Number(value) > 0 ? '+' : ''}
          {formatHours(value)}
        </Text>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>净效率值</span>
                  <Tooltip title={netEfficiencyFormulaTip}>
            <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'net_efficiency_value',
      key: 'net_efficiency_value',
      width: 100,
      sorter: hoursSorter('net_efficiency_value'),
      sortDirections: ['descend', 'ascend'],
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
      title: '最近填报',
      dataIndex: 'last_log_date',
      key: 'last_log_date',
      width: 120,
      render: (value) => formatBeijingDate(value),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button type="primary" ghost onClick={goDepartmentDetail} disabled={!selectedDepartmentId}>
              查看部门详情
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
              刷新
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              导出
            </Button>
          </Space>
        }
      >
        <Space wrap size={12}>
          <Segmented
            value={periodType}
            onChange={handlePeriodChange}
            options={[
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
              { label: '自定义', value: 'custom' },
            ]}
          />
          <RangePicker
            value={dateRange}
            allowClear={false}
            onChange={(values) => {
              setPeriodType('custom')
              setDateRange(values && values.length === 2 ? values : getDefaultCustomRange())
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 240 }}
            placeholder="搜索姓名/职级"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={() => loadData()}
          />
          <Segmented
            value={sortOrder}
            onChange={setSortOrder}
            options={[
              { label: '效率值高优先', value: 'desc' },
              { label: '效率值低优先', value: 'asc' },
            ]}
          />
        </Space>
        <div style={{ marginTop: 12 }}>
          <Space wrap size={12}>
            <Select
              allowClear
              loading={filterLoading}
              style={{ width: 220 }}
              placeholder="请选择部门"
              options={departmentOptions}
              value={departmentId}
              onChange={(value) => setDepartmentId(value || ALL_DEPARTMENTS_VALUE)}
            />
            <Text type="secondary">
              当前周期：{data.filters?.start_date || '-'} ~ {data.filters?.end_date || '-'}
            </Text>
            <Text type="secondary">
              对比周期：{data.filters?.previous_start_date || '-'} ~ {data.filters?.previous_end_date || '-'}
            </Text>
          </Space>
        </div>
      </Card>

      {!isAllDepartmentsSelected && !selectedDepartmentId ? (
        <Card variant="borderless">
          <Empty description="请先选择部门后查看排行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="部门" value={summary.department_name || '-'} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="成员数" value={toNumber(summary.member_count, 0)} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="事项数" value={toNumber(summary.total_item_count, 0)} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="总实际工时(h)" value={toNumber(summary.total_actual_hours, 0)} precision={1} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>Owner评估覆盖率</span>
                      <Tooltip title={ownerCoverageTip}>
                        <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
                      </Tooltip>
                    </div>
                  }
                  value={toNumber(summary.owner_estimate_coverage_rate, 0)}
                  precision={2}
                  suffix="%"
                  styles={summaryStatisticStyles}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>个人预估覆盖率</span>
                      <Tooltip title={personalCoverageTip}>
                        <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
                      </Tooltip>
                    </div>
                  }
                  value={toNumber(summary.personal_estimate_coverage_rate, 0)}
                  precision={2}
                  suffix="%"
                  styles={summaryStatisticStyles}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <Space size={6}>
                <span>部门人效排行</span>
                <Tooltip title={ownerBaselineTip}>
                  <QuestionCircleOutlined style={{ color: '#98a2b3', cursor: 'help' }} />
                </Tooltip>
              </Space>
            }
            variant="borderless"
            extra={
              <Text type="secondary">
                当前默认按净效率值从高到低排序，也可以切换为从低到高
              </Text>
            }
          >
            <Table
              rowKey="user_id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: 1780 }}
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 位成员`,
              }}
              locale={{ emptyText: '当前筛选条件下暂无排行数据' }}
            />
          </Card>
        </>
      )}
    </div>
  )
}

export default DepartmentEfficiencyRankingPage
