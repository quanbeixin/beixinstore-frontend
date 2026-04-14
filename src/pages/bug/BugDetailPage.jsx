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
  Tabs,
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
  getBugAttachmentPolicyApi,
  getBugByIdApi,
  getBugWorkflowConfigApi,
  transitionBugApi,
  updateBugApi,
} from '../../api/bug'
import { BugFormModal, BugStatusFlow } from '../../modules/bug'
import { buildWorkflowTransitionMap, normalizeBugWorkflowTransitions } from '../../modules/bug/utils/workflow'
import { getCurrentUser, hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import './BugDetailPage.css'

const { Paragraph, Text, Title } = Typography
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i
const ACTION_ICON_MAP = Object.freeze({
  start: <SendOutlined />,
  fix: <CheckCircleOutlined />,
  verify: <CheckCircleOutlined />,
  reopen: <RedoOutlined />,
  reject: <StopOutlined />,
})

function toActionKey(value) {
  return String(value || '').trim().toLowerCase()
}

function buildTransitionActionId(transition = {}) {
  const actionKey = toActionKey(transition?.action_key)
  const fromStatus = String(transition?.from_status_code || '').trim().toUpperCase()
  const toStatus = String(transition?.to_status_code || '').trim().toUpperCase()
  return `${actionKey}:${fromStatus}:${toStatus}`
}

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

function extractClipboardFiles(clipboardData) {
  if (!clipboardData) return []
  const byItems = Array.from(clipboardData.items || [])
    .map((item) => (item?.kind === 'file' ? item.getAsFile?.() : null))
    .filter(Boolean)
  const byFiles = Array.from(clipboardData.files || []).filter(Boolean)
  const dedup = new Map()
  ;[...byFiles, ...byItems].forEach((file) => {
    const key = `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}|${file?.lastModified || 0}`
    if (!dedup.has(key)) dedup.set(key, file)
  })
  return Array.from(dedup.values())
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
  const [workflowTransitions, setWorkflowTransitions] = useState([])
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

  const loadWorkflowConfig = useCallback(async () => {
    try {
      const result = await getBugWorkflowConfigApi()
      if (!result?.success) {
        throw new Error(result?.message || '加载Bug流程配置失败')
      }
      const transitions = normalizeBugWorkflowTransitions(result?.data?.transitions || [])
      setWorkflowTransitions(transitions)
    } catch (error) {
      message.warning(error?.message || '加载Bug流程配置失败，已使用默认流程')
      setWorkflowTransitions(normalizeBugWorkflowTransitions([]))
    }
  }, [])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    loadWorkflowConfig()
  }, [loadWorkflowConfig])

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

  const workflowTransitionMap = useMemo(
    () => buildWorkflowTransitionMap(workflowTransitions),
    [workflowTransitions],
  )

  const transitionButtons = useMemo(() => {
    const status = String(detail?.status_code || '').toUpperCase()
    if (!canTransition) return []
    const transitions = workflowTransitionMap.get(status) || []
    const buttons = transitions.map((item, index) => {
      const actionKey = toActionKey(item?.action_key)
      return {
        key: `${buildTransitionActionId(item)}-${index}`,
        actionKey,
        actionId: buildTransitionActionId(item),
        label:
          String(item?.action_name || '').trim() ||
          String(item?.to_status_name || item?.to_status_code || actionKey || '流转'),
        icon: ACTION_ICON_MAP[actionKey] || <ReloadOutlined />,
        transition: item,
      }
    })

    return buttons.filter((item) => {
      if (item.actionKey === 'fix') return canSeeFixModule
      if (item.actionKey === 'verify') return canSeeVerifyModule
      return true
    })
  }, [canSeeFixModule, canSeeVerifyModule, canTransition, detail?.status_code, workflowTransitionMap])

  const transitionRequirementHints = useMemo(() => ({
    requireRemark: transitionButtons.some((item) => Number(item?.transition?.require_remark) === 1),
    requireFixSolution: transitionButtons.some((item) => Number(item?.transition?.require_fix_solution) === 1),
    requireVerifyResult: transitionButtons.some((item) => Number(item?.transition?.require_verify_result) === 1),
  }), [transitionButtons])

  const runTransition = async (button) => {
    try {
      const actionKey = toActionKey(button?.actionKey || button?.transition?.action_key)
      const transition = button?.transition || null
      if (!actionKey || !transition) {
        message.warning('当前流转动作无效，请刷新后重试')
        return
      }
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

      const requireRemark = Number(transition?.require_remark) === 1
      const requireFixSolution = Number(transition?.require_fix_solution) === 1
      const requireVerifyResult = Number(transition?.require_verify_result) === 1

      if (requireFixSolution && !fixSolution) {
        jumpToField('fix_solution', '修复方案&影响范围不能为空')
        message.warning('请先填写修复方案&影响范围，再执行当前操作')
        return
      }

      if (requireRemark && !remark) {
        jumpToField('remark', '备注不能为空')
        message.warning('请先填写备注，再执行当前操作')
        return
      }

      if (requireVerifyResult && !verifyResult) {
        jumpToField('verify_result', '验证结果不能为空')
        message.warning('请先填写验证结果，再执行当前操作')
        return
      }

      setActionLoading(buildTransitionActionId(transition))
      const toStatusCode = String(transition?.to_status_code || '').trim().toUpperCase()
      const result = await transitionBugApi(bugId, {
        action_key: actionKey,
        to_status_code: toStatusCode,
        remark,
        fix_solution: fixSolution,
        verify_result: verifyResult,
      })

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

  const uploadAttachmentFile = useCallback(async (file) => {
    const currentFile = file || null
    if (!currentFile) {
      throw new Error('附件文件无效')
    }
    const policyRes = await getBugAttachmentPolicyApi(bugId, {
      file_name: currentFile?.name || 'file',
      mime_type: currentFile?.type || '',
      file_size: currentFile?.size || 0,
    })
    if (!policyRes?.success) {
      throw new Error(policyRes?.message || '获取OSS上传策略失败')
    }

    const policy = policyRes.data || {}
    if (Number(policy.max_file_size || 0) > 0 && Number(currentFile?.size || 0) > Number(policy.max_file_size)) {
      throw new Error(`附件大小不能超过 ${Math.ceil(Number(policy.max_file_size) / 1024 / 1024)}MB`)
    }

    const formData = new FormData()
    Object.entries(policy.fields || {}).forEach(([key, value]) => {
      formData.append(key, value)
    })
    formData.append('file', currentFile)

    const uploadRes = await fetch(policy.host, {
      method: 'POST',
      body: formData,
    })

    if (!uploadRes.ok) {
      const uploadText = await uploadRes.text().catch(() => '')
      throw new Error(uploadText || `上传到OSS失败，状态码 ${uploadRes.status}`)
    }

    const registerRes = await createBugAttachmentApi(bugId, {
      file_name: currentFile?.name || 'file',
      file_ext: currentFile?.name?.includes('.') ? String(currentFile.name).split('.').pop() : '',
      file_size: currentFile?.size || 0,
      mime_type: currentFile?.type || '',
      storage_provider: 'ALIYUN_OSS',
      bucket_name: policy.bucket_name,
      object_key: policy.object_key,
      object_url: policy.object_url || '',
    })

    if (!registerRes?.success) {
      throw new Error(registerRes?.message || '附件登记失败')
    }

    return registerRes.data
  }, [bugId])

  const handleUpload = async ({ file, onSuccess, onError }) => {
    try {
      setUploading(true)
      const uploaded = await uploadAttachmentFile(file)
      message.success('附件上传成功')
      onSuccess?.(uploaded, file)
      await loadDetail()
    } catch (error) {
      message.error(error?.message || '附件上传失败')
      onError?.(error)
    } finally {
      setUploading(false)
    }
  }

  const handlePasteUpload = useCallback(async (event) => {
    if (!canUpdate || uploading) return
    const files = extractClipboardFiles(event?.clipboardData)
    if (files.length === 0) return

    event.preventDefault()
    setUploading(true)
    let successCount = 0
    const errors = []
    try {
      for (const file of files) {
        try {
          await uploadAttachmentFile(file)
          successCount += 1
        } catch (error) {
          errors.push(error?.message || '附件上传失败')
        }
      }

      if (successCount > 0) {
        await loadDetail()
        if (errors.length > 0) {
          message.warning(`截图粘贴上传完成：成功 ${successCount} 个，失败 ${errors.length} 个`)
        } else {
          message.success(`截图粘贴上传成功（${successCount} 个）`)
        }
        return
      }

      message.error(errors[0] || '截图粘贴上传失败')
    } finally {
      setUploading(false)
    }
  }, [canUpdate, loadDetail, uploadAttachmentFile, uploading])

  const handleUploadPasteFocus = useCallback((event) => {
    event?.currentTarget?.focus?.()
  }, [])

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

  const normalizedStatusLogs = useMemo(() => {
    const rows = Array.isArray(detail?.status_logs) ? detail.status_logs : []
    return rows.map((item) => {
      const fromStatusCode = String(item?.from_status_code || '').trim().toUpperCase()
      const toStatusCode = String(item?.to_status_code || '').trim().toUpperCase()
      const isCommentLog = Boolean(item?.remark) && fromStatusCode && fromStatusCode === toStatusCode
      return {
        ...item,
        __isCommentLog: isCommentLog,
      }
    })
  }, [detail?.status_logs])

  const commentLogs = useMemo(
    () => normalizedStatusLogs.filter((item) => Boolean(item?.__isCommentLog)),
    [normalizedStatusLogs],
  )

  const operationLogs = useMemo(
    () => normalizedStatusLogs.filter((item) => !item?.__isCommentLog),
    [normalizedStatusLogs],
  )

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

            <Card
              size="small"
              className="bug-detail-page__block bug-detail-page__block--main bug-detail-page__tabs-block"
              variant="borderless"
            >
              <Tabs
                className="bug-detail-page__content-tabs"
                items={[
                  {
                    key: 'detail',
                    label: '缺陷详情',
                    children: (
                      <div className="bug-detail-page__detail-tab-layout">
                        <div className="bug-detail-page__detail-main">
                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">状态流转</div>
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
                                      loading={actionLoading === item.actionId}
                                      onClick={() => runTransition(item)}
                                    >
                                      {item.label}
                                    </Button>
                                  ))}
                                </Space>
                              ) : null}
                            </div>
                          </div>

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">流转操作</div>
                            <Form form={remarkForm} layout="vertical" className="bug-detail-page__transition-form">
                              <Form.Item
                                label="备注"
                                name="remark"
                                required={transitionRequirementHints.requireRemark}
                                extra={transitionRequirementHints.requireRemark ? '当前可执行动作中存在备注必填项' : '可选，打回/重开可补充原因'}
                              >
                                <Input.TextArea rows={3} maxLength={20000} placeholder="打回、重开或处理说明可填写在这里" />
                              </Form.Item>
                              {canSeeFixModule ? (
                                <Form.Item
                                  label="修复方案&影响范围"
                                  name="fix_solution"
                                  required={transitionRequirementHints.requireFixSolution}
                                  extra={transitionRequirementHints.requireFixSolution ? '当前可执行动作中存在修复方案必填项' : '可选，建议记录修复方案'}
                                >
                                  <Input.TextArea rows={3} maxLength={20000} placeholder="请填写修复方案与影响范围" />
                                </Form.Item>
                              ) : null}
                              {canSeeVerifyModule ? (
                                <Form.Item
                                  label="验证结果"
                                  name="verify_result"
                                  required={transitionRequirementHints.requireVerifyResult}
                                  extra={
                                    transitionRequirementHints.requireVerifyResult
                                      ? '当前可执行动作中存在验证结果必填项'
                                      : '选填，建议补充验证说明'
                                  }
                                >
                                  <Input.TextArea rows={3} maxLength={20000} placeholder="描述验证结果" />
                                </Form.Item>
                              ) : null}
                            </Form>
                          </div>

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">问题描述</div>
                            <Descriptions column={1} size="small">
                              <Descriptions.Item label="描述">
                                <Paragraph className="bug-detail-page__description-content">{detail.description || '-'}</Paragraph>
                              </Descriptions.Item>
                              <Descriptions.Item label="复现环境">
                                <Paragraph>{detail.environment_info || '-'}</Paragraph>
                              </Descriptions.Item>
                            </Descriptions>
                          </div>

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">修复与验证</div>
                            <Descriptions column={1} size="small">
                              <Descriptions.Item label="修复方案&影响范围">
                                <Paragraph>{detail.fix_solution || '-'}</Paragraph>
                              </Descriptions.Item>
                              <Descriptions.Item label="验证结果">
                                <Paragraph>{detail.verify_result || '-'}</Paragraph>
                              </Descriptions.Item>
                            </Descriptions>
                          </div>

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-head">
                              <div className="bug-detail-page__tab-section-title">附件</div>
                              {canUpdate ? (
                                <div
                                  className="bug-detail-page__upload-entry"
                                  tabIndex={0}
                                  onClick={handleUploadPasteFocus}
                                  onPaste={(event) => {
                                    void handlePasteUpload(event)
                                  }}
                                >
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
                                  <Text type="secondary" className="bug-detail-page__upload-hint">
                                    点击后可直接粘贴截图上传（Ctrl/Cmd + V）
                                  </Text>
                                </div>
                              ) : null}
                            </div>
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
                          </div>
                        </div>

                        <div className="bug-detail-page__detail-side">
                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">基础字段</div>
                            <Descriptions
                              className="bug-detail-page__meta-descriptions"
                              column={1}
                              size="small"
                              layout="vertical"
                            >
                              <Descriptions.Item label="严重程度">
                                <Tag color={detail.severity_color || 'default'}>{detail.severity_name || detail.severity_code || '-'}</Tag>
                              </Descriptions.Item>
                              <Descriptions.Item label="Bug类型">{detail.bug_type_name || detail.bug_type_code || '-'}</Descriptions.Item>
                              <Descriptions.Item label="产品模块">{detail.product_name || detail.product_code || '-'}</Descriptions.Item>
                              <Descriptions.Item label="Bug阶段">{detail.issue_stage_name || detail.issue_stage || '-'}</Descriptions.Item>
                              <Descriptions.Item label="发现人">{detail.reporter_name || '-'}</Descriptions.Item>
                              <Descriptions.Item label="处理人">{detail.assignee_names || detail.assignee_name || '-'}</Descriptions.Item>
                              <Descriptions.Item label="关注人">{detail.watcher_names || '-'}</Descriptions.Item>
                              <Descriptions.Item label="关联需求">
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
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'comment',
                    label: '评论/备注',
                    children: (
                      <div className="bug-detail-page__tab-stack">
                        <div className="bug-detail-page__tab-section">
                          <div className="bug-detail-page__tab-section-title">发表评论</div>
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
                        </div>

                        <div className="bug-detail-page__tab-section">
                          <div className="bug-detail-page__tab-section-title">评论记录</div>
                          {commentLogs.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论记录" />
                          ) : (
                            <div className="bug-detail-page__log-list">
                              {commentLogs.map((item, index) => (
                                <div
                                  className="bug-detail-page__log-list-item"
                                  key={`comment-log-${item?.id || item?.created_at || 'comment'}-${index}`}
                                >
                                  <div className="bug-detail-page__log-item">
                                    <div className="bug-detail-page__log-main">
                                      <Text strong>{item.operator_name || '-'}</Text>
                                      <Text type="secondary">发表评论</Text>
                                    </div>
                                    <div className="bug-detail-page__log-time">{formatBeijingDateTime(item.created_at)}</div>
                                    {item.remark ? <div className="bug-detail-page__log-remark">{item.remark}</div> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'history',
                    label: '操作记录',
                    children: (
                      <div className="bug-detail-page__tab-stack">
                        <div className="bug-detail-page__tab-section">
                          {operationLogs.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无流转记录" />
                          ) : (
                            <div className="bug-detail-page__log-list">
                              {operationLogs.map((item, index) => (
                                <div
                                  className="bug-detail-page__log-list-item"
                                  key={`status-log-${item?.id || item?.created_at || 'status'}-${index}`}
                                >
                                  <div className="bug-detail-page__log-item">
                                    <div className="bug-detail-page__log-main">
                                      <Text strong>{item.operator_name || '-'}</Text>
                                      <Text type="secondary">
                                        {`${item.from_status_name || item.from_status_code || '初始'} -> ${
                                          item.to_status_name || item.to_status_code || '-'
                                        }`}
                                      </Text>
                                    </div>
                                    <div className="bug-detail-page__log-time">{formatBeijingDateTime(item.created_at)}</div>
                                    {item.remark ? <div className="bug-detail-page__log-remark">{item.remark}</div> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>

            <BugFormModal
              open={editOpen}
              title="编辑Bug"
              submitText="保存"
              presentation="drawer"
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
