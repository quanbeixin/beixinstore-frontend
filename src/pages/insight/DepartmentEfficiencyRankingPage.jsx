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
  return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')]
}

function buildCsvContent(rows = []) {
  const headers = ['排名', '员工姓名', '职级', 'Owner预估总工时(h)', '个人预估总工时(h)', '实际总工时(h)', '净效率值', '最近填报日期']
  const csvRows = rows.map((row) => [
    row.rank,
    row.username || '-',
    row.job_level_name || row.job_level || '-',
    toNumber(row.total_owner_estimate_hours, 0).toFixed(1),
    toNumber(row.total_personal_estimate_hours, 0).toFixed(1),
    toNumber(row.total_actual_hours, 0).toFixed(1),
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
        completed_only: true,
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
  const netEfficiencyFormulaTip = summary.net_efficiency_formula_text ? (
    <Space orientation="vertical" size={2}>
      <span>当前页统计范围：仅统计已完成事项</span>
      <span>实际公式：实际总工时 = SUM(已完成事项的 actual_hours)</span>
      <span>{`净效率值公式：${summary.net_efficiency_formula_text}`}</span>
    </Space>
  ) : (
    '当前净效率值按已配置公式计算'
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
      title: 'Owner预估(h)',
      dataIndex: 'total_owner_estimate_hours',
      key: 'total_owner_estimate_hours',
      width: 130,
      sorter: hoursSorter('total_owner_estimate_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 130,
      sorter: hoursSorter('total_personal_estimate_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际工时(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      sorter: hoursSorter('total_actual_hours'),
      sortDirections: ['descend', 'ascend'],
      render: (value) => <Text strong>{toNumber(value, 0).toFixed(1)}</Text>,
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
      render: (value) =>
        value === null || value === undefined ? <Text type="secondary">-</Text> : <Text strong>{formatNetEfficiencyValue(value)}</Text>,
    },
    {
      title: '最近填报',
      dataIndex: 'last_log_date',
      key: 'last_log_date',
      width: 120,
      render: (value) => formatBeijingDate(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => goMemberDetail(row)}>
          查看明细
        </Button>
      ),
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
              { label: '净效率值降序', value: 'desc' },
              { label: '净效率值升序', value: 'asc' },
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
                <Statistic title="平均实际工时(h)" value={toNumber(summary.avg_actual_hours, 0)} precision={1} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="总实际工时(h)" value={toNumber(summary.total_actual_hours, 0)} precision={1} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="净效率值" value={formatNetEfficiencyValue(summary.net_efficiency_value)} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic title="总Owner预估(h)" value={toNumber(summary.total_owner_estimate_hours, 0)} precision={1} styles={summaryStatisticStyles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless" style={summaryCardStyle} styles={{ body: summaryCardBodyStyle }}>
                <Statistic
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>总个人预估(h)</span>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        成员数 {toNumber(summary.member_count, 0)}
                      </Text>
                    </div>
                  }
                  value={toNumber(summary.total_personal_estimate_hours, 0)}
                  precision={1}
                  styles={summaryStatisticStyles}
                />
              </Card>
            </Col>
          </Row>

          <Card title="部门人效排行" variant="borderless">
            <Table
              rowKey="user_id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: 1320 }}
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
