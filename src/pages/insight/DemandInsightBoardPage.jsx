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
import { getDemandInsightApi, getInsightFilterOptionsApi } from '../../api/work'
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

function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${toNumber(value, 0).toFixed(2)}%`
}

function varianceColor(value) {
  const num = Number(value || 0)
  if (num > 0) return '#d4380d'
  if (num < 0) return '#389e0d'
  return '#262626'
}

function getDefaultDateRange() {
  return [dayjs().add(-30, 'day'), dayjs()]
}

function DemandInsightBoard() {
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
  const [participantModal, setParticipantModal] = useState({
    open: false,
    demandName: '',
    phaseName: '',
    participants: [],
  })

  const [filters, setFilters] = useState({
    departments: [],
    owners: [],
    business_groups: [],
  })

  const [data, setData] = useState({
    summary: {
      demand_count: 0,
      phase_count: 0,
      participant_count: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      variance_owner_hours: 0,
      variance_owner_rate: null,
      unestimated_item_count: 0,
    },
    demand_list: [],
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
      const result = await getDemandInsightApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取需求投入看板失败')
        return
      }
      setData(result.data || { summary: {}, demand_list: [] })
    } catch (err) {
      message.error(err?.message || '获取需求投入看板失败')
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

  const goMemberRhythm = (targetMemberUserId) => {
    const params = new URLSearchParams()
    if (dateRange?.[0]) params.set('start_date', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange?.[1]) params.set('end_date', dateRange[1].format('YYYY-MM-DD'))
    if (departmentId) params.set('department_id', String(departmentId))
    if (ownerUserId) params.set('owner_user_id', String(ownerUserId))
    if (businessGroupCode) params.set('business_group_code', String(businessGroupCode))
    if (targetMemberUserId) params.set('member_user_id', String(targetMemberUserId))
    navigate(`/efficiency/member?${params.toString()}`)
  }

  const summary = data.summary || {}
  const demandList = Array.isArray(data.demand_list) ? data.demand_list : []

  const overrunTop10 = useMemo(
    () =>
      demandList
        .filter((item) => Number(item.variance_owner_hours || 0) > 0)
        .sort((a, b) => Number(b.variance_owner_hours || 0) - Number(a.variance_owner_hours || 0))
        .slice(0, 10),
    [demandList],
  )

  const savingTop10 = useMemo(
    () =>
      demandList
        .filter((item) => Number(item.variance_owner_hours || 0) < 0)
        .sort((a, b) => Number(a.variance_owner_hours || 0) - Number(b.variance_owner_hours || 0))
        .slice(0, 10),
    [demandList],
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
        label: `参与成员：${ownerLabelById.get(Number(memberUserId)) || `用户#${memberUserId}`}`,
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

  const demandColumns = [
    {
      title: '需求',
      key: 'demand',
      width: 280,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{row.demand_name || row.demand_id}</Text>
          <Space size={4}>
            <Tag color="blue">{row.demand_id}</Tag>
            <Tag>{row.owner_name || '未设置负责人'}</Tag>
            {row.business_group_name ? <Tag color="geekblue">{row.business_group_name}</Tag> : null}
          </Space>
        </Space>
      ),
    },
    {
      title: '参与人数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
    },
    {
      title: '阶段数',
      dataIndex: 'phase_count',
      key: 'phase_count',
      width: 90,
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
      title: '偏差(实际-负责人)',
      dataIndex: 'variance_owner_hours',
      key: 'variance_owner_hours',
      width: 150,
      render: (value) => (
        <span style={{ color: varianceColor(value) }}>{toNumber(value, 0).toFixed(1)}</span>
      ),
    },
    {
      title: '偏差率',
      dataIndex: 'variance_owner_rate',
      key: 'variance_owner_rate',
      width: 110,
      render: (value) => {
        const rate = Number(value || 0)
        return <span style={{ color: varianceColor(rate) }}>{formatRate(value)}</span>
      },
    },
    {
      title: '未评估项',
      dataIndex: 'unestimated_item_count',
      key: 'unestimated_item_count',
      width: 100,
      render: (value) => (Number(value || 0) > 0 ? <Tag color="orange">{value}</Tag> : '0'),
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
      title: '需求',
      key: 'demand',
      render: (_, row) => (
        <Space>
          <Tag color="blue">{row.demand_id}</Tag>
          <span>{row.demand_name || row.demand_id}</span>
        </Space>
      ),
    },
    {
      title: '偏差(h)',
      dataIndex: 'variance_owner_hours',
      key: 'variance_owner_hours',
      width: 110,
      render: (value) => <span style={{ color: varianceColor(value) }}>{toNumber(value, 0).toFixed(1)}</span>,
    },
    {
      title: '偏差率',
      dataIndex: 'variance_owner_rate',
      key: 'variance_owner_rate',
      width: 100,
      render: (value) => formatRate(value),
    },
  ]

  const renderPhaseTable = (demandRow) => {
    const phaseRows = Array.isArray(demandRow.phases) ? demandRow.phases : []
    if (phaseRows.length === 0) {
      return <Empty description="当前需求暂无阶段投入数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }

    return (
      <Table
        rowKey={(row) => `${demandRow.demand_id}_${row.phase_key || 'NO_PHASE'}`}
        size="small"
        pagination={false}
        dataSource={phaseRows}
        scroll={{ x: 1200 }}
        columns={[
          {
            title: '阶段',
            key: 'phase',
            width: 180,
            render: (_, row) => (
              <Space>
                <Tag color="geekblue">{row.phase_name || row.phase_key || '未分阶段'}</Tag>
                {row.phase_key ? <Text type="secondary">{row.phase_key}</Text> : null}
              </Space>
            ),
          },
          { title: '参与人数', dataIndex: 'member_count', key: 'member_count', width: 90 },
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
            title: '偏差(实际-负责人)',
            dataIndex: 'variance_owner_hours',
            key: 'variance_owner_hours',
            width: 150,
            render: (value) => (
              <span style={{ color: varianceColor(value) }}>{toNumber(value, 0).toFixed(1)}</span>
            ),
          },
          {
            title: '参与人',
            key: 'participants',
            render: (_, row) => {
              const participants = Array.isArray(row.participants) ? row.participants : []
              if (participants.length === 0) return '-'
              return (
                <Space wrap>
                  {participants.slice(0, 3).map((item) => (
                    <Tag key={`${row.phase_key}_${item.user_id}`}>{item.username}</Tag>
                  ))}
                  {participants.length > 3 ? <Tag>+{participants.length - 3}</Tag> : null}
                  <Button
                    type="link"
                    style={{ paddingInline: 0 }}
                    onClick={() =>
                      setParticipantModal({
                        open: true,
                        demandName: demandRow.demand_name || demandRow.demand_id,
                        phaseName: row.phase_name || row.phase_key || '未分阶段',
                        participants,
                      })
                    }
                  >
                    查看明细
                  </Button>
                </Space>
              )
            },
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
            placeholder="参与成员"
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
            placeholder="搜索需求/阶段/成员"
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
            <Statistic title="需求数" value={toNumber(summary.demand_count, 0)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card variant="borderless">
            <Statistic title="参与人数" value={toNumber(summary.participant_count, 0)} />
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
        <Col xs={24} sm={12} xl={8}>
          <Card variant="borderless">
            <Statistic
              title="偏差(实际-负责人预估)"
              value={toNumber(summary.variance_owner_hours, 0)}
              precision={1}
              styles={{ content: { color: varianceColor(summary.variance_owner_hours) } }}
              suffix="h"
            />
            <Text type="secondary">偏差率：{formatRate(summary.variance_owner_rate)}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Card variant="borderless">
            <Statistic
              title="偏差(实际-个人预估)"
              value={toNumber(summary.variance_personal_hours, 0)}
              precision={1}
              styles={{ content: { color: varianceColor(summary.variance_personal_hours) } }}
              suffix="h"
            />
            <Text type="secondary">偏差率：{formatRate(summary.variance_personal_rate)}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Card variant="borderless">
            <Statistic title="未评估项数量" value={toNumber(summary.unestimated_item_count, 0)} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="异常优先 · 超支 TOP10" variant="borderless">
            <Table
              rowKey="demand_id"
              size="small"
              pagination={false}
              dataSource={overrunTop10}
              columns={anomalyColumns}
              locale={{ emptyText: '暂无超支需求' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="异常优先 · 节省 TOP10" variant="borderless">
            <Table
              rowKey="demand_id"
              size="small"
              pagination={false}
              dataSource={savingTop10}
              columns={anomalyColumns}
              locale={{ emptyText: '暂无节省需求' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="需求投入明细" variant="borderless" style={{ marginTop: 16 }}>
        <Table
          rowKey="demand_id"
          loading={loading}
          columns={demandColumns}
          dataSource={demandList}
          expandable={{
            expandedRowRender: renderPhaseTable,
            rowExpandable: (record) => Array.isArray(record.phases) && record.phases.length > 0,
          }}
          scroll={{ x: 1500 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条需求`,
          }}
          locale={{
            emptyText: '当前筛选条件下暂无数据',
          }}
        />
      </Card>

      <Modal
        open={participantModal.open}
        title={`${participantModal.demandName} / ${participantModal.phaseName} · 参与人明细`}
        footer={null}
        width={960}
        onCancel={() => setParticipantModal({ open: false, demandName: '', phaseName: '', participants: [] })}
      >
        <Table
          rowKey={(row) => row.user_id}
          size="small"
          pagination={false}
          dataSource={participantModal.participants}
          columns={[
            { title: '成员', dataIndex: 'username', key: 'username', width: 140 },
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
              title: '偏差(实际-负责人)',
              dataIndex: 'variance_owner_hours',
              key: 'variance_owner_hours',
              width: 150,
              render: (value) => (
                <span style={{ color: varianceColor(value) }}>{toNumber(value, 0).toFixed(1)}</span>
              ),
            },
            {
              title: '最后记录',
              dataIndex: 'last_log_date',
              key: 'last_log_date',
              width: 120,
              render: (value) => formatBeijingDate(value),
            },
            {
              title: '联动',
              key: 'jump',
              width: 130,
              render: (_, row) => (
                <Button
                  type="link"
                  style={{ paddingInline: 0 }}
                  onClick={() => {
                    setParticipantModal({ open: false, demandName: '', phaseName: '', participants: [] })
                    goMemberRhythm(row.user_id)
                  }}
                >
                  查看成员节奏
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        open={metricModalOpen}
        title="口径说明 · 需求投入看板"
        footer={[
          <Button key="ok" type="primary" onClick={() => setMetricModalOpen(false)}>
            我知道了
          </Button>,
        ]}
        onCancel={() => setMetricModalOpen(false)}
      >
        <Space orientation="vertical" size={8}>
          <Text>1. 统计范围按筛选时间内 `work_logs.log_date` 计算。</Text>
          <Text>2. 三类用时分别为：负责人预估、个人预估、个人实际。</Text>
          <Text>3. 需求-阶段参与人按 `demand_id + phase_key + user_id` 去重统计。</Text>
          <Text>4. 不需要 Owner 评估的事项，负责人口径自动取“个人实际用时”；需评估事项仍取 `owner_estimate_hours`。</Text>
          <Text>5. 偏差定义：`个人实际 - 负责人预估`，正值代表超支。</Text>
        </Space>
      </Modal>
    </div>
  )
}

export default DemandInsightBoard
