import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  RedoOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createBugAttachmentApi,
  getBugAssigneesApi,
  createBugCommentApi,
  deleteBugAttachmentApi,
  deleteBugApi,
  fixBugApi,
  getBugAttachmentPolicyApi,
  getBugByIdApi,
  rejectBugApi,
  reopenBugApi,
  startBugApi,
  updateBugApi,
  verifyBugApi,
} from '../../api/bug'
import { BugFormModal, BugStatusFlow } from '../../modules/bug'
import { getCurrentUser, hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import './BugDetailPage.css'

const { Paragraph, Text, Title } = Typography
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i

function getAttachmentUrl(row) {
  return String(row?.download_url || row?.object_url || '').trim()
}

function isImageAttachment(row) {
  const mimeType = String(row?.mime_type || '').trim().toLowerCase()
  if (mimeType.startsWith('image/')) return true

  const fileExt = String(row?.file_ext || '').trim().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(fileExt)) return true

  const fileName = String(row?.file_name || '').trim()
  const objectUrl = getAttachmentUrl(row)
  return IMAGE_EXT_PATTERN.test(fileName) || IMAGE_EXT_PATTERN.test(objectUrl)
}

function BugDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const bugId = Number(id)
  const currentUserId = Number(getCurrentUser()?.id || 0)
  const canUpdate = hasPermission('bug.update')
  const canTransition = hasPermission('bug.transition')
  const canDelete = hasPermission('bug.delete')
  const canManageAllFields = hasPermission('bug.manage')

  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [remarkForm] = Form.useForm()
  const [commentForm] = Form.useForm()
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [mentionUserOptions, setMentionUserOptions] = useState([])
  const [mentionUserLoading, setMentionUserLoading] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!bugId) return
    setLoading(true)
    try {
      const result = await getBugByIdApi(bugId)
      if (!result?.success) {
        message.error(result?.message || '获取Bug详情失败')
        return
      }
      setDetail(result.data || null)
    } catch (error) {
      message.error(error?.message || '获取Bug详情失败')
    } finally {
      setLoading(false)
    }
  }, [bugId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!detail) return
    remarkForm.setFieldsValue({
      remark: '',
      fix_solution: detail?.fix_solution || '',
      verify_result: detail?.verify_result || '',
    })
  }, [detail, remarkForm])

  const loadMentionUserOptions = useCallback(async () => {
    setMentionUserLoading(true)
    try {
      const result = await getBugAssigneesApi({
        demand_id: detail?.demand_id || undefined,
      })
      const rows = Array.isArray(result?.data) ? result.data : []
      const options = rows
        .map((item) => {
          const userId = Number(item?.id || 0)
          if (!userId) return null
          const realName = String(item?.name || '').trim()
          const username = String(item?.username || '').trim()
          const displayName = realName || username || `用户${userId}`
          return {
            value: userId,
            label: username && username !== displayName ? `${displayName} (${username})` : displayName,
            searchText: `${displayName} ${username}`.trim(),
          }
        })
        .filter(Boolean)
      setMentionUserOptions(options)
    } catch (error) {
      console.warn('加载评论可@人员失败:', error?.message || error)
    } finally {
      setMentionUserLoading(false)
    }
  }, [detail?.demand_id])

  useEffect(() => {
    loadMentionUserOptions()
  }, [loadMentionUserOptions])

  const isCurrentUserReporter = useMemo(
    () => currentUserId > 0 && Number(detail?.reporter_id || 0) === currentUserId,
    [currentUserId, detail?.reporter_id],
  )

  const isCurrentUserAssignee = useMemo(() => {
    if (currentUserId <= 0) return false
    const assigneeIds = Array.isArray(detail?.assignee_ids) ? detail.assignee_ids : []
    if (assigneeIds.some((item) => Number(item) === currentUserId)) return true
    return Number(detail?.assignee_id || 0) === currentUserId
  }, [currentUserId, detail?.assignee_id, detail?.assignee_ids])

  const canSeeFixModule = canManageAllFields || isCurrentUserAssignee
  const canSeeVerifyModule = canManageAllFields || isCurrentUserReporter

  const transitionButtons = useMemo(() => {
    const status = String(detail?.status_code || '').toUpperCase()
    if (!canTransition) return []
    let buttons = []
    if (status === 'NEW') {
      buttons = [{ key: 'start', label: '开始处理', icon: <SendOutlined /> }]
    } else if (status === 'PROCESSING') {
      buttons = [
        { key: 'fix', label: '修复完成', icon: <CheckCircleOutlined /> },
        { key: 'reject', label: '打回', icon: <StopOutlined /> },
      ]
    } else if (status === 'FIXED') {
      buttons = [
        { key: 'verify', label: '验证通过', icon: <CheckCircleOutlined /> },
        { key: 'reopen', label: '重新打开', icon: <RedoOutlined /> },
      ]
    } else if (status === 'CLOSED') {
      buttons = [{ key: 'reopen', label: '重新打开', icon: <RedoOutlined /> }]
    } else if (status === 'REOPENED') {
      buttons = [{ key: 'start', label: '重新处理', icon: <ReloadOutlined /> }]
    }

    return buttons.filter((item) => {
      if (item.key === 'fix') return canSeeFixModule
      if (item.key === 'verify') return canSeeVerifyModule
      return true
    })
  }, [detail?.status_code, canTransition, canSeeFixModule, canSeeVerifyModule])

  const runTransition = async (actionKey) => {
    try {
      const values = await remarkForm.validateFields()
      const remark = String(values.remark || '').trim()
      const fixSolution = String(values.fix_solution || '').trim()
      const verifyResult = String(values.verify_result || '').trim()

      const jumpToField = (name, errorText) => {
        remarkForm.setFields([{ name, errors: [errorText] }])
        try {
          remarkForm.scrollToField(name, { block: 'center', behavior: 'smooth' })
        } catch {
          // noop
        }
      }

      if (actionKey === 'fix' && !fixSolution) {
        jumpToField('fix_solution', '修复方案&影响范围不能为空')
        message.warning('请先填写修复方案&影响范围，再执行“修复完成”')
        return
      }

      if ((actionKey === 'reopen' || actionKey === 'reject') && !remark) {
        jumpToField('remark', '备注不能为空')
        message.warning('请先填写备注，再执行当前操作')
        return
      }

      setActionLoading(actionKey)
      let result = null

      if (actionKey === 'start') {
        result = await startBugApi(bugId, { remark })
      } else if (actionKey === 'fix') {
        result = await fixBugApi(bugId, {
          remark,
          fix_solution: fixSolution,
        })
      } else if (actionKey === 'verify') {
        result = await verifyBugApi(bugId, {
          remark,
          verify_result: verifyResult,
        })
      } else if (actionKey === 'reopen') {
        result = await reopenBugApi(bugId, {
          remark,
          verify_result: verifyResult,
        })
      } else if (actionKey === 'reject') {
        result = await rejectBugApi(bugId, { remark })
      }

      if (!result?.success) {
        message.error(result?.message || '操作失败')
        return
      }

      message.success(result?.message || '操作成功')
      remarkForm.resetFields()
      await loadDetail()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '操作失败')
    } finally {
      setActionLoading('')
    }
  }

  const attachmentColumns = [
    {
      title: '缩略图',
      key: 'preview',
      width: 90,
      render: (_, row) => {
        const objectUrl = getAttachmentUrl(row)
        if (!objectUrl || !isImageAttachment(row)) return '-'
        return (
          <Image
            className="bug-detail-page__attachment-thumbnail"
            src={objectUrl}
            alt={row?.file_name || '附件缩略图'}
            width={56}
            height={56}
          />
        )
      },
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (value, row) => {
        const fileName = value || '-'
        const downloadUrl = String(row?.download_file_url || '').trim() || getAttachmentUrl(row)
        if (!downloadUrl) return fileName
        return (
          <Space size={6}>
            <span>{fileName}</span>
            <a href={downloadUrl} target="_blank" rel="noreferrer" title="下载附件" onClick={(event) => event.stopPropagation()}>
              <Button type="text" size="small" icon={<DownloadOutlined />} style={{ paddingInline: 4, height: 22 }} />
            </a>
          </Space>
        )
      },
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (value) => (value ? `${Math.round(Number(value) / 1024)} KB` : '-'),
    },
    {
      title: '上传人',
      dataIndex: 'uploaded_by_name',
      key: 'uploaded_by_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    ...(canUpdate
      ? [
          {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_, row) => (
              <Popconfirm
                title="确认删除该附件？"
                onConfirm={async () => {
                  try {
                    setDeletingAttachmentId(Number(row.id))
                    const result = await deleteBugAttachmentApi(bugId, row.id)
                    if (!result?.success) {
                      message.error(result?.message || '附件删除失败')
                      return
                    }
                    message.success('附件删除成功')
                    await loadDetail()
                  } catch (error) {
                    message.error(error?.message || '附件删除失败')
                  } finally {
                    setDeletingAttachmentId(0)
                  }
                }}
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  loading={deletingAttachmentId === Number(row.id)}
                  style={{ paddingInline: 0 }}
                >
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  const handleUpload = async ({ file, onSuccess, onError }) => {
    try {
      setUploading(true)
      const policyRes = await getBugAttachmentPolicyApi(bugId, {
        file_name: file?.name || 'file',
        mime_type: file?.type || '',
        file_size: file?.size || 0,
      })
      if (!policyRes?.success) {
        throw new Error(policyRes?.message || '获取OSS上传策略失败')
      }

      const policy = policyRes.data || {}
      if (Number(policy.max_file_size || 0) > 0 && Number(file?.size || 0) > Number(policy.max_file_size)) {
        throw new Error(`附件大小不能超过 ${Math.ceil(Number(policy.max_file_size) / 1024 / 1024)}MB`)
      }

      const formData = new FormData()
      Object.entries(policy.fields || {}).forEach(([key, value]) => {
        formData.append(key, value)
      })
      formData.append('file', file)

      const uploadRes = await fetch(policy.host, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const uploadText = await uploadRes.text().catch(() => '')
        throw new Error(uploadText || `上传到OSS失败，状态码 ${uploadRes.status}`)
      }

      const registerRes = await createBugAttachmentApi(bugId, {
        file_name: file?.name || 'file',
        file_ext: file?.name?.includes('.') ? String(file.name).split('.').pop() : '',
        file_size: file?.size || 0,
        mime_type: file?.type || '',
        storage_provider: 'ALIYUN_OSS',
        bucket_name: policy.bucket_name,
        object_key: policy.object_key,
        object_url: policy.object_url || '',
      })

      if (!registerRes?.success) {
        throw new Error(registerRes?.message || '附件登记失败')
      }

      message.success('附件上传成功')
      onSuccess?.(registerRes.data, file)
      await loadDetail()
    } catch (error) {
      message.error(error?.message || '附件上传失败')
      onError?.(error)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmitComment = async () => {
    try {
      const values = await commentForm.validateFields()
      const comment = String(values.comment || '').trim()
      const mentionUserId = Number(values.mention_user_id || 0) || null
      if (!comment) {
        message.warning('评论内容不能为空')
        return
      }

      setCommentSubmitting(true)
      const result = await createBugCommentApi(bugId, {
        comment,
        mention_user_id: mentionUserId,
      })
      if (!result?.success) {
        message.error(result?.message || '评论发送失败')
        return
      }
      message.success(result?.message || '评论已发布')
      commentForm.resetFields()
      await loadDetail()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '评论发送失败')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const statusLogs = Array.isArray(detail?.status_logs) ? detail.status_logs : []

  if (!bugId) {
    return (
      <div style={{ padding: 12 }}>
        <Alert type="error" title="Bug ID 无效" />
      </div>
    )
  }

  return (
    <div className="bug-detail-page">
      <Card loading={loading} variant="borderless" className="bug-detail-page__shell">
        {detail ? (
          <>
            <div className="bug-detail-page__head">
              <div className="bug-detail-page__head-left">
                <Space size={8} align="center" wrap>
                  <Button
                    type="text"
                    className="bug-detail-page__back-btn"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                  >
                    返回
                  </Button>
                  <Tag color="blue" className="bug-detail-page__bug-no">
                    {detail.bug_no || '-'}
                  </Tag>
                  <Title level={4} style={{ margin: 0 }} className="bug-detail-page__title">
                    {detail.title || '-'}
                  </Title>
                  <Tag color={detail.status_color || 'default'} className="bug-detail-page__status-tag">
                    {detail.status_name || detail.status_code}
                  </Tag>
                </Space>
              </div>
              <Space size={8} wrap className="bug-detail-page__head-actions">
                {canUpdate ? (
                  <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                    编辑
                  </Button>
                ) : null}
                {canDelete ? (
                  <Popconfirm title="确认删除该Bug？" onConfirm={async () => {
                    try {
                      const result = await deleteBugApi(bugId)
                      if (!result?.success) {
                        message.error(result?.message || '删除失败')
                        return
                      }
                      message.success('Bug删除成功')
                      navigate('/bugs')
                    } catch (error) {
                      message.error(error?.message || '删除失败')
                    }
                  }}>
                    <Button danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            </div>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="状态流转">
              <div className="bug-detail-page__status-row">
                <div className="bug-detail-page__status-flow">
                  <BugStatusFlow currentStatus={detail.status_code} />
                </div>
                {transitionButtons.length ? (
                  <Space size={8} wrap className="bug-detail-page__status-actions">
                    {transitionButtons.map((item) => (
                      <Button
                        key={item.key}
                        type="primary"
                        className="bug-detail-page__status-action-btn"
                        icon={item.icon}
                        loading={actionLoading === item.key}
                        onClick={() => runTransition(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </Space>
                ) : null}
              </div>
            </Card>

            <div className="bug-detail-page__grid">
              <Card size="small" className="bug-detail-page__block" variant="borderless" title="基本信息">
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="严重程度">
                    <Tag color={detail.severity_color || 'default'}>{detail.severity_name || detail.severity_code || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Bug类型">{detail.bug_type_name || detail.bug_type_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="产品模块">{detail.product_name || detail.product_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Bug阶段">{detail.issue_stage_name || detail.issue_stage || '-'}</Descriptions.Item>
                  <Descriptions.Item label="发现人" span={2}>{detail.reporter_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="处理人" span={2}>{detail.assignee_names || detail.assignee_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="关注人" span={2}>{detail.watcher_names || '-'}</Descriptions.Item>
                  <Descriptions.Item label="关联需求" span={2}>
                    {detail.demand_id ? (
                      <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/work-demands/${detail.demand_id}`)}>
                        {detail.demand_name || detail.demand_id}
                      </Button>
                    ) : (
                      '-'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">{formatBeijingDateTime(detail.created_at)}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{formatBeijingDateTime(detail.updated_at)}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card size="small" className="bug-detail-page__block" variant="borderless" title="流转操作">
                <Form form={remarkForm} layout="vertical">
                  <Form.Item label="备注" name="remark">
                    <Input.TextArea rows={3} maxLength={20000} placeholder="打回、重开或处理说明可填写在这里" />
                  </Form.Item>
                  {canSeeFixModule ? (
                    <Form.Item
                      label="修复方案&影响范围"
                      name="fix_solution"
                      required
                      extra="执行“修复完成”时必填"
                    >
                      <Input.TextArea rows={3} maxLength={20000} placeholder="请填写修复方案&影响范围（必填）" />
                    </Form.Item>
                  ) : null}
                  {canSeeVerifyModule ? (
                    <Form.Item
                      label="验证结果"
                      name="verify_result"
                      extra="执行“验证通过”时选填；重新打开建议填写"
                    >
                      <Input.TextArea rows={3} maxLength={20000} placeholder="描述验证结果" />
                    </Form.Item>
                  ) : null}

                </Form>
              </Card>
            </div>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="问题描述">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Bug描述">
                  <Paragraph>{detail.description || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="重现步骤">
                  <Paragraph>{detail.reproduce_steps || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="预期结果">
                  <Paragraph>{detail.expected_result || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="实际结果">
                  <Paragraph>{detail.actual_result || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="复现环境">
                  <Paragraph>{detail.environment_info || '-'}</Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="修复与验证">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="修复方案&影响范围">
                  <Paragraph>{detail.fix_solution || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="验证结果">
                  <Paragraph>{detail.verify_result || '-'}</Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="评论通知">
              <Form form={commentForm} layout="vertical">
                <Form.Item
                  label="评论内容"
                  name="comment"
                  rules={[{ required: true, message: '请输入评论内容' }]}
                >
                  <Input.TextArea rows={3} maxLength={20000} placeholder="输入评论内容，可选择@某人并发送通知" />
                </Form.Item>
                <Form.Item label="@某人（可选）" name="mention_user_id">
                  <Select
                    showSearch
                    allowClear
                    placeholder="选择需要通知的人员"
                    options={mentionUserOptions}
                    loading={mentionUserLoading}
                    filterOption={(input, option) => pinyinSelectFilter(input, option)}
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Button type="primary" onClick={handleSubmitComment} loading={commentSubmitting}>
                  发表评论并通知
                </Button>
              </Form>
            </Card>

            <Card
              size="small"
              className="bug-detail-page__block"
              variant="borderless"
              title="附件"
              extra={
                canUpdate ? (
                  <Upload
                    showUploadList={false}
                    customRequest={handleUpload}
                    disabled={uploading}
                    multiple={false}
                    maxCount={1}
                  >
                    <Button size="small" loading={uploading}>
                      上传附件
                    </Button>
                  </Upload>
                ) : null
              }
            >
              <Table
                rowKey="id"
                size="small"
                columns={attachmentColumns}
                dataSource={detail.attachments || []}
                pagination={false}
                locale={{
                  emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前暂无附件" />,
                }}
              />
            </Card>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="状态变更历史">
              {statusLogs.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无流转记录" />
              ) : (
                <div className="bug-detail-page__log-list">
                  {statusLogs.map((item, index) => (
                    <div
                      className="bug-detail-page__log-list-item"
                      key={`${item?.id || item?.created_at || 'status-log'}-${index}`}
                    >
                      <div className="bug-detail-page__log-item">
                        {(() => {
                          const fromStatusCode = String(item?.from_status_code || '').trim().toUpperCase()
                          const toStatusCode = String(item?.to_status_code || '').trim().toUpperCase()
                          const isCommentLog = Boolean(item?.remark) && fromStatusCode && fromStatusCode === toStatusCode
                          return (
                            <>
                              <div className="bug-detail-page__log-main">
                                <Text strong>{item.operator_name || '-'}</Text>
                                <Text type="secondary">
                                  {isCommentLog
                                    ? '发表评论'
                                    : `${item.from_status_name || item.from_status_code || '初始'} -> ${
                                        item.to_status_name || item.to_status_code || '-'
                                      }`}
                                </Text>
                              </div>
                              <div className="bug-detail-page__log-time">{formatBeijingDateTime(item.created_at)}</div>
                              {item.remark ? <div className="bug-detail-page__log-remark">{item.remark}</div> : null}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <BugFormModal
              open={editOpen}
              title="编辑Bug"
              submitText="保存"
              initialValues={detail}
              showDraftAttachments={false}
              onCancel={() => setEditOpen(false)}
              onSubmit={async (values) => {
                const result = await updateBugApi(bugId, values)
                if (!result?.success) {
                  message.error(result?.message || '更新失败')
                  return
                }
                message.success('Bug更新成功')
                setEditOpen(false)
                await loadDetail()
              }}
            />
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bug不存在或已被删除" />
        )}
      </Card>
    </div>
  )
}

export default BugDetailPage
