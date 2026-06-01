import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMyDemandValueReviewDetailApi,
  getMyPendingDemandValueReviewsApi,
  submitMyDemandValueReviewApi,
} from '../../api/work'
import { formatBeijingDate } from '../../utils/datetime'

const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function MyDemandValueReviewsPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [valueReviewModalOpen, setValueReviewModalOpen] = useState(false)
  const [valueReviewSubmitting, setValueReviewSubmitting] = useState(false)
  const [activeValueReviewDetail, setActiveValueReviewDetail] = useState(null)

  const loadMyPendingReviews = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getMyPendingDemandValueReviewsApi({ page: 1, pageSize: 100 })
      if (!result?.success) {
        message.error(result?.message || '获取待我复盘评价任务失败')
        setRows([])
        return
      }
      setRows(Array.isArray(result?.data?.list) ? result.data.list : [])
    } catch (error) {
      message.error(error?.message || '获取待我复盘评价任务失败')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMyPendingReviews()
  }, [loadMyPendingReviews])

  const openValueReviewModal = useCallback(async (review) => {
    const reviewId = Number(review?.review_id || review?.id)
    if (!Number.isInteger(reviewId) || reviewId <= 0) return
    try {
      const result = await getMyDemandValueReviewDetailApi(reviewId)
      if (!result?.success) {
        message.error(result?.message || '获取复盘任务详情失败')
        return
      }
      setActiveValueReviewDetail(result?.data || null)
      setValueReviewModalOpen(true)
    } catch (error) {
      message.error(error?.message || '获取复盘任务详情失败')
    }
  }, [])

  const closeValueReviewModal = useCallback(() => {
    if (valueReviewSubmitting) return
    setValueReviewModalOpen(false)
    setActiveValueReviewDetail(null)
  }, [valueReviewSubmitting])

  const handleEditMyValueReviewField = useCallback((field, value) => {
    setActiveValueReviewDetail((prev) => {
      if (!prev) return prev
      const myParticipantId = Number(prev?.my_participant?.id)
      const participants = (Array.isArray(prev?.participants) ? prev.participants : []).map((item) => {
        if (Number(item?.id) !== myParticipantId) return item
        return {
          ...item,
          [field]: value,
        }
      })
      return {
        ...prev,
        participants,
      }
    })
  }, [])

  const handleSubmitValueReview = useCallback(async () => {
    const reviewId = Number(activeValueReviewDetail?.id)
    if (!Number.isInteger(reviewId) || reviewId <= 0) return
    const myParticipant = activeValueReviewDetail?.my_participant || {}
    const currentMy = (Array.isArray(activeValueReviewDetail?.participants) ? activeValueReviewDetail.participants : [])
      .find((item) => Number(item?.id) === Number(myParticipant?.id))
    const completionScore = currentMy?.completion_score
    const valueScore = currentMy?.value_score
    const scoreReason = String(currentMy?.score_reason || '').trim()
    if (!Number.isInteger(Number(completionScore)) || !Number.isInteger(Number(valueScore)) || !scoreReason) {
      message.warning('请先补全我的完成度评分、价值评分和评分理由')
      return
    }
    setValueReviewSubmitting(true)
    try {
      const result = await submitMyDemandValueReviewApi(reviewId, {
        completion_score: Number(completionScore),
        value_score: Number(valueScore),
        score_reason: scoreReason,
      })
      if (!result?.success) {
        message.error(result?.message || '提交复盘评价失败')
        return
      }
      message.success(result?.message || '复盘评价已提交')
      setActiveValueReviewDetail(result?.data || null)
      await loadMyPendingReviews()
    } catch (error) {
      message.error(error?.message || '提交复盘评价失败')
    } finally {
      setValueReviewSubmitting(false)
    }
  }, [activeValueReviewDetail, loadMyPendingReviews])

  const columns = useMemo(
    () => [
      {
        title: '需求ID',
        dataIndex: 'demand_id',
        key: 'demand_id',
        width: 140,
      },
      {
        title: '需求名称',
        dataIndex: 'demand_name',
        key: 'demand_name',
        ellipsis: true,
      },
      {
        title: '上线日期',
        dataIndex: 'demand_expected_release_date',
        key: 'demand_expected_release_date',
        width: 130,
        render: (value) => formatBeijingDate(value),
      },
      {
        title: '提交进度',
        key: 'participant_stats',
        width: 130,
        render: (_, row) => {
          const stats = row?.participant_stats || {}
          return `${toNumber(stats.submitted, 0)}/${toNumber(stats.total, 0)}`
        },
      },
      {
        title: '我的状态',
        dataIndex: 'participant_status',
        key: 'participant_status',
        width: 110,
        render: (value) => String(value || '').toUpperCase() === 'SUBMITTED'
          ? <Tag color="success">已提交</Tag>
          : <Tag color="warning">待提交</Tag>,
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        render: (_, row) => (
          <Button type="link" onClick={() => openValueReviewModal(row)}>
            去评价
          </Button>
        ),
      },
    ],
    [openValueReviewModal],
  )

  return (
    <div style={{ padding: 12 }}>
      <Card
        title="待我复盘评价"
        variant="borderless"
        extra={<Tag color="blue">共 {rows.length} 条</Tag>}
      >
        {rows.length > 0 ? (
          <Table
            rowKey={(row) => `${row?.review_id || ''}-${row?.participant_id || ''}`}
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={false}
          />
        ) : (
          <Empty description="暂无待我复盘评价任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <Modal
        title={activeValueReviewDetail?.demand_name ? `复盘评价：${activeValueReviewDetail.demand_name}` : '复盘评价'}
        open={valueReviewModalOpen}
        onCancel={closeValueReviewModal}
        onOk={handleSubmitValueReview}
        okText="提交我的评价"
        confirmLoading={valueReviewSubmitting}
        width={920}
        destroyOnHidden
      >
        {!activeValueReviewDetail ? (
          <Empty description="暂无复盘数据" />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="评分说明"
              description="你可以反复修改并提交，直到管理员完成复盘。下方可查看所有参与人的评价。"
            />
            <Card size="small" title="我的评价">
              {(() => {
                const myParticipantId = Number(activeValueReviewDetail?.my_participant?.id)
                const myParticipant = (Array.isArray(activeValueReviewDetail?.participants)
                  ? activeValueReviewDetail.participants
                  : []).find((item) => Number(item?.id) === myParticipantId)
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    <div>
                      <Text type="secondary">完成度评分（0-100）</Text>
                      <InputNumber
                        min={0}
                        max={100}
                        precision={0}
                        style={{ width: '100%', marginTop: 6 }}
                        value={myParticipant?.completion_score ?? undefined}
                        onChange={(next) => handleEditMyValueReviewField('completion_score', next)}
                      />
                    </div>
                    <div>
                      <Text type="secondary">价值评分（0-100）</Text>
                      <InputNumber
                        min={0}
                        max={100}
                        precision={0}
                        style={{ width: '100%', marginTop: 6 }}
                        value={myParticipant?.value_score ?? undefined}
                        onChange={(next) => handleEditMyValueReviewField('value_score', next)}
                      />
                    </div>
                    <div>
                      <Text type="secondary">当前状态</Text>
                      <div style={{ marginTop: 6 }}>
                        {String(myParticipant?.status || '').toUpperCase() === 'SUBMITTED'
                          ? <Tag color="success">已提交</Tag>
                          : <Tag color="warning">待提交</Tag>}
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Text type="secondary">评分理由</Text>
                      <Input.TextArea
                        rows={4}
                        maxLength={10000}
                        showCount
                        style={{ marginTop: 6 }}
                        value={String(myParticipant?.score_reason || '')}
                        onChange={(event) => handleEditMyValueReviewField('score_reason', event?.target?.value || '')}
                        placeholder="请结合需求完成情况和实际收益说明你的评分理由"
                      />
                    </div>
                  </div>
                )
              })()}
            </Card>

            <Card size="small" title="参与人评价总览">
              <Table
                rowKey={(row) => String(row?.id || row?.user_id || '')}
                size="small"
                pagination={false}
                dataSource={Array.isArray(activeValueReviewDetail?.participants) ? activeValueReviewDetail.participants : []}
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
                    width: 420,
                    render: (value) => (
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                        {value || '-'}
                      </div>
                    ),
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 100,
                    render: (value) => String(value || '').toUpperCase() === 'SUBMITTED'
                      ? <Tag color="success">已提交</Tag>
                      : <Tag color="warning">待提交</Tag>,
                  },
                ]}
              />
            </Card>
          </Space>
        )}
      </Modal>
    </div>
  )
}

export default MyDemandValueReviewsPage
