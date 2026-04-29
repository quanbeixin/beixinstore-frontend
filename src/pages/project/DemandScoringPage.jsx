import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Drawer, Empty, Form, Input, InputNumber, Segmented, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getMyDemandScoreSlotApi, getMyDemandScoreSlotsApi, submitDemandScoreSlotApi } from '../../api/work'
import './DemandScoringPage.css'

const { Text } = Typography

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待评分', value: 'PENDING' },
  { label: '已评分', value: 'SUBMITTED' },
]

const ROLE_COLORS = {
  需求负责人: 'blue',
  直属Owner: 'gold',
  项目管理: 'purple',
  协作方: 'green',
}

const PARTICIPATION_ROLE_COLORS = {
  产品经理: 'blue',
  设计: 'magenta',
  前端开发: 'cyan',
  后端开发: 'geekblue',
  测试: 'gold',
  大数据开发: 'purple',
  算法开发: 'volcano',
  项目管理: 'purple',
}

function renderSlotStatus(status) {
  if (status === 'SUBMITTED') return <Tag color="success">已评分</Tag>
  return <Tag color="warning">待评分</Tag>
}

function renderTaskStatus(status) {
  if (status === 'COMPLETED') return <Tag color="success">已完成</Tag>
  if (status === 'SCORING') return <Tag color="processing">评分中</Tag>
  return <Tag color="warning">待评分</Tag>
}

function scoreHelpText(scoreValue) {
  const normalizedScore = Number(scoreValue)
  if (Number.isFinite(normalizedScore) && normalizedScore < 80) {
    return '评分低于 80 分时，需要填写评价说明。'
  }
  return '评分只对你本人可见，结果页仅展示按身份聚合后的结果。'
}

function formatActualHours(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '0h'
  return `${num.toFixed(1).replace(/\.0$/, '')}h`
}

function formatDate(value) {
  const text = String(value || '').trim()
  return text || '-'
}

function renderSummaryTags(items = [], { colorMap = {}, max = 2, emptyText = '-' } = {}) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
  if (normalizedItems.length === 0) return <Text type="secondary">{emptyText}</Text>

  const previewItems = normalizedItems.slice(0, max)
  const moreCount = normalizedItems.length - previewItems.length
  return (
    <Space size={4} wrap>
      {previewItems.map((item) => (
        <Tag key={item} color={colorMap[item] || 'default'}>
          {item}
        </Tag>
      ))}
      {moreCount > 0 ? (
        <Tooltip title={normalizedItems.join('、')}>
          <Tag>{`+${moreCount}`}</Tag>
        </Tooltip>
      ) : null}
    </Space>
  )
}

function DemandScoringPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(() => {
    const params = new URLSearchParams(location.search || '')
    const nextStatus = String(params.get('status') || '').trim().toUpperCase()
    return ['PENDING', 'SUBMITTED'].includes(nextStatus) ? nextStatus : ''
  })
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [rows, setRows] = useState([])
  const [activeSlot, setActiveSlot] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const watchedValues = Form.useWatch([], form) || {}
  const demandIdFilter = String(new URLSearchParams(location.search || '').get('demand_id') || '').trim().toUpperCase()

  const loadRows = useCallback(async ({ page = 1, pageSize = 20 } = {}) => {
    setLoading(true)
    try {
      const result = await getMyDemandScoreSlotsApi({
        status,
        demand_id: demandIdFilter,
        page,
        pageSize,
      })
      if (!result?.success) {
        message.error(result?.message || '获取评分任务失败')
        return
      }
      const data = result.data || {}
      setRows(data.list || [])
      setPagination({
        current: data.page || page,
        pageSize: data.pageSize || pageSize,
        total: data.total || 0,
      })
    } catch (err) {
      message.error(err?.message || '获取评分任务失败')
    } finally {
      setLoading(false)
    }
  }, [demandIdFilter, status])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const nextStatus = String(params.get('status') || '').trim().toUpperCase()
    setStatus(['PENDING', 'SUBMITTED'].includes(nextStatus) ? nextStatus : '')
  }, [location.search])

  useEffect(() => {
    loadRows({ page: 1 })
  }, [loadRows])

  const openSlot = async (record) => {
    setDrawerOpen(true)
    setActiveSlot(record)
    form.resetFields()
    if (record?.score_record) {
      form.setFieldsValue({
        score: record.score_record.score,
        comment: record.score_record.comment || '',
      })
    }
    try {
      const result = await getMyDemandScoreSlotApi(record.id)
      if (result?.success && result.data) {
        setActiveSlot(result.data)
        if (result.data.score_record) {
          form.setFieldsValue({
            score: result.data.score_record.score,
            comment: result.data.score_record.comment || '',
          })
        }
      }
    } catch {
      // Keep list data as fallback.
    }
  }

  const handleSubmit = async () => {
    if (!activeSlot?.id) return
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const result = await submitDemandScoreSlotApi(activeSlot.id, values)
      if (!result?.success) {
        message.error(result?.message || '提交失败')
        return
      }
      message.success('评分已提交')
      setDrawerOpen(false)
      setActiveSlot(null)
      loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (err) {
      if (!err?.errorFields) {
        message.error(err?.message || '提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: '需求',
      dataIndex: 'demand_name',
      key: 'demand_name',
      width: 420,
      fixed: 'left',
      onCell: () => ({
        className: 'demand-scoring-page__cell--demand',
      }),
      onHeaderCell: () => ({
        className: 'demand-scoring-page__cell--demand',
      }),
      render: (value, record) => (
        <div className="demand-scoring-page__demand-cell">
          <button
            type="button"
            className="demand-scoring-page__demand-link"
            onClick={() => {
              const demandId = String(record?.demand_id || '').trim()
              if (!demandId) return
              navigate(`/work-demands/${encodeURIComponent(demandId)}?from=demand_scores`)
            }}
          >
            <Text strong className="demand-scoring-page__demand-title">
              {value || '-'}
            </Text>
          </button>
          <Text type="secondary" className="demand-scoring-page__demand-id">
            {record.demand_id}
          </Text>
        </div>
      ),
    },
    {
      title: '预期上线时间',
      dataIndex: 'expected_release_date',
      key: 'expected_release_date',
      width: 132,
      render: (value) => <Text>{formatDate(value)}</Text>,
    },
    {
      title: '被评价人',
      dataIndex: 'evaluatee_name',
      key: 'evaluatee_name',
      width: 140,
    },
    {
      title: '我的评分身份',
      dataIndex: 'role_labels',
      key: 'role_labels',
      width: 180,
      render: (labels = []) => (
        <Space size={4} wrap>
          {(labels || []).map((label) => (
            <Tag key={label} color={ROLE_COLORS[label] || 'default'}>{label}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '评分项',
      dataIndex: 'score_item_label',
      key: 'score_item_label',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '参与身份',
      dataIndex: 'participation_role_labels',
      key: 'participation_role_labels',
      width: 220,
      render: (labels = []) =>
        renderSummaryTags(labels, {
          colorMap: PARTICIPATION_ROLE_COLORS,
          max: 2,
        }),
    },
    {
      title: '参与节点',
      dataIndex: 'participation_node_names',
      key: 'participation_node_names',
      width: 180,
      render: (nodes = []) => renderSummaryTags(nodes, { max: 2 }),
    },
    {
      title: '实际工时',
      dataIndex: 'actual_hours_total',
      key: 'actual_hours_total',
      width: 110,
      render: (value) => <Text>{formatActualHours(value)}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: renderSlotStatus,
    },
    {
      title: '需求评分状态',
      dataIndex: 'task_status',
      key: 'task_status',
      width: 140,
      render: renderTaskStatus,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button type={record.status === 'SUBMITTED' ? 'default' : 'primary'} onClick={() => openSlot(record)}>
          {record.status === 'SUBMITTED' ? '查看/修改' : '去评分'}
        </Button>
      ),
    },
  ]

  return (
    <div className="demand-scoring-page">
      <Card className="demand-scoring-page__toolbar" variant="borderless">
        <div className="demand-scoring-page__toolbar-row">
          <Space size={8} wrap>
            <Segmented options={STATUS_OPTIONS} value={status} onChange={(value) => setStatus(value)} />
            {demandIdFilter ? <Tag color="blue">{`需求 ${demandIdFilter}`}</Tag> : null}
            {demandIdFilter ? (
              <Button
                size="small"
                onClick={() => {
                  navigate('/demand-scores')
                }}
              >
                查看全部
              </Button>
            ) : null}
          </Space>
          <div className="demand-scoring-page__toolbar-meta">
            <Text type="secondary">{`当前共 ${pagination.total || 0} 条评分任务`}</Text>
            <Button icon={<ReloadOutlined />} onClick={() => loadRows({ page: 1 })} loading={loading}>
              刷新
            </Button>
          </div>
        </div>
      </Card>

      <Card className="demand-scoring-page__table-card" variant="borderless">
        <Table
          className="demand-scoring-page__table"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          tableLayout="fixed"
          scroll={{ x: 1960 }}
          locale={{ emptyText: <Empty description="暂无需要你评分的需求" /> }}
          pagination={pagination}
          onChange={(nextPagination) => {
            loadRows({
              page: nextPagination.current,
              pageSize: nextPagination.pageSize,
            })
          }}
        />
      </Card>

      <Drawer
        className="demand-scoring-page__drawer"
        title="需求评分"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={620}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={handleSubmit}>
              提交评分
            </Button>
          </Space>
        }
      >
        {activeSlot ? (
          <div className="demand-scoring-page__drawer-content">
            <Card size="small" className="demand-scoring-page__drawer-hero">
              <Space direction="vertical" size={8}>
                <Tag variant="filled" className="demand-scoring-page__drawer-eyebrow">
                  评分对象
                </Tag>
                <Text strong>{activeSlot.demand_name}</Text>
                <Text type="secondary">被评价人：{activeSlot.evaluatee_name}</Text>
                <Text type="secondary">评分身份：{(activeSlot.role_labels || []).join(' / ') || '-'}</Text>
                <Text type="secondary">评分项：{activeSlot.score_item_label || '-'}</Text>
              </Space>
            </Card>
            <Card size="small" className="demand-scoring-page__reference-card" title="客观参考信息">
              <div className="demand-scoring-page__reference-grid">
                <div className="demand-scoring-page__reference-block">
                  <Text type="secondary">参与身份</Text>
                  {renderSummaryTags(activeSlot.participation_role_labels, {
                    colorMap: PARTICIPATION_ROLE_COLORS,
                    max: Number.MAX_SAFE_INTEGER,
                  })}
                </div>
                <div className="demand-scoring-page__reference-block">
                  <Text type="secondary">参与节点</Text>
                  {renderSummaryTags(activeSlot.participation_node_names, {
                    max: Number.MAX_SAFE_INTEGER,
                  })}
                </div>
                <div className="demand-scoring-page__reference-block demand-scoring-page__reference-block--metric">
                  <Text type="secondary">工时摘要</Text>
                  <Text>{`${formatActualHours(activeSlot.actual_hours_total)} · 共 ${Number(activeSlot.actual_worklog_count || 0)} 条工时`}</Text>
                </div>
              </div>
            </Card>
            <Card size="small" className="demand-scoring-page__form-card" title="评分填写">
              <Form form={form} layout="vertical" className="demand-scoring-page__form">
                <Form.Item
                  label={activeSlot.score_item_label || '评分'}
                  name="score"
                  rules={[{ required: true, message: '请填写评分' }]}
                  extra="统一按 100 分制评价。"
                >
                  <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} placeholder="0-100 分" />
                </Form.Item>
                <Form.Item
                  label="评价说明"
                  name="comment"
                  tooltip={scoreHelpText(watchedValues.score)}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const score = Number(getFieldValue('score'))
                        if (Number.isFinite(score) && score < 80 && !String(value || '').trim()) {
                          return Promise.reject(new Error('低于 80 分时需要填写评价说明'))
                        }
                        return Promise.resolve()
                      },
                    }),
                  ]}
                >
                  <Input.TextArea rows={4} maxLength={2000} showCount placeholder="可填写具体表现、风险或改进建议" />
                </Form.Item>
              </Form>
            </Card>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}

export default DemandScoringPage
