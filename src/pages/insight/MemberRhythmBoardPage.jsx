import { QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Modal,
  Row,
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
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getInsightFilterOptionsApi, getMemberInsightApi } from '../../api/work'
import { formatBeijingDate } from '../../utils/datetime'

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

function toDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = dayjs(text, 'YYYY-MM-DD', true)
  return parsed.isValid() ? parsed : null
}

function getSaturationTag(rate) {
  const num = toNumber(rate, 0)
  if (num > 100) return <Tag color="red">{num.toFixed(1)}%</Tag>
  if (num < 60) return <Tag color="gold">{num.toFixed(1)}%</Tag>
  return <Tag color="green">{num.toFixed(1)}%</Tag>
}

function getDefaultDateRange() {
  return [dayjs().add(-30, 'day'), dayjs()]
}

function MemberRhythmBoard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)
  const [queryReady, setQueryReady] = useState(false)
  const [metricModalOpen, setMetricModalOpen] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [departmentId, setDepartmentId] = useState()
  const [ownerUserId, setOwnerUserId] = useState()
  const [memberUserId, setMemberUserId] = useState()
  const [businessGroupCode, setBusinessGroupCode] = useState()
  const [dateRange, setDateRange] = useState(getDefaultDateRange)

  const [filters, setFilters] = useState({
    departments: [],
    owners: [],
    business_groups: [],
  })

  const [data, setData] = useState({
    summary: {
      member_count: 0,
      total_filled_days: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      avg_actual_hours_per_day: 0,
      avg_saturation_rate: 0,
      overload_member_count: 0,
      low_load_member_count: 0,
      overload_day_count: 0,
      low_load_day_count: 0,
    },
    member_list: [],
  })

  useEffect(() => {
    const startDate = toDateValue(searchParams.get('start_date'))
    const endDate = toDateValue(searchParams.get('end_date'))

    if (startDate && endDate && !startDate.isAfter(endDate)) {
      setDateRange([startDate, endDate])
    } else {
      setDateRange(getDefaultDateRange())
    }

    setDepartmentId(toPositiveInt(searchParams.get('department_id')) || undefined)
    setOwnerUserId(toPositiveInt(searchParams.get('owner_user_id')) || undefined)
    setMemberUserId(toPositiveInt(searchParams.get('member_user_id')) || undefined)

    const businessGroup = String(searchParams.get('business_group_code') || '').trim()
    setBusinessGroupCode(businessGroup || undefined)

    const q = String(searchParams.get('keyword') || '').trim()
    setKeyword(q)

    setQueryReady(true)
  }, [searchParams])

  const loadFilterOptions = useCallback(async () => {
    setFilterLoading(true)
    try {
      const result = await getInsightFilterOptionsApi()
      if (!result?.success) {
        message.error(result?.message || '获取筛选项失败')
        return
      }
      setFilters(result.data || {})
    } catch (err) {
      message.error(err?.message || '获取筛选项失败')
    } finally {
      setFilterLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
        department_id: departmentId,
        owner_user_id: ownerUserId,
        member_user_id: memberUserId,
        business_group_code: businessGroupCode,
        keyword: keyword?.trim() || undefined,
      }
      const result = await getMemberInsightApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取成员工作节奏失败')
        return
      }
      setData(result.data || { summary: {}, member_list: [] })
    } catch (err) {
      message.error(err?.message || '获取成员工作节奏失败')
    } finally {
      setLoading(false)
    }
  }, [businessGroupCode, dateRange, departmentId, keyword, memberUserId, ownerUserId])

  useEffect(() => {
    loadFilterOptions()
  }, [loadFilterOptions])

  useEffect(() => {
    if (!queryReady) return
    loadData()
  }, [queryReady, loadData])

  const handleResetFilters = () => {
    setKeyword('')
    setDepartmentId(undefined)
    setOwnerUserId(undefined)
    setMemberUserId(undefined)
    setBusinessGroupCode(undefined)
    setDateRange(getDefaultDateRange())
  }

  const goDemandInsight = (targetMemberUserId) => {
    const params = new URLSearchParams()
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    if (departmentId) params.set('department_id', String(departmentId))
    if (ownerUserId) params.set('owner_user_id', String(ownerUserId))
    if (businessGroupCode) params.set('business_group_code', String(businessGroupCode))
    if (targetMemberUserId) params.set('member_user_id', String(targetMemberUserId))
    navigate(`/efficiency/demand?${params.toString()}`)
  }

  const summary = data.summary || {}
  const memberList = Array.isArray(data.member_list) ? data.member_list : []

  const overloadTop10 = useMemo(
    () =>
      memberList
        .filter((item) => Number(item.avg_saturation_rate || 0) > 100)
        .sort((a, b) => Number(b.avg_saturation_rate || 0) - Number(a.avg_saturation_rate || 0))
        .slice(0, 10),
    [memberList],
  )

  const lowLoadTop10 = useMemo(
    () =>
      memberList
        .filter((item) => Number(item.avg_saturation_rate || 0) < 60)
        .sort((a, b) => Number(a.avg_saturation_rate || 0) - Number(b.avg_saturation_rate || 0))
        .slice(0, 10),
    [memberList],
  )

  const ownerOptions = useMemo(
    () =>
      (filters.owners || []).map((item) => ({
        value: item.id,
        label: item.department_name ? `${item.username}（${item.department_name}）` : item.username,
      })),
    [filters.owners],
  )

  const departmentOptions = useMemo(
    () =>
      (filters.departments || []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    [filters.departments],
  )

  const businessGroupOptions = useMemo(
    () =>
      (filters.business_groups || []).map((item) => ({
        value: item.code,
        label: `${item.name}${item.code ? ` (${item.code})` : ''}`,
      })),
    [filters.business_groups],
  )

  const departmentLabelById = useMemo(
    () => new Map((filters.departments || []).map((item) => [Number(item.id), item.name || `部门#${Number(item.id)}`])),
    [filters.departments],
  )

  const ownerLabelById = useMemo(
    () =>
      new Map(
        (filters.owners || []).map((item) => [
          Number(item.id),
          item.department_name ? `${item.username}（${item.department_name}）` : item.username,
        ]),
      ),
    [filters.owners],
  )

  const businessGroupLabelByCode = useMemo(
    () =>
      new Map(
        (filters.business_groups || []).map((item) => [
          String(item.code || ''),
          `${item.name}${item.code ? ` (${item.code})` : ''}`,
        ]),
      ),
    [filters.business_groups],
  )

  const activeFilterTags = useMemo(() => {
    const tags = []
    const startText = dateRange?.[0]?.format('YYYY-MM-DD')
    const endText = dateRange?.[1]?.format('YYYY-MM-DD')
    tags.push({
      key: 'date',
      label: `时间：${startText || '-'} ~ ${endText || '-'}`,
      onClose: () => setDateRange(getDefaultDateRange()),
    })

    if (departmentId) {
      tags.push({
        key: 'department',
        label: `部门：${departmentLabelById.get(Number(departmentId)) || `部门#${departmentId}`}`,
        onClose: () => setDepartmentId(undefined),
      })
    }

    if (ownerUserId) {
      tags.push({
        key: 'owner',
        label: `需求负责人：${ownerLabelById.get(Number(ownerUserId)) || `用户#${ownerUserId}`}`,
        onClose: () => setOwnerUserId(undefined),
      })
    }

    if (memberUserId) {
      tags.push({
        key: 'member',
        label: `成员：${ownerLabelById.get(Number(memberUserId)) || `用户#${memberUserId}`}`,
        onClose: () => setMemberUserId(undefined),
      })
    }

    if (businessGroupCode) {
      tags.push({
        key: 'business_group',
        label: `业务组：${businessGroupLabelByCode.get(String(businessGroupCode)) || businessGroupCode}`,
        onClose: () => setBusinessGroupCode(undefined),
      })
    }

    if (String(keyword || '').trim()) {
      tags.push({
        key: 'keyword',
        label: `关键词：${String(keyword).trim()}`,
        onClose: () => setKeyword(''),
      })
    }

    return tags
  }, [
    businessGroupCode,
    businessGroupLabelByCode,
    dateRange,
    departmentId,
    departmentLabelById,
    keyword,
    memberUserId,
    ownerLabelById,
    ownerUserId,
  ])

  const memberColumns = [
    {
      title: '成员',
      key: 'member',
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{row.username}</Text>
          <Space size={4}>
            <Tag color="blue">#{row.user_id}</Tag>
            <Tag>{row.department_name || '-'}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '填报天数',
      dataIndex: 'filled_days',
      key: 'filled_days',
      width: 90,
    },
    {
      title: '需求数',
      dataIndex: 'demand_count',
      key: 'demand_count',
      width: 110,
      render: (value, row) =>
        Number(value || 0) > 0 ? (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => goDemandInsight(row.user_id)}>
            {value}
          </Button>
        ) : (
          '0'
        ),
    },
    {
      title: '负责人预估(h)',
      dataIndex: 'total_owner_estimate_hours',
      key: 'total_owner_estimate_hours',
      width: 130,
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
      title: '个人实际(h)',
      dataIndex: 'total_actual_hours',
      key: 'total_actual_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '日均实际(h)',
      dataIndex: 'avg_actual_hours_per_day',
      key: 'avg_actual_hours_per_day',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '平均饱和度',
      dataIndex: 'avg_saturation_rate',
      key: 'avg_saturation_rate',
      width: 110,
      render: (value) => getSaturationTag(value),
    },
    {
      title: '超负荷天数',
      dataIndex: 'overload_days',
      key: 'overload_days',
      width: 100,
      render: (value) => (Number(value || 0) > 0 ? <Tag color="red">{value}</Tag> : '0'),
    },
    {
      title: '低负荷天数',
      dataIndex: 'low_load_days',
      key: 'low_load_days',
      width: 100,
      render: (value) => (Number(value || 0) > 0 ? <Tag color="gold">{value}</Tag> : '0'),
    },
    {
      title: '最后记录',
      dataIndex: 'last_log_date',
      key: 'last_log_date',
      width: 120,
      render: (value) => formatBeijingDate(value),
    },
  ]

  const anomalyColumns = [
    {
      title: '成员',
      key: 'member',
      render: (_, row) => (
        <Space>
          <Tag color="blue">#{row.user_id}</Tag>
          <span>{row.username}</span>
        </Space>
      ),
    },
    {
      title: '饱和度',
      dataIndex: 'avg_saturation_rate',
      key: 'avg_saturation_rate',
      width: 110,
      render: (value) => getSaturationTag(value),
    },
    {
      title: '日均实际(h)',
      dataIndex: 'avg_actual_hours_per_day',
      key: 'avg_actual_hours_per_day',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
  ]

  const renderDailyTable = (memberRow) => {
    const rows = Array.isArray(memberRow.daily_stats) ? memberRow.daily_stats : []
    if (rows.length === 0) {
      return <Empty description="当前成员暂无按日数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }
    const sortedRows = [...rows].sort((a, b) =>
      String(b.log_date || '').localeCompare(String(a.log_date || '')),
    )

    return (
      <Table
        rowKey={(row) => `${memberRow.user_id}_${row.log_date}`}
        size="small"
        pagination={false}
        dataSource={sortedRows}
        columns={[
          {
            title: '日期',
            dataIndex: 'log_date',
            key: 'log_date',
            width: 120,
            render: (value) => formatBeijingDate(value),
          },
          {
            title: '日志条数',
            dataIndex: 'log_count',
            key: 'log_count',
            width: 90,
          },
          {
            title: '需求数',
            dataIndex: 'demand_count',
            key: 'demand_count',
            width: 90,
          },
          {
            title: '负责人预估(h)',
            dataIndex: 'owner_estimate_hours',
            key: 'owner_estimate_hours',
            width: 130,
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
            title: '个人实际(h)',
            dataIndex: 'actual_hours',
            key: 'actual_hours',
            width: 120,
            render: (value) => toNumber(value, 0).toFixed(1),
          },
          {
            title: '饱和度',
            dataIndex: 'saturation_rate',
            key: 'saturation_rate',
            width: 110,
            render: (value) => getSaturationTag(value),
          },
        ]}
      />
    )
  }

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button icon={<QuestionCircleOutlined />} onClick={() => setMetricModalOpen(true)}>
              口径说明
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
              刷新
            </Button>
          </Space>
        }
      >
        <Space wrap size={12}>
          <RangePicker
            value={dateRange}
            onChange={(values) => setDateRange(values && values.length === 2 ? values : getDefaultDateRange())}
            allowClear={false}
          />
          <Select
            allowClear
            loading={filterLoading}
            style={{ width: 180 }}
            placeholder="部门"
            options={departmentOptions}
            value={departmentId}
            onChange={setDepartmentId}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={filterLoading}
            style={{ width: 220 }}
            placeholder="需求负责人"
            options={ownerOptions}
            value={ownerUserId}
            onChange={setOwnerUserId}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={filterLoading}
            style={{ width: 220 }}
            placeholder="成员"
            options={ownerOptions}
            value={memberUserId}
            onChange={setMemberUserId}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={filterLoading}
            style={{ width: 220 }}
            placeholder="业务组"
            options={businessGroupOptions}
            value={businessGroupCode}
            onChange={setBusinessGroupCode}
          />
          <Input.Search
            allowClear
            placeholder="搜索成员/需求/描述"
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => loadData()}
          />
          <Button onClick={handleResetFilters}>重置筛选</Button>
        </Space>
        {activeFilterTags.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <Space wrap size={[8, 8]}>
              <Text type="secondary">当前筛选：</Text>
              {activeFilterTags.map((item) => (
                <Tag
                  key={item.key}
                  closable
                  onClose={(event) => {
                    event.preventDefault()
                    item.onClose()
                  }}
                >
                  {item.label}
                </Tag>
              ))}
            </Space>
          </div>
        ) : null}
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="成员数" value={toNumber(summary.member_count, 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="总填报天数" value={toNumber(summary.total_filled_days, 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="日均实际用时(h)" value={toNumber(summary.avg_actual_hours_per_day, 0)} precision={1} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="平均饱和度" value={toNumber(summary.avg_saturation_rate, 0)} precision={1} suffix="%" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="超负荷成员数" value={toNumber(summary.overload_member_count, 0)} />
            <Text type="secondary">超负荷天数：{toNumber(summary.overload_day_count, 0)}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="低负荷成员数" value={toNumber(summary.low_load_member_count, 0)} />
            <Text type="secondary">低负荷天数：{toNumber(summary.low_load_day_count, 0)}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="负责人预估总用时(h)" value={toNumber(summary.total_owner_estimate_hours, 0)} precision={1} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="个人实际总用时(h)" value={toNumber(summary.total_actual_hours, 0)} precision={1} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="异常优先 · 过载 TOP10" variant="borderless">
            <Table
              rowKey="user_id"
              size="small"
              pagination={false}
              dataSource={overloadTop10}
              columns={anomalyColumns}
              locale={{ emptyText: '暂无过载成员' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="异常优先 · 低载 TOP10" variant="borderless">
            <Table
              rowKey="user_id"
              size="small"
              pagination={false}
              dataSource={lowLoadTop10}
              columns={anomalyColumns}
              locale={{ emptyText: '暂无低载成员' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="成员工作节奏明细" variant="borderless">
        <Table
          rowKey="user_id"
          loading={loading}
          columns={memberColumns}
          dataSource={memberList}
          expandable={{
            expandedRowRender: renderDailyTable,
            rowExpandable: (record) => Array.isArray(record.daily_stats) && record.daily_stats.length > 0,
          }}
          scroll={{ x: 1500 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 位成员`,
          }}
          locale={{
            emptyText: '当前筛选条件下暂无数据',
          }}
        />
      </Card>

      <Modal
        open={metricModalOpen}
        title="口径说明 · 成员工作节奏"
        footer={[
          <Button key="ok" type="primary" onClick={() => setMetricModalOpen(false)}>
            我知道了
          </Button>,
        ]}
        onCancel={() => setMetricModalOpen(false)}
      >
        <Space orientation="vertical" size={8}>
          <Text>1. 统计范围按筛选时间内 `work_logs.log_date` 计算。</Text>
          <Text>2. 饱和度口径：`个人实际用时 / 8h`，当前按固定 8h/天计算。</Text>
          <Text>3. 超负荷：饱和度 {'>'} 100%；低负荷：饱和度 {'<'} 60%。</Text>
          <Text>4. 可从“需求数”直接联动到需求投入看板，继续追踪投入分布。</Text>
          <Text>5. 三类用时分别为：负责人预估、个人预估、个人实际。</Text>
        </Space>
      </Modal>
    </div>
  )
}

export default MemberRhythmBoard
