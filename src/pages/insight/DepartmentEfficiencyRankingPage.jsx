import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DownloadOutlined,
  MinusOutlined,
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

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
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
  const headers = ['排名', '员工姓名', '职级', 'Owner预估总工时(h)', '个人预估总工时(h)', '实际总工时(h)', '净效率值', '趋势', '最近填报日期']
  const csvRows = rows.map((row) => [
    row.rank,
    row.username || '-',
    row.job_level_name || row.job_level || '-',
    toNumber(row.total_owner_estimate_hours, 0).toFixed(1),
    toNumber(row.total_personal_estimate_hours, 0).toFixed(1),
    toNumber(row.total_actual_hours, 0).toFixed(1),
    row.net_efficiency_value === null || row.net_efficiency_value === undefined ? '-' : row.net_efficiency_value,
    row.trend_direction === 'UP' ? '上升' : row.trend_direction === 'DOWN' ? '下降' : '持平',
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
  const [departmentId, setDepartmentId] = useState()
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
    },
    rows: [],
    filters: {},
  })

  const departmentOptions = useMemo(() => {
    const baseOptions = (filters.departments || []).map((item) => ({
      value: item.id,
      label: item.name,
    }))
    if (canViewAllDepartments) return baseOptions
    const managedSet = new Set(managedDepartmentIds)
    return baseOptions.filter((item) => managedSet.has(Number(item.value)))
  }, [canViewAllDepartments, filters.departments, managedDepartmentIds])

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
    if (departmentOptions.length === 1) {
      setDepartmentId(departmentOptions[0].value)
      return
    }
    if (!canViewAllDepartments && departmentOptions.length > 0) {
      setDepartmentId(departmentOptions[0].value)
    }
  }, [canViewAllDepartments, departmentId, departmentOptions])

  const loadData = useCallback(async () => {
    if (!departmentId) return
    setLoading(true)
    try {
      const result = await getDepartmentEfficiencyRankingApi({
        department_id: departmentId,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
        keyword: String(keyword || '').trim() || undefined,
        sort_order: sortOrder,
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
  }, [dateRange, departmentId, keyword, sortOrder])

  useEffect(() => {
    if (!departmentId) return
    loadData()
  }, [departmentId, loadData])

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

  const goMemberInsight = (row) => {
    const params = new URLSearchParams()
    if (departmentId) params.set('department_id', String(departmentId))
    if (row?.user_id) params.set('member_user_id', String(row.user_id))
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    navigate(`/efficiency/member?${params.toString()}`)
  }

  const summary = data.summary || {}
  const rows = Array.isArray(data.rows) ? data.rows : []

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
          <Button type="link" style={{ paddingInline: 0, fontWeight: 600 }} onClick={() => goMemberInsight(row)}>
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
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'total_personal_estimate_hours',
      key: 'total_personal_estimate_hours',
      width: 130,
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
      title: '净效率值',
      dataIndex: 'net_efficiency_value',
      key: 'net_efficiency_value',
      width: 100,
      render: () => <Text type="secondary">-</Text>,
    },
    {
      title: '趋势',
      key: 'trend',
      width: 140,
      render: (_, row) => {
        const delta = toNumber(row.trend_delta_actual_hours, 0).toFixed(1)
        if (row.trend_direction === 'UP') {
          return (
            <Space size={4}>
              <ArrowUpOutlined style={{ color: '#cf1322' }} />
              <Text style={{ color: '#cf1322' }}>+{delta}h</Text>
            </Space>
          )
        }
        if (row.trend_direction === 'DOWN') {
          return (
            <Space size={4}>
              <ArrowDownOutlined style={{ color: '#1677ff' }} />
              <Text style={{ color: '#1677ff' }}>{delta}h</Text>
            </Space>
          )
        }
        return (
          <Space size={4}>
            <MinusOutlined style={{ color: '#98a2b3' }} />
            <Text type="secondary">持平</Text>
          </Space>
        )
      },
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
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => goMemberInsight(row)}>
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
              { label: '工时降序', value: 'desc' },
              { label: '工时升序', value: 'asc' },
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
              onChange={setDepartmentId}
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

      {!departmentId ? (
        <Card variant="borderless">
          <Empty description="请先选择部门后查看排行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} xl={4}>
              <Card variant="borderless">
                <Statistic title="部门" value={summary.department_name || '-'} valueStyle={{ fontSize: 18 }} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={5}>
              <Card variant="borderless">
                <Statistic title="部门平均实际工时(h)" value={toNumber(summary.avg_actual_hours, 0)} precision={1} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={5}>
              <Card variant="borderless">
                <Statistic title="部门总实际工时(h)" value={toNumber(summary.total_actual_hours, 0)} precision={1} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={5}>
              <Card variant="borderless">
                <Statistic title="部门总Owner预估(h)" value={toNumber(summary.total_owner_estimate_hours, 0)} precision={1} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={5}>
              <Card variant="borderless">
                <Statistic title="部门总个人预估(h)" value={toNumber(summary.total_personal_estimate_hours, 0)} precision={1} />
                <Text type="secondary">成员数：{toNumber(summary.member_count, 0)}</Text>
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
