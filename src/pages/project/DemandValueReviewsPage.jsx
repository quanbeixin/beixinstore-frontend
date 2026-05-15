import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteDemandValueReviewApi,
  getDemandValueReviewDetailApi,
  getDemandValueReviewsApi,
  reopenDemandValueReviewApi,
  skipDemandValueReviewApi,
  submitDemandValueReviewApi,
  unskipDemandValueReviewApi,
  updateDemandValueReviewParticipantsApi,
  updateDemandValueReviewApi,
} from '../../api/work'
import { getUsersApi } from '../../api/users'
import { getAccessSnapshot } from '../../utils/access'
import { formatBeijingDate, formatBeijingDateTime } from '../../utils/datetime'

const { Search } = Input
const { Text, Paragraph } = Typography
const { RangePicker } = DatePicker

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待复盘', value: 'PENDING' },
  { label: '复盘中', value: 'IN_REVIEW' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '无需复盘', value: 'SKIPPED' },
]

const STATUS_TEXT = {
  PENDING: '待复盘',
  IN_REVIEW: '复盘中',
  COMPLETED: '已完成',
  SKIPPED: '无需复盘',
}

const STATUS_COLOR = {
  PENDING: 'warning',
  IN_REVIEW: 'processing',
  COMPLETED: 'success',
  SKIPPED: 'default',
}

function renderStatusTag(status) {
  const normalized = String(status || '').trim().toUpperCase()
  return <Tag color={STATUS_COLOR[normalized] || 'default'}>{STATUS_TEXT[normalized] || normalized || '-'}</Tag>
}

function DemandValueReviewsPage() {
  const navigate = useNavigate()
  const params = useParams()
  const isAdmin = useMemo(() => {
    const access = getAccessSnapshot() || {}
    if (access?.is_super_admin) return true
    const roleKeys = Array.isArray(access?.role_keys) ? access.role_keys : []
    return roleKeys.includes('ADMIN')
  }, [])
  const [form] = Form.useForm()
  const [skipForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [activeReviewId, setActiveReviewId] = useState(null)
  const [activeDetail, setActiveDetail] = useState(null)
  const [skipModalOpen, setSkipModalOpen] = useState(false)
  const [participantOptions, setParticipantOptions] = useState([])
  const [participantUserIds, setParticipantUserIds] = useState([])
  const [deletingReviewId, setDeletingReviewId] = useState(0)

  const reviewIdFromRoute = useMemo(() => {
    const reviewId = Number(params?.id || 0)
    return Number.isInteger(reviewId) && reviewId > 0 ? reviewId : null
  }, [params?.id])

  const loadRows = useCallback(
    async ({ page = 1, pageSize = 20 } = {}) => {
      setLoading(true)
      try {
        const values = form.getFieldsValue()
        const range = Array.isArray(values?.created_range) ? values.created_range : []
        const result = await getDemandValueReviewsApi({
          keyword: keyword || undefined,
          status: status || undefined,
          sort_by: sortBy || undefined,
          sort_order: sortOrder || undefined,
          page,
          pageSize,
          start_date: range[0] ? dayjs(range[0]).format('YYYY-MM-DD') : undefined,
          end_date: range[1] ? dayjs(range[1]).format('YYYY-MM-DD') : undefined,
        })
        if (!result?.success) {
          message.error(result?.message || '获取复盘列表失败')
          return
        }
        const data = result?.data || {}
        setRows(Array.isArray(data?.list) ? data.list : [])
        setPagination({
          current: Number(data?.page || page),
          pageSize: Number(data?.pageSize || pageSize),
          total: Number(data?.total || 0),
        })
      } catch (error) {
        message.error(error?.message || '获取复盘列表失败')
      } finally {
        setLoading(false)
      }
    },
    [form, keyword, sortBy, sortOrder, status],
  )

  useEffect(() => {
    loadRows({ page: 1, pageSize: pagination.pageSize })
  }, [loadRows, pagination.pageSize])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getUsersApi({ page: 1, pageSize: 1000, include_inactive: false })
        if (cancelled || !result?.success) return
        const options = (Array.isArray(result?.data?.list) ? result.data.list : [])
          .map((item) => {
            const userId = Number(item?.id)
            if (!Number.isInteger(userId) || userId <= 0) return null
            return {
              value: userId,
              label: String(item?.real_name || item?.username || `用户${userId}`).trim() || `用户${userId}`,
            }
          })
          .filter(Boolean)
        setParticipantOptions(options)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadDetail = useCallback(async (reviewId) => {
    const normalized = Number(reviewId || 0)
    if (!Number.isInteger(normalized) || normalized <= 0) return
    try {
      const result = await getDemandValueReviewDetailApi(normalized)
      if (!result?.success) {
        message.error(result?.message || '获取复盘详情失败')
        return
      }
      const data = result?.data || null
      setActiveDetail(data)
      setActiveReviewId(normalized)
      setParticipantUserIds(
        (Array.isArray(data?.participants) ? data.participants : [])
          .map((item) => Number(item?.user_id))
          .filter((item) => Number.isInteger(item) && item > 0),
      )
      form.setFieldsValue({
        overall_score: data?.overall_score ?? undefined,
        review_value_summary: data?.review_value_summary || '',
        review_benefit_result: data?.review_benefit_result || '',
        review_improvement_notes: data?.review_improvement_notes || '',
      })
    } catch (error) {
      message.error(error?.message || '获取复盘详情失败')
    }
  }, [form])

  useEffect(() => {
    if (!reviewIdFromRoute) {
      setActiveDetail(null)
      setActiveReviewId(null)
      return
    }
    loadDetail(reviewIdFromRoute)
  }, [loadDetail, reviewIdFromRoute])

  const handleSaveDraft = useCallback(async () => {
    if (!activeReviewId) return
    setSubmitting(true)
    try {
      const values = form.getFieldsValue()
      const result = await updateDemandValueReviewApi(activeReviewId, values)
      if (!result?.success) {
        message.error(result?.message || '保存草稿失败')
        return
      }
      message.success(result?.message || '草稿已保存')
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '保存草稿失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, form, loadDetail, loadRows, pagination.current, pagination.pageSize])

  const handleSubmit = useCallback(async () => {
    if (!activeReviewId) return
    try {
      const values = await form.validateFields([
        'overall_score',
        'review_value_summary',
        'review_benefit_result',
        'review_improvement_notes',
      ])
      setSubmitting(true)
      const result = await submitDemandValueReviewApi(activeReviewId, values)
      if (!result?.success) {
        message.error(result?.message || '提交复盘失败')
        return
      }
      message.success(result?.message || '复盘已提交')
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '提交复盘失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, form, loadDetail, loadRows, pagination.current, pagination.pageSize])

  const handleSkip = useCallback(async () => {
    if (!activeReviewId) return
    try {
      const values = await skipForm.validateFields()
      setSubmitting(true)
      const result = await skipDemandValueReviewApi(activeReviewId, values)
      if (!result?.success) {
        message.error(result?.message || '标记失败')
        return
      }
      message.success(result?.message || '已标记为无需复盘')
      setSkipModalOpen(false)
      skipForm.resetFields()
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '标记失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, loadDetail, loadRows, pagination.current, pagination.pageSize, skipForm])

  const handleUnskip = useCallback(async () => {
    if (!activeReviewId) return
    setSubmitting(true)
    try {
      const result = await unskipDemandValueReviewApi(activeReviewId)
      if (!result?.success) {
        message.error(result?.message || '撤销失败')
        return
      }
      message.success(result?.message || '已撤销无需复盘')
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '撤销失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, loadDetail, loadRows, pagination.current, pagination.pageSize])

  const handleSaveParticipants = useCallback(async () => {
    if (!activeReviewId) return
    const userIds = Array.from(
      new Set(
        (Array.isArray(participantUserIds) ? participantUserIds : [])
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    )
    if (userIds.length === 0) {
      message.warning('请至少选择一位复盘参与人')
      return
    }
    setSubmitting(true)
    try {
      const result = await updateDemandValueReviewParticipantsApi(activeReviewId, {
        participant_user_ids: userIds,
      })
      if (!result?.success) {
        message.error(result?.message || '更新参与人失败')
        return
      }
      message.success(result?.message || '复盘参与人已更新')
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '更新参与人失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, loadDetail, loadRows, pagination.current, pagination.pageSize, participantUserIds])

  const handleDeleteReview = useCallback(
    async (reviewId) => {
      const normalizedReviewId = Number(reviewId || 0)
      if (!Number.isInteger(normalizedReviewId) || normalizedReviewId <= 0) return
      setDeletingReviewId(normalizedReviewId)
      try {
        const result = await deleteDemandValueReviewApi(normalizedReviewId)
        if (!result?.success) {
          message.error(result?.message || '删除复盘失败')
          return
        }
        message.success(result?.message || '复盘任务已删除')
        if (reviewIdFromRoute === normalizedReviewId || activeReviewId === normalizedReviewId) {
          setActiveDetail(null)
          setActiveReviewId(null)
          navigate('/demand-value-reviews', { replace: true })
        }
        await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
      } catch (error) {
        message.error(error?.message || '删除复盘失败')
      } finally {
        setDeletingReviewId(0)
      }
    },
    [activeReviewId, loadRows, navigate, pagination.current, pagination.pageSize, reviewIdFromRoute],
  )

  const activeStatus = String(activeDetail?.status || '').toUpperCase()
  const canEdit = activeStatus === 'PENDING' || activeStatus === 'IN_REVIEW'
  const canReopen = activeStatus === 'COMPLETED'
  const canSkip = isAdmin && (activeStatus === 'PENDING' || activeStatus === 'IN_REVIEW')
  const canUnskip = isAdmin && activeStatus === 'SKIPPED'

  const handleReopenForEdit = useCallback(async () => {
    if (!activeReviewId) return
    setSubmitting(true)
    try {
      const result = await reopenDemandValueReviewApi(activeReviewId)
      if (!result?.success) {
        message.error(result?.message || '调整状态失败')
        return
      }
      message.success(result?.message || '已调整为复盘中')
      await loadDetail(activeReviewId)
      await loadRows({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '调整状态失败')
    } finally {
      setSubmitting(false)
    }
  }, [activeReviewId, loadDetail, loadRows, pagination.current, pagination.pageSize])

  const columns = useMemo(
    () => [
      {
        title: '需求ID',
        dataIndex: 'demand_id',
        key: 'demand_id',
        width: 120,
      },
      {
        title: '需求名称',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 320,
      },
      {
        title: '负责人',
        dataIndex: 'demand_owner_name',
        key: 'demand_owner_name',
        width: 120,
      },
      {
        title: '上线日期',
        dataIndex: 'demand_expected_release_date',
        key: 'demand_expected_release_date',
        width: 120,
        render: (value) => formatBeijingDate(value) || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value) => renderStatusTag(value),
      },
      {
        title: '价值评分',
        dataIndex: 'overall_score',
        key: 'overall_score',
        width: 100,
        sorter: true,
        sortOrder:
          sortBy === 'overall_score'
            ? sortOrder === 'asc'
              ? 'ascend'
              : 'descend'
            : null,
        render: (value) => (value === null || value === undefined ? '-' : value),
      },
      {
        title: '最近更新',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 160,
        render: (value) => formatBeijingDateTime(value),
      },
      {
        title: '操作',
        key: 'action',
        width: 260,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Button
              type="link"
              icon={record?.status === 'COMPLETED' ? <EyeOutlined /> : <EditOutlined />}
              onClick={() => navigate(`/demand-value-reviews/${record?.id}`)}
            >
              {record?.status === 'COMPLETED' ? '查看复盘' : '继续复盘'}
            </Button>
            {isAdmin ? (
              <Popconfirm
                title="确认删除该复盘任务？"
                description="删除后会清空该需求的复盘记录、参与人及待评价任务，且不可恢复。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteReview(record?.id)}
              >
                <Button
                  type="link"
                  danger
                  loading={deletingReviewId === Number(record?.id || 0)}
                >
                  删除
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [deletingReviewId, handleDeleteReview, isAdmin, navigate],
  )

  return (
    <div style={{ padding: 8 }}>
      {!reviewIdFromRoute ? (
        <Card
          size="small"
          title="需求价值复盘"
          extra={(
            <Button icon={<ReloadOutlined />} onClick={() => loadRows({ page: pagination.current, pageSize: pagination.pageSize })}>
              刷新
            </Button>
          )}
        >
          <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
            <Search
              allowClear
              placeholder="搜索需求ID或需求名称"
              style={{ width: 320 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={() => loadRows({ page: 1, pageSize: pagination.pageSize })}
            />
            <Select
              style={{ width: 180 }}
              options={STATUS_OPTIONS}
              value={status}
              onChange={(value) => {
                setStatus(value || '')
                setTimeout(() => {
                  loadRows({ page: 1, pageSize: pagination.pageSize })
                }, 0)
              }}
            />
            <Form form={form} component={false}>
              <Form.Item name="created_range" style={{ margin: 0 }}>
                <RangePicker
                  allowClear
                  onChange={() => {
                    loadRows({ page: 1, pageSize: pagination.pageSize })
                  }}
                />
              </Form.Item>
            </Form>
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            locale={{ emptyText: <Empty description="暂无复盘任务" /> }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextPageSize) => {
                loadRows({ page: nextPage, pageSize: nextPageSize })
              },
            }}
            onChange={(nextPagination, _filters, sorter) => {
              const sorterValue = Array.isArray(sorter) ? sorter[0] : sorter
              const field = String(sorterValue?.field || '').trim()
              const order = String(sorterValue?.order || '').trim()
              const nextSortBy = field === 'overall_score' && order ? 'overall_score' : ''
              const nextSortOrder = order === 'ascend' ? 'asc' : order === 'descend' ? 'desc' : ''
              setSortBy(nextSortBy)
              setSortOrder(nextSortOrder)
              loadRows({
                page: Number(nextPagination?.current || 1),
                pageSize: Number(nextPagination?.pageSize || pagination.pageSize),
              })
            }}
            scroll={{ x: 1300 }}
            size="middle"
          />
        </Card>
      ) : null}

      {reviewIdFromRoute ? (
        <Card
          size="small"
          style={{ marginTop: 0 }}
          title={activeDetail?.demand_name ? `复盘详情 - ${activeDetail.demand_name}` : '复盘详情'}
          extra={(
            <Space>
              <Button onClick={() => navigate('/demand-value-reviews')}>返回列表</Button>
              {isAdmin && activeReviewId ? (
                <Popconfirm
                  title="确认删除该复盘任务？"
                  description="删除后会清空该需求的复盘记录、参与人及待评价任务，且不可恢复。"
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeleteReview(activeReviewId)}
                >
                  <Button danger loading={deletingReviewId === activeReviewId}>删除复盘</Button>
                </Popconfirm>
              ) : null}
              {canSkip ? (
                <Button
                  icon={<CloseCircleOutlined />}
                  onClick={() => {
                    skipForm.resetFields()
                    setSkipModalOpen(true)
                  }}
                  loading={submitting}
                >
                  标记无需复盘
                </Button>
              ) : null}
              {canUnskip ? (
                <Popconfirm title="确认撤销“无需复盘”？" onConfirm={handleUnskip}>
                  <Button loading={submitting}>撤销无需复盘</Button>
                </Popconfirm>
              ) : null}
              {canReopen ? (
                <Popconfirm
                  title="确认调整为复盘中？"
                  description="调整后可重新编辑复盘信息并再次提交。"
                  onConfirm={handleReopenForEdit}
                >
                  <Button icon={<ReloadOutlined />} loading={submitting}>调整为复盘中</Button>
                </Popconfirm>
              ) : null}
              {canEdit ? (
                <Button onClick={handleSaveDraft} loading={submitting}>
                  保存草稿
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleSubmit}
                  loading={submitting}
                >
                  提交复盘
                </Button>
              ) : null}
            </Space>
          )}
        >
          {!activeDetail ? (
            <Empty description="暂无详情数据" />
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="需求ID">{activeDetail?.demand_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{renderStatusTag(activeDetail?.status)}</Descriptions.Item>
              <Descriptions.Item label="需求创建时间">
                {formatBeijingDateTime(activeDetail?.demand_created_at) || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="需求负责人">{activeDetail?.demand_owner_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="上线日期">
                {formatBeijingDate(activeDetail?.demand_expected_release_date) || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="工时条数">{activeDetail?.support?.log_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="关联缺陷数">{activeDetail?.support?.total_bug_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="实际总工时(h)">{activeDetail?.support?.total_actual_hours ?? 0}</Descriptions.Item>
              <Descriptions.Item label="需求业务价值预期" span={2}>
                <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  {String(activeDetail?.demand_business_value_expectation || '').trim() || '-'}
                </Paragraph>
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="价值评分与复盘记录">
              <Form form={form} layout="vertical" disabled={!canEdit}>
                <Form.Item
                  label="整体价值分（0-100）"
                  name="overall_score"
                  rules={[
                    { required: true, message: '请填写整体价值分' },
                    {
                      validator: async (_, value) => {
                        if (value === undefined || value === null || value === '') return
                        const num = Number(value)
                        if (!Number.isInteger(num) || num < 0 || num > 100) {
                          throw new Error('请填写 0-100 的整数')
                        }
                      },
                    },
                  ]}
                >
                  <InputNumber min={0} max={100} precision={0} style={{ width: 180 }} />
                </Form.Item>
                <Form.Item
                  label="价值结论"
                  name="review_value_summary"
                  rules={[{ required: true, message: '请填写价值结论' }]}
                >
                  <Input.TextArea rows={3} maxLength={10000} showCount />
                </Form.Item>
                <Form.Item
                  label="收益结果"
                  name="review_benefit_result"
                  rules={[{ required: true, message: '请填写收益结果' }]}
                >
                  <Input.TextArea rows={3} maxLength={10000} showCount />
                </Form.Item>
                <Form.Item
                  label="经验与改进点"
                  name="review_improvement_notes"
                  rules={[{ required: true, message: '请填写经验与改进点' }]}
                >
                  <Input.TextArea rows={3} maxLength={10000} showCount />
                </Form.Item>
                {activeStatus === 'SKIPPED' && activeDetail?.skip_reason ? (
                  <Form.Item label="无需复盘原因">
                    <Paragraph style={{ marginBottom: 0 }}>{activeDetail.skip_reason}</Paragraph>
                  </Form.Item>
                ) : null}
              </Form>
            </Card>

            <Card
              size="small"
              title="复盘参与人"
              extra={canEdit ? (
                <Button size="small" onClick={handleSaveParticipants} loading={submitting}>
                  保存参与人
                </Button>
              ) : null}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  disabled={!canEdit}
                  value={participantUserIds}
                  onChange={(next) => setParticipantUserIds(Array.isArray(next) ? next : [])}
                  options={participantOptions}
                  optionFilterProp="label"
                  placeholder="请选择复盘参与人"
                  style={{ width: '100%' }}
                />
                <Table
                  rowKey={(row) => String(row?.id || row?.user_id || Math.random())}
                  size="small"
                  pagination={false}
                  dataSource={Array.isArray(activeDetail?.participants) ? activeDetail.participants : []}
                  locale={{ emptyText: <Empty description="暂无参与人" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  columns={[
                    {
                      title: '参与人',
                      dataIndex: 'user_name',
                      key: 'user_name',
                      width: 140,
                      render: (_, row) => row?.user_name || `用户#${row?.user_id || '-'}`,
                    },
                    {
                      title: '完成度分',
                      dataIndex: 'completion_score',
                      key: 'completion_score',
                      width: 100,
                      render: (value) => (value === null || value === undefined ? '-' : value),
                    },
                    {
                      title: '价值分',
                      dataIndex: 'value_score',
                      key: 'value_score',
                      width: 100,
                      render: (value) => (value === null || value === undefined ? '-' : value),
                    },
                    {
                      title: '评分理由',
                      dataIndex: 'score_reason',
                      key: 'score_reason',
                      ellipsis: true,
                      render: (value) => value || '-',
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 100,
                      render: (value) => {
                        const normalized = String(value || '').toUpperCase()
                        return normalized === 'SUBMITTED' ? <Tag color="success">已提交</Tag> : <Tag>待提交</Tag>
                      },
                    },
                  ]}
                />
              </Space>
            </Card>

            <Card size="small" title="复盘记录">
              {Array.isArray(activeDetail?.logs) && activeDetail.logs.length > 0 ? (
                <Timeline
                  items={activeDetail.logs.map((log) => ({
                    children: (
                      <Space direction="vertical" size={0}>
                        <Text strong>
                          {log?.operator_name || `用户#${log?.operator_user_id || '-'}`} · {log?.action_type || '-'}
                        </Text>
                        <Text type="secondary">{formatBeijingDateTime(log?.created_at)}</Text>
                        <Text type="secondary">
                          {log?.from_status ? `${STATUS_TEXT[log.from_status] || log.from_status} -> ` : ''}
                          {log?.to_status ? STATUS_TEXT[log.to_status] || log.to_status : '-'}
                        </Text>
                        {log?.action_note ? <Text>{log.action_note}</Text> : null}
                      </Space>
                    ),
                  }))}
                />
              ) : (
                <Empty description="暂无操作日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>
            </Space>
          )}
        </Card>
      ) : null}

      <Modal
        title="标记为无需复盘"
        open={skipModalOpen}
        onCancel={() => setSkipModalOpen(false)}
        onOk={handleSkip}
        okText="确认标记"
        confirmLoading={submitting}
      >
        <Form form={skipForm} layout="vertical">
          <Form.Item
            label="无需复盘原因"
            name="skip_reason"
            rules={[{ required: true, message: '请填写无需复盘原因' }]}
          >
            <Input.TextArea rows={4} maxLength={10000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DemandValueReviewsPage
