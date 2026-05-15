import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  EditOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PlayCircleOutlined,
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
  Modal,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
  updateBugCommentApi,
  updateBugApi,
} from '../../api/bug'
import { BugFormModal, BugStatusFlow } from '../../modules/bug'
import { precheckDraftAttachment, uploadCommentDraftAttachments } from '../../modules/bug/utils/attachmentUpload'
import {
  hydrateBugDescriptionAttachmentUrls,
  isProbablyHtml,
  plainTextToRichTextHtml,
  sanitizeBugDescriptionHtml,
} from '../../modules/bug/utils/descriptionRichText'
import { buildWorkflowTransitionMap, normalizeBugWorkflowTransitions } from '../../modules/bug/utils/workflow'
import { getCurrentUser, hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { pinyinSelectFilter } from '../../utils/selectSearch'
import './BugDetailPage.css'

const { Paragraph, Text, Title } = Typography
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(\?.*)?$/i
const VIDEO_EXT_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i
const OSS_UPLOAD_TIMEOUT_MS = 120000
const OSS_UPLOAD_MAX_ATTEMPTS = 2
const OSS_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
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

function isNoFixTransition(transition = {}, actionKey = '') {
  const toStatus = String(transition?.to_status_code || '').trim().toUpperCase()
  const normalizedActionKey = toActionKey(actionKey || transition?.action_key)
  if (toStatus === 'NO_FIX') return true
  return normalizedActionKey === 'no_fix' || normalizedActionKey === 'no-fix' || normalizedActionKey === 'nofix'
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

function isVideoAttachment(row) {
  const mimeType = String(row?.mime_type || '').trim().toLowerCase()
  if (mimeType.startsWith('video/')) return true

  const fileExt = String(row?.file_ext || '').trim().toLowerCase()
  if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(fileExt)) return true

  const fileName = String(row?.file_name || '').trim()
  const objectUrl = getAttachmentUrl(row)
  return VIDEO_EXT_PATTERN.test(fileName) || VIDEO_EXT_PATTERN.test(objectUrl)
}

function extractClipboardFiles(clipboardData) {
  if (!clipboardData) return []
  const byItems = Array.from(clipboardData.items || [])
    .map((item) => (item?.kind === 'file' ? item.getAsFile?.() : null))
    .filter(Boolean)
  const byFiles = Array.from(clipboardData.files || []).filter(Boolean)
  const dedup = new Map()
  ;[...byFiles, ...byItems].forEach((file) => {
    const key = `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}`
    if (!dedup.has(key)) dedup.set(key, file)
  })
  return Array.from(dedup.values())
}

function isImageFile(file) {
  const mimeType = String(file?.type || file?.originFileObj?.type || '').toLowerCase()
  if (mimeType.startsWith('image/')) return true

  const fileName = String(file?.name || file?.fileName || file?.originFileObj?.name || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(fileName)
}

function isVideoFile(file) {
  const mimeType = String(file?.type || file?.originFileObj?.type || '').toLowerCase()
  if (mimeType.startsWith('video/')) return true

  const fileName = String(file?.name || file?.fileName || file?.originFileObj?.name || '').toLowerCase()
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(fileName)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('图片预览生成失败'))
    reader.readAsDataURL(file)
  })
}

function buildDraftUploadFile(file, index = 0) {
  const safeFile = file instanceof File ? file : null
  if (!safeFile) return null
  return {
    uid: `comment-paste-${Date.now()}-${index}-${safeFile.size || 0}`,
    name: safeFile.name || `pasted-image-${index + 1}.png`,
    status: 'done',
    size: safeFile.size || 0,
    type: safeFile.type || '',
    originFileObj: safeFile,
  }
}

function mergeUniqueUploadFiles(currentList = [], nextList = []) {
  const dedup = new Map()
  ;[...(Array.isArray(currentList) ? currentList : []), ...(Array.isArray(nextList) ? nextList : [])].forEach((item, index) => {
    if (!item) return
    const rawFile = item?.originFileObj instanceof File ? item.originFileObj : null
    const key = rawFile
      ? `${rawFile.name || ''}|${rawFile.size || 0}|${rawFile.type || ''}`
      : `${item?.uid || item?.name || 'file'}|${index}`
    if (!dedup.has(key)) dedup.set(key, item)
  })
  return Array.from(dedup.values())
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildUploadFormData(policy = {}, file = null) {
  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  return formData
}

function isRetryableUploadError(error) {
  if (!error) return false
  const errorName = String(error?.name || '').trim()
  if (errorName === 'AbortError') return true
  const text = String(error?.message || '').toLowerCase()
  return (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('load failed') ||
    text.includes('timeout')
  )
}

async function uploadToOssWithRetry({ host, policy, file, fileName = '文件' }) {
  let lastError = null
  for (let attempt = 1; attempt <= OSS_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, OSS_UPLOAD_TIMEOUT_MS)
    try {
      const uploadRes = await fetch(host, {
        method: 'POST',
        body: buildUploadFormData(policy, file),
        signal: controller.signal,
      })
      if (uploadRes.ok) return

      const uploadText = await uploadRes.text().catch(() => '')
      const uploadError = new Error(uploadText || `上传到OSS失败，状态码 ${uploadRes.status}`)
      lastError = uploadError
      if (OSS_RETRYABLE_STATUS.has(Number(uploadRes.status || 0)) && attempt < OSS_UPLOAD_MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      throw uploadError
    } catch (error) {
      lastError = error
      if (isRetryableUploadError(error) && attempt < OSS_UPLOAD_MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      if (String(error?.name || '').trim() === 'AbortError') {
        throw new Error(`上传超时: ${fileName}`)
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  if (String(lastError?.name || '').trim() === 'AbortError') {
    throw new Error(`上传超时: ${fileName}`)
  }
  throw lastError || new Error(`上传失败: ${fileName}`)
}

function formatAttachmentSize(fileSize) {
  const size = Number(fileSize || 0)
  if (!size) return '-'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function stripHtmlToPlainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function prependUniqueAttachment(attachments = [], nextAttachment) {
  const list = Array.isArray(attachments) ? attachments : []
  const candidate = nextAttachment || null
  if (!candidate) return list
  const candidateId = Number(candidate?.id || 0)
  const candidateObjectKey = String(candidate?.object_key || '').trim()
  const deduped = list.filter((item) => {
    const itemId = Number(item?.id || 0)
    const itemObjectKey = String(item?.object_key || '').trim()
    if (candidateId > 0 && itemId === candidateId) return false
    if (candidateObjectKey && itemObjectKey === candidateObjectKey) return false
    return true
  })
  return [candidate, ...deduped]
}

function BugDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const bugId = Number(id)
  const currentUserId = Number(getCurrentUser()?.id || 0)
  const canUpdate = hasPermission('bug.update')
  const canTransition = hasPermission('bug.transition')
  const canDelete = true
  const canManageAllFields = hasPermission('bug.manage')

  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [uploading, setUploading] = useState(false)
  const attachmentPasteDedupRef = useRef({ signature: '', timestamp: 0 })
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [workflowTransitions, setWorkflowTransitions] = useState([])
  const [activeTabKey, setActiveTabKey] = useState('detail')
  const [remarkForm] = Form.useForm()
  const [commentForm] = Form.useForm()
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentDraftFileList, setCommentDraftFileList] = useState([])
  const commentDraftFileListRef = useRef([])
  const commentPasteDedupRef = useRef({ signature: '', timestamp: 0 })
  const [commentPreviewOpen, setCommentPreviewOpen] = useState(false)
  const [commentPreviewImage, setCommentPreviewImage] = useState('')
  const [commentPreviewType, setCommentPreviewType] = useState('image')
  const [commentPreviewTitle, setCommentPreviewTitle] = useState('')

  const descriptionContentHtml = useMemo(() => {
    const rawDescription = String(detail?.description || '').trim()
    if (!rawDescription) return plainTextToRichTextHtml('-')
    if (!isProbablyHtml(rawDescription)) return plainTextToRichTextHtml(rawDescription)
    return hydrateBugDescriptionAttachmentUrls(
      sanitizeBugDescriptionHtml(rawDescription),
      detail?.attachments || [],
    )
  }, [detail?.attachments, detail?.description])
  const [editingCommentId, setEditingCommentId] = useState(0)
  const [editingCommentValue, setEditingCommentValue] = useState('')
  const [editingCommentSubmitting, setEditingCommentSubmitting] = useState(false)
  const [replyingCommentId, setReplyingCommentId] = useState(0)
  const [replyValue, setReplyValue] = useState('')
  const [replyMentionUserIds, setReplyMentionUserIds] = useState([])
  const [replyDraftFileList, setReplyDraftFileList] = useState([])
  const replyDraftFileListRef = useRef([])
  const replyPasteDedupRef = useRef({ signature: '', timestamp: 0 })
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [mentionUserOptions, setMentionUserOptions] = useState([])
  const [mentionUserLoading, setMentionUserLoading] = useState(false)

  const openMediaPreview = useCallback(({ src, title, type = 'image' }) => {
    if (!src) {
      message.warning('当前附件无法生成预览')
      return
    }
    setCommentPreviewImage(src)
    setCommentPreviewType(type)
    setCommentPreviewTitle(title || '附件预览')
    setCommentPreviewOpen(true)
  }, [])

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
    })
  }, [detail, remarkForm])

  useEffect(() => {
    commentDraftFileListRef.current = Array.isArray(commentDraftFileList) ? commentDraftFileList : []
  }, [commentDraftFileList])

  useEffect(() => {
    replyDraftFileListRef.current = Array.isArray(replyDraftFileList) ? replyDraftFileList : []
  }, [replyDraftFileList])

  const loadMentionUserOptions = useCallback(async () => {
    setMentionUserLoading(true)
    try {
      const result = await getBugAssigneesApi()
      if (!result?.success) {
        return
      }
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
  }, [])

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
  const shouldHideBackButton = useMemo(() => {
    const params = new URLSearchParams(location.search || '')
    const from = String(params.get('from') || '').trim().toLowerCase()
    return from === 'workbench_pending_bugs'
  }, [location.search])

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
    requireFixSolution: transitionButtons.some(
      (item) => Number(item?.transition?.require_fix_solution) === 1 && !isNoFixTransition(item?.transition, item?.actionKey),
    ),
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
      const isFixAction = actionKey === 'fix'
      const isRejectAction = actionKey === 'reject'
      const mustFillFixSolution = (isFixAction || requireFixSolution) && !isNoFixTransition(transition, actionKey)
      const mustFillRemark = isRejectAction || requireRemark

      if (mustFillFixSolution && !fixSolution) {
        jumpToField('fix_solution', '修复方案&影响范围不能为空')
        message.warning('请先补充修复方案&影响范围后再提交')
        return
      }

      if (mustFillRemark && !remark) {
        jumpToField('remark', '备注不能为空')
        message.warning('请先补充备注后再提交')
        return
      }

      const payloadRemark = remark || undefined

      setActionLoading(buildTransitionActionId(transition))
      const toStatusCode = String(transition?.to_status_code || '').trim().toUpperCase()
      const result = await transitionBugApi(bugId, {
        action_key: actionKey,
        to_status_code: toStatusCode,
        remark: payloadRemark,
        fix_solution: fixSolution,
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
        if (!objectUrl) return '-'
        if (isImageAttachment(row)) {
          return (
            <button
              type="button"
              className="bug-detail-page__image-preview-trigger"
              onClick={() => openMediaPreview({
                src: objectUrl,
                title: row?.file_name || '附件预览',
                type: 'image',
              })}
            >
              <Image
                className="bug-detail-page__attachment-thumbnail"
                src={objectUrl}
                alt={row?.file_name || '附件缩略图'}
                width={56}
                height={56}
                preview={false}
              />
            </button>
          )
        }
        if (isVideoAttachment(row)) {
          return (
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => openMediaPreview({
                src: objectUrl,
                title: row?.file_name || '视频附件预览',
                type: 'video',
              })}
            >
              预览
            </Button>
          )
        }
        return '-'
      },
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (value, row) => {
        const fileName = value || '-'
        const downloadUrl = String(row?.download_file_url || '').trim() || getAttachmentUrl(row)
        const previewUrl = getAttachmentUrl(row)
        const previewable = Boolean(previewUrl) && (isImageAttachment(row) || isVideoAttachment(row))
        if (!downloadUrl) return fileName
        return (
          <Space size={6}>
            <span>{fileName}</span>
            {previewable ? (
              <Button
                type="text"
                size="small"
                style={{ paddingInline: 4, height: 22 }}
                icon={isVideoAttachment(row) ? <PlayCircleOutlined /> : undefined}
                onClick={(event) => {
                  event.stopPropagation()
                  openMediaPreview({
                    src: previewUrl,
                    title: row?.file_name || '附件预览',
                    type: isVideoAttachment(row) ? 'video' : 'image',
                  })
                }}
              >
                预览
              </Button>
            ) : null}
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
                    setDetail((currentDetail) => {
                      if (!currentDetail) return currentDetail
                      const currentAttachments = Array.isArray(currentDetail.attachments) ? currentDetail.attachments : []
                      return {
                        ...currentDetail,
                        attachments: currentAttachments.filter((item) => Number(item?.id || 0) !== Number(row.id)),
                      }
                    })
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

    await uploadToOssWithRetry({
      host: policy.host,
      policy,
      file: currentFile,
      fileName: currentFile?.name || '文件',
    })

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
      setDetail((currentDetail) => {
        if (!currentDetail) return currentDetail
        const currentAttachments = Array.isArray(currentDetail.attachments) ? currentDetail.attachments : []
        return {
          ...currentDetail,
          attachments: prependUniqueAttachment(currentAttachments, uploaded),
        }
      })
      message.success('附件上传成功')
      onSuccess?.(uploaded, file)
    } catch (error) {
      message.error(error?.message || '附件上传失败')
      onError?.(error)
    } finally {
      setUploading(false)
    }
  }

  const handlePasteUpload = useCallback(async (event) => {
    if (!canUpdate || uploading) return
    if (event?.nativeEvent?.__bugDetailAttachmentHandled) {
      event.preventDefault()
      return
    }

    const files = extractClipboardFiles(event?.clipboardData)
    if (files.length === 0) return

    if (event?.nativeEvent) {
      event.nativeEvent.__bugDetailAttachmentHandled = true
    }
    event.stopPropagation()

    const now = Date.now()
    const signature = files.map((file) => `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}`).join('||')
    if (
      signature &&
      attachmentPasteDedupRef.current.signature === signature &&
      now - Number(attachmentPasteDedupRef.current.timestamp || 0) < 1200
    ) {
      event.preventDefault()
      return
    }
    attachmentPasteDedupRef.current = {
      signature,
      timestamp: now,
    }

    event.preventDefault()
    setUploading(true)
    let successCount = 0
    const uploadedAttachments = []
    const errors = []
    try {
      for (const file of files) {
        try {
          const uploaded = await uploadAttachmentFile(file)
          uploadedAttachments.push(uploaded)
          successCount += 1
        } catch (error) {
          errors.push(error?.message || '附件上传失败')
        }
      }

      if (successCount > 0) {
        setDetail((currentDetail) => {
          if (!currentDetail) return currentDetail
          const currentAttachments = Array.isArray(currentDetail.attachments) ? currentDetail.attachments : []
          const nextAttachments = uploadedAttachments.reduce(
            (accumulator, attachment) => prependUniqueAttachment(accumulator, attachment),
            currentAttachments,
          )
          return {
            ...currentDetail,
            attachments: nextAttachments,
          }
        })
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
  }, [canUpdate, uploadAttachmentFile, uploading])

  const handleUploadPasteFocus = useCallback((event) => {
    event?.currentTarget?.focus?.()
  }, [])

  const handleCommentAttachmentChange = useCallback(({ fileList }) => {
    const nextList = fileList.slice(0, 9)
    commentDraftFileListRef.current = nextList
    setCommentDraftFileList(nextList)
  }, [])

  const handleCommentAttachmentPaste = useCallback(async (event) => {
    if (event?.nativeEvent?.__commentAttachmentHandled) {
      event.preventDefault()
      return
    }

    const files = extractClipboardFiles(event?.clipboardData)
    if (files.length === 0) return

    if (event?.nativeEvent) {
      event.nativeEvent.__commentAttachmentHandled = true
    }
    event.stopPropagation()

    const now = Date.now()
    const signature = files
      .map((file) => `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}`)
      .join('||')
    if (
      signature &&
      commentPasteDedupRef.current.signature === signature &&
      now - Number(commentPasteDedupRef.current.timestamp || 0) < 1200
    ) {
      event.preventDefault()
      return
    }
    commentPasteDedupRef.current = {
      signature,
      timestamp: now,
    }

    event.preventDefault()

    const acceptedFiles = []
    const rejectedMessages = []
    for (const file of files) {
      try {
        await precheckDraftAttachment(file)
        acceptedFiles.push(file)
      } catch (error) {
        rejectedMessages.push(error?.message || `${file?.name || '文件'}预检失败`)
      }
    }

    if (acceptedFiles.length > 0) {
      const currentList = Array.isArray(commentDraftFileListRef.current) ? commentDraftFileListRef.current : []
      const nextItems = acceptedFiles.map((file, index) => buildDraftUploadFile(file, index)).filter(Boolean)
      const merged = mergeUniqueUploadFiles(currentList, nextItems)
      const limited = merged.slice(0, 9)
      const acceptedCount = Math.max(0, limited.length - currentList.length)

      commentDraftFileListRef.current = limited
      setCommentDraftFileList(limited)

      if (acceptedCount > 0) {
        message.success(`已粘贴 ${acceptedCount} 个评论附件`)
      } else {
        message.info('附件列表已满，最多保留 9 个评论附件')
      }
      if (merged.length > 9) {
        message.warning('评论附件最多保留 9 个，超出部分已忽略')
      }
    }

    if (rejectedMessages.length > 0) {
      message.warning(rejectedMessages[0])
    }
  }, [])

  const handleReplyAttachmentChange = useCallback(({ fileList }) => {
    const nextList = fileList.slice(0, 9)
    replyDraftFileListRef.current = nextList
    setReplyDraftFileList(nextList)
  }, [])

  const handleReplyAttachmentPaste = useCallback(async (event) => {
    if (event?.nativeEvent?.__replyAttachmentHandled) {
      event.preventDefault()
      return
    }

    const files = extractClipboardFiles(event?.clipboardData)
    if (files.length === 0) return

    if (event?.nativeEvent) {
      event.nativeEvent.__replyAttachmentHandled = true
    }
    event.stopPropagation()

    const now = Date.now()
    const signature = files
      .map((file) => `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}`)
      .join('||')
    if (
      signature &&
      replyPasteDedupRef.current.signature === signature &&
      now - Number(replyPasteDedupRef.current.timestamp || 0) < 1200
    ) {
      event.preventDefault()
      return
    }
    replyPasteDedupRef.current = {
      signature,
      timestamp: now,
    }

    event.preventDefault()

    const acceptedFiles = []
    const rejectedMessages = []
    for (const file of files) {
      try {
        await precheckDraftAttachment(file)
        acceptedFiles.push(file)
      } catch (error) {
        rejectedMessages.push(error?.message || `${file?.name || '文件'}预检失败`)
      }
    }

    if (acceptedFiles.length > 0) {
      const currentList = Array.isArray(replyDraftFileListRef.current) ? replyDraftFileListRef.current : []
      const nextItems = acceptedFiles.map((file, index) => buildDraftUploadFile(file, index)).filter(Boolean)
      const merged = mergeUniqueUploadFiles(currentList, nextItems)
      const limited = merged.slice(0, 9)
      const acceptedCount = Math.max(0, limited.length - currentList.length)

      replyDraftFileListRef.current = limited
      setReplyDraftFileList(limited)

      if (acceptedCount > 0) {
        message.success(`已粘贴 ${acceptedCount} 个回复附件`)
      } else {
        message.info('附件列表已满，最多保留 9 个回复附件')
      }
      if (merged.length > 9) {
        message.warning('回复附件最多保留 9 个，超出部分已忽略')
      }
    }

    if (rejectedMessages.length > 0) {
      message.warning(rejectedMessages[0])
    }
  }, [])

  const handleCommentAttachmentPreview = useCallback(async (file) => {
    if (!isImageFile(file) && !isVideoFile(file)) {
      message.info('当前附件暂不支持预览')
      return
    }

    try {
      const rawFile = file?.originFileObj
      let previewSrc = String(file?.url || '').trim()
      if (!previewSrc && rawFile instanceof Blob && isImageFile(file)) {
        const cachedOriginPreview = String(file?.__originPreview || '').trim()
        previewSrc = cachedOriginPreview || await readFileAsDataUrl(rawFile)
        if (!cachedOriginPreview) {
          file.__originPreview = previewSrc
        }
      }
      if (!previewSrc && rawFile instanceof Blob && isVideoFile(file)) {
        previewSrc = URL.createObjectURL(rawFile)
      }
      if (!previewSrc) {
        previewSrc = String(file?.preview || file?.thumbUrl || '').trim()
      }
      if (!previewSrc) {
        message.warning('当前附件无法生成预览')
        return
      }

      if (!file.preview) {
        file.preview = previewSrc
      }
      openMediaPreview({
        src: previewSrc,
        title: file?.name || rawFile?.name || '评论附件预览',
        type: isVideoFile(file) ? 'video' : 'image',
      })
    } catch (error) {
      message.error(error?.message || '附件预览生成失败')
    }
  }, [openMediaPreview])

  const renderDraftAttachmentUploadItem = useCallback((originNode, file) => {
    const previewable = isImageFile(file) || isVideoFile(file)
    return (
      <div className="bug-detail-page__upload-list-item">
        {originNode}
        {previewable ? (
          <Button
            type="link"
            size="small"
            className="bug-detail-page__upload-preview-btn"
            icon={<EyeOutlined />}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void handleCommentAttachmentPreview(file)
            }}
          >
            预览
          </Button>
        ) : null}
      </div>
    )
  }, [handleCommentAttachmentPreview])

  const syncCommentDetailAfterMutation = useCallback(async (result, options = {}) => {
    const shouldReload = Boolean(options?.forceReload)
    if (shouldReload) {
      await loadDetail()
      return
    }
    if (result?.data?.detail) {
      setDetail(result.data.detail)
      return
    }
    await loadDetail()
  }, [loadDetail])

  const uploadCommentAttachmentsAfterSubmit = useCallback(async (commentLogId, draftFiles = [], options = {}) => {
    const files = Array.isArray(draftFiles) ? draftFiles : []
    const actionLabel = String(options?.actionLabel || '评论').trim() || '评论'
    if (files.length === 0) {
      return { forceReload: false }
    }

    if (!commentLogId) {
      message.warning(`${actionLabel}已发布，但未获取评论记录编号，附件未上传成功`)
      return { forceReload: false }
    }

    const uploadResult = await uploadCommentDraftAttachments(bugId, commentLogId, files)
    if (uploadResult.failures.length > 0) {
      message.warning(
        `${actionLabel}已发布，${actionLabel}附件上传成功 ${uploadResult.successCount}/${uploadResult.total}，失败文件可重新补传`,
      )
    } else {
      message.success(`${actionLabel}已发布，已上传 ${uploadResult.successCount} 个${actionLabel}附件`)
    }
    return { forceReload: true }
  }, [bugId])

  const resetCommentComposer = useCallback(() => {
    commentForm.resetFields()
    commentDraftFileListRef.current = []
    setCommentDraftFileList([])
    replyDraftFileListRef.current = []
    setReplyDraftFileList([])
    setCommentPreviewOpen(false)
    setCommentPreviewImage('')
    setCommentPreviewType('image')
    setCommentPreviewTitle('')
    setEditingCommentId(0)
    setEditingCommentValue('')
    setReplyingCommentId(0)
    setReplyValue('')
    setReplyMentionUserIds([])
  }, [commentForm])

  const handleSubmitComment = async () => {
    const viewportX = typeof window !== 'undefined' ? window.scrollX : 0
    const viewportY = typeof window !== 'undefined' ? window.scrollY : 0
    const restoreViewportPosition = () => {
      if (typeof window === 'undefined') return
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            left: viewportX,
            top: viewportY,
            behavior: 'auto',
          })
        })
      })
    }

    try {
      const values = await commentForm.validateFields()
      const comment = String(values.comment || '').trim()
      const mentionUserIds = Array.from(
        new Set((Array.isArray(values.mention_user_ids) ? values.mention_user_ids : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
      )
      if (!comment) {
        message.warning('评论内容不能为空')
        return
      }

      setCommentSubmitting(true)
      const result = await createBugCommentApi(bugId, {
        comment,
        mention_user_ids: mentionUserIds,
      })
      if (!result?.success) {
        message.error(result?.message || '评论发送失败')
        return
      }
      const commentLogId = Number(result?.data?.comment_log_id || 0)
      let syncOptions = { forceReload: false }
      if (commentDraftFileList.length > 0) {
        syncOptions = await uploadCommentAttachmentsAfterSubmit(commentLogId, commentDraftFileList, { actionLabel: '评论' })
      } else {
        message.success(result?.message || '评论已发布')
      }
      await syncCommentDetailAfterMutation(result, syncOptions)
      resetCommentComposer()
      restoreViewportPosition()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '评论发送失败')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleStartEditComment = useCallback((commentLog) => {
    setReplyingCommentId(0)
    setReplyValue('')
    setReplyMentionUserIds([])
    replyDraftFileListRef.current = []
    setReplyDraftFileList([])
    setEditingCommentId(Number(commentLog?.id || 0))
    setEditingCommentValue(String(commentLog?.remark || '').trim())
  }, [])

  const handleCancelEditComment = useCallback(() => {
    setEditingCommentId(0)
    setEditingCommentValue('')
  }, [])

  const handleSaveEditComment = useCallback(async (commentLogId) => {
    const nextComment = String(editingCommentValue || '').trim()
    if (!nextComment) {
      message.warning('评论内容不能为空')
      return
    }

    try {
      setEditingCommentSubmitting(true)
      const result = await updateBugCommentApi(bugId, commentLogId, {
        comment: nextComment,
      })
      if (!result?.success) {
        message.error(result?.message || '评论更新失败')
        return
      }
      message.success(result?.message || '评论已更新')
      await syncCommentDetailAfterMutation(result)
      setEditingCommentId(0)
      setEditingCommentValue('')
    } catch (error) {
      message.error(error?.message || '评论更新失败')
    } finally {
      setEditingCommentSubmitting(false)
    }
  }, [bugId, editingCommentValue, syncCommentDetailAfterMutation])

  const handleStartReplyComment = useCallback((commentLog) => {
    setEditingCommentId(0)
    setEditingCommentValue('')
    setReplyingCommentId(Number(commentLog?.id || 0))
    setReplyValue('')
    setReplyMentionUserIds([])
    replyDraftFileListRef.current = []
    setReplyDraftFileList([])
  }, [])

  const handleCancelReplyComment = useCallback(() => {
    setReplyingCommentId(0)
    setReplyValue('')
    setReplyMentionUserIds([])
    replyDraftFileListRef.current = []
    setReplyDraftFileList([])
  }, [])

  const handleSubmitReply = useCallback(async (parentComment) => {
    const parentCommentId = Number(parentComment?.id || 0)
    const nextComment = String(replyValue || '').trim()
    const nextMentionUserIds = Array.from(
      new Set((Array.isArray(replyMentionUserIds) ? replyMentionUserIds : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
    )
    if (!parentCommentId) {
      message.warning('回复目标无效')
      return
    }
    if (!nextComment) {
      message.warning('回复内容不能为空')
      return
    }

    try {
      setReplySubmitting(true)
      const result = await createBugCommentApi(bugId, {
        comment: nextComment,
        parent_comment_id: parentCommentId,
        mention_user_ids: nextMentionUserIds,
      })
      if (!result?.success) {
        message.error(result?.message || '回复发送失败')
        return
      }
      const commentLogId = Number(result?.data?.comment_log_id || 0)
      let syncOptions = { forceReload: false }
      if (replyDraftFileList.length > 0) {
        syncOptions = await uploadCommentAttachmentsAfterSubmit(commentLogId, replyDraftFileList, { actionLabel: '回复' })
      } else {
        message.success(result?.message || '回复已发布')
      }
      await syncCommentDetailAfterMutation(result, syncOptions)
      setReplyingCommentId(0)
      setReplyValue('')
      setReplyMentionUserIds([])
      replyDraftFileListRef.current = []
      setReplyDraftFileList([])
    } catch (error) {
      message.error(error?.message || '回复发送失败')
    } finally {
      setReplySubmitting(false)
    }
  }, [
    bugId,
    replyDraftFileList,
    replyMentionUserIds,
    replyValue,
    syncCommentDetailAfterMutation,
    uploadCommentAttachmentsAfterSubmit,
  ])

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

  const replyCommentMap = useMemo(() => {
    const map = new Map()
    commentLogs
      .filter((item) => Number(item?.parent_comment_id || 0) > 0)
      .sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0))
      .forEach((item) => {
        const parentCommentId = Number(item?.parent_comment_id || 0)
        const list = map.get(parentCommentId) || []
        list.push(item)
        map.set(parentCommentId, list)
      })
    return map
  }, [commentLogs])

  const topLevelCommentLogs = useMemo(
    () => commentLogs.filter((item) => !Number(item?.parent_comment_id || 0)),
    [commentLogs],
  )

  const operationLogs = useMemo(
    () => normalizedStatusLogs.filter((item) => !item?.__isCommentLog),
    [normalizedStatusLogs],
  )
  const latestOperationRemark = useMemo(() => {
    if (!Array.isArray(operationLogs) || operationLogs.length === 0) return ''
    const sortedLogs = [...operationLogs].sort((left, right) => {
      const leftTime = Date.parse(left?.created_at || '') || 0
      const rightTime = Date.parse(right?.created_at || '') || 0
      if (rightTime !== leftTime) return rightTime - leftTime
      return Number(right?.id || 0) - Number(left?.id || 0)
    })
    const transitionLogs = sortedLogs.filter((item) => {
      const fromStatusCode = String(item?.from_status_code || '').trim().toUpperCase()
      const toStatusCode = String(item?.to_status_code || '').trim().toUpperCase()
      return fromStatusCode && toStatusCode && fromStatusCode !== toStatusCode
    })
    const targetLog = transitionLogs.find((item) => String(item?.remark || '').trim())
    return stripHtmlToPlainText(targetLog?.remark || '')
  }, [operationLogs])

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
                  {shouldHideBackButton ? null : (
                    <Button
                      type="text"
                      className="bug-detail-page__back-btn"
                      icon={<ArrowLeftOutlined />}
                      onClick={() => navigate(-1)}
                    >
                      返回
                    </Button>
                  )}
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
                activeKey={activeTabKey}
                onChange={setActiveTabKey}
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
                            <div className="bug-detail-page__tab-section-title">问题描述</div>
                            <Descriptions column={1} size="small">
                              <Descriptions.Item label="描述">
                                <div
                                  className="bug-detail-page__description-content"
                                  dangerouslySetInnerHTML={{ __html: descriptionContentHtml }}
                                />
                              </Descriptions.Item>
                              <Descriptions.Item label="复现环境">
                                <Paragraph>{detail.environment_info || '-'}</Paragraph>
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

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">流转操作</div>
                            <Form form={remarkForm} layout="vertical" requiredMark={false} className="bug-detail-page__transition-form">
                              {canSeeFixModule ? (
                                <Form.Item
                                  label="修复方案&影响范围"
                                  name="fix_solution"
                                  extra={transitionRequirementHints.requireFixSolution ? '当前可执行动作中存在修复方案必填项' : '可选，建议记录修复方案'}
                                >
                                  <Input.TextArea rows={3} maxLength={20000} placeholder="请填写修复方案与影响范围" />
                                </Form.Item>
                              ) : null}
                              <Form.Item
                                label="备注"
                                name="remark"
                                extra="选填，打回/重开可补充原因"
                              >
                                <Input.TextArea rows={3} maxLength={20000} placeholder="打回、重开或处理说明可填写在这里" />
                              </Form.Item>
                            </Form>
                          </div>
                        </div>

                        <div className="bug-detail-page__detail-side">
                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">基础字段</div>
                            <div className="bug-detail-page__meta-grid">
                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--accent">
                                <div className="bug-detail-page__meta-label">严重程度</div>
                                <div className="bug-detail-page__meta-value">
                                  <Tag color={detail.severity_color || 'default'}>{detail.severity_name || detail.severity_code || '-'}</Tag>
                                </div>
                              </div>

                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">Bug类型</div>
                                <div className="bug-detail-page__meta-value">{detail.bug_type_name || detail.bug_type_code || '-'}</div>
                              </div>

                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">产品模块</div>
                                <div className="bug-detail-page__meta-value">{detail.product_name || detail.product_code || '-'}</div>
                              </div>

                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--strong">
                                <div className="bug-detail-page__meta-label">Bug阶段</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__meta-value--strong">
                                  {detail.issue_stage_name || detail.issue_stage || '-'}
                                </div>
                              </div>

                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">发现人</div>
                                <div className="bug-detail-page__meta-value">{detail.reporter_name || '-'}</div>
                              </div>

                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--strong">
                                <div className="bug-detail-page__meta-label">处理人</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__meta-value--strong">
                                  {detail.assignee_names || detail.assignee_name || '-'}
                                </div>
                              </div>

                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">关注人</div>
                                <div className="bug-detail-page__meta-value">{detail.watcher_names || '-'}</div>
                              </div>

                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--link">
                                <div className="bug-detail-page__meta-label">关联需求</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__meta-value--link">
                                  {detail.demand_id ? (
                                    <Button
                                      type="link"
                                      className="bug-detail-page__meta-link-btn"
                                      onClick={() => navigate(`/work-demands/${detail.demand_id}`)}
                                    >
                                      {detail.demand_name || detail.demand_id}
                                    </Button>
                                  ) : (
                                    '-'
                                  )}
                                </div>
                              </div>

                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--subtle">
                                <div className="bug-detail-page__meta-label">创建时间</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__meta-value--secondary">
                                  {formatBeijingDateTime(detail.created_at)}
                                </div>
                              </div>

                              <div className="bug-detail-page__meta-item bug-detail-page__meta-item--subtle">
                                <div className="bug-detail-page__meta-label">更新时间</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__meta-value--secondary">
                                  {formatBeijingDateTime(detail.updated_at)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bug-detail-page__tab-section">
                            <div className="bug-detail-page__tab-section-title">修复信息</div>
                            <div className="bug-detail-page__meta-grid">
                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">修复方案&影响范围</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__repair-text">
                                  {detail.fix_solution || '-'}
                                </div>
                              </div>
                              <div className="bug-detail-page__meta-item">
                                <div className="bug-detail-page__meta-label">备注信息</div>
                                <div className="bug-detail-page__meta-value bug-detail-page__repair-text">
                                  {latestOperationRemark || '-'}
                                </div>
                              </div>
                            </div>
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
                          <Form form={commentForm} layout="vertical" className="bug-detail-page__comment-form">
                            <Form.Item
                              label="评论内容"
                              name="comment"
                              rules={[{ required: true, message: '请输入评论内容' }]}
                            >
                              <Input.TextArea
                                autoSize={{ minRows: 3, maxRows: 12 }}
                                maxLength={20000}
                                placeholder="输入评论内容，可选择@多人并发送通知"
                                onPaste={(event) => {
                                  void handleCommentAttachmentPaste(event)
                                }}
                              />
                            </Form.Item>
                            <Form.Item label="@某人（可选，可多选）" name="mention_user_ids">
                              <Select
                                mode="multiple"
                                showSearch
                                allowClear
                                placeholder="选择需要通知的人员"
                                options={mentionUserOptions}
                                loading={mentionUserLoading}
                                filterOption={(input, option) => pinyinSelectFilter(input, option)}
                                optionFilterProp="label"
                                maxTagCount="responsive"
                              />
                            </Form.Item>
                            <Form.Item
                              label="附件（可选）"
                              extra="评论发布成功后会自动上传，并展示在这条评论下方，不会进入 Bug 主附件区。"
                            >
                              <div
                                className="bug-detail-page__comment-upload-zone"
                                tabIndex={0}
                                onClick={handleUploadPasteFocus}
                                onPaste={(event) => {
                                  void handleCommentAttachmentPaste(event)
                                }}
                              >
                                <div className="bug-detail-page__comment-upload-hint">
                                  点击此区域后，可直接 `Ctrl/Cmd + V` 粘贴附件
                                </div>
                                <Upload
                                  className="bug-detail-page__comment-upload"
                                  beforeUpload={() => false}
                                  fileList={commentDraftFileList}
                                  listType="picture"
                                  multiple
                                  maxCount={9}
                                  onChange={handleCommentAttachmentChange}
                                  onPreview={handleCommentAttachmentPreview}
                                  showUploadList={{ showPreviewIcon: false }}
                                  itemRender={renderDraftAttachmentUploadItem}
                                >
                                  <Button>选择附件</Button>
                                </Upload>
                              </div>
                            </Form.Item>
                            <div className="bug-detail-page__comment-submit">
                              <Button type="primary" onClick={handleSubmitComment} loading={commentSubmitting}>
                                发表评论并通知
                              </Button>
                            </div>
                          </Form>
                        </div>

                        <div className="bug-detail-page__tab-section">
                          <div className="bug-detail-page__tab-section-title">评论记录</div>
                          {topLevelCommentLogs.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论记录" />
                          ) : (
                            <div className="bug-detail-page__log-list">
                              {topLevelCommentLogs.map((item, index) => {
                                const commentId = Number(item?.id || 0)
                                const isEditingCurrent = editingCommentId === commentId
                                const isReplyingCurrent = replyingCommentId === commentId
                                const isOwnComment = Number(item?.operator_id || 0) === currentUserId
                                const commentAttachments = Array.isArray(item?.attachments) ? item.attachments : []
                                const replies = replyCommentMap.get(commentId) || []
                                return (
                                  <div
                                    className="bug-detail-page__log-list-item bug-detail-page__comment-thread-item"
                                    key={`comment-log-${item?.id || item?.created_at || 'comment'}-${index}`}
                                  >
                                    <div className="bug-detail-page__comment-card">
                                      <div className="bug-detail-page__log-item">
                                        <div className="bug-detail-page__log-main">
                                          <Text strong>{item.operator_name || '-'}</Text>
                                          <Text type="secondary">发表评论</Text>
                                          {item.edited_at ? <Text type="secondary">已编辑</Text> : null}
                                        </div>
                                        <div className="bug-detail-page__log-time">{formatBeijingDateTime(item.created_at)}</div>
                                        {isEditingCurrent ? (
                                          <div className="bug-detail-page__comment-editor">
                                            <Input.TextArea
                                              autoSize={{ minRows: 3, maxRows: 12 }}
                                              maxLength={20000}
                                              value={editingCommentValue}
                                              onChange={(event) => setEditingCommentValue(event.target.value)}
                                              placeholder="请输入评论内容"
                                            />
                                            <Space size={8} className="bug-detail-page__comment-editor-actions">
                                              <Button
                                                type="primary"
                                                size="small"
                                                loading={editingCommentSubmitting}
                                                onClick={() => handleSaveEditComment(commentId)}
                                              >
                                                保存
                                              </Button>
                                              <Button size="small" onClick={handleCancelEditComment}>
                                                取消
                                              </Button>
                                            </Space>
                                          </div>
                                        ) : item.remark ? (
                                          <div className="bug-detail-page__log-remark">{item.remark}</div>
                                        ) : null}
                                      </div>
                                      <div className="bug-detail-page__comment-actions">
                                        {isOwnComment ? (
                                          <Button
                                            type="text"
                                            size="small"
                                            className="bug-detail-page__comment-action-btn"
                                            icon={<EditOutlined />}
                                            title="编辑评论"
                                            onClick={() => handleStartEditComment(item)}
                                          />
                                        ) : null}
                                        <Button
                                          type="text"
                                          size="small"
                                          className="bug-detail-page__comment-action-btn"
                                          icon={<MessageOutlined />}
                                          title="回复评论"
                                          onClick={() => handleStartReplyComment(item)}
                                        />
                                      </div>
                                    </div>
                                    {commentAttachments.length > 0 ? (
                                      <div className="bug-detail-page__comment-attachments">
                                        {commentAttachments.map((attachment) => {
                                          const attachmentUrl = getAttachmentUrl(attachment)
                                          const isImage = isImageAttachment(attachment)
                                          const isVideo = isVideoAttachment(attachment)
                                          return (
                                            <div
                                              className="bug-detail-page__comment-attachment"
                                              key={`comment-attachment-${attachment.id}`}
                                            >
                                              {isImage && attachmentUrl ? (
                                                <Image
                                                  className="bug-detail-page__comment-attachment-image"
                                                  src={attachmentUrl}
                                                  alt={attachment.file_name || '评论附件'}
                                                  width={72}
                                                  height={72}
                                                  preview={{
                                                    zIndex: 2100,
                                                    cover: <span className="bug-detail-page__image-mask-hint">点击放大</span>,
                                                  }}
                                                />
                                              ) : isVideo && attachmentUrl ? (
                                                <button
                                                  type="button"
                                                  className="bug-detail-page__comment-attachment-icon bug-detail-page__comment-attachment-icon--video"
                                                  onClick={() => openMediaPreview({
                                                    src: attachmentUrl,
                                                    title: attachment.file_name || '评论视频附件',
                                                    type: 'video',
                                                  })}
                                                >
                                                  <PlayCircleOutlined />
                                                  <span>预览视频</span>
                                                </button>
                                              ) : (
                                                <div className="bug-detail-page__comment-attachment-icon">
                                                  <PaperClipOutlined />
                                                </div>
                                              )}
                                              <div className="bug-detail-page__comment-attachment-meta">
                                                <div className="bug-detail-page__comment-attachment-name">
                                                  {attachmentUrl ? (
                                                    <a href={attachmentUrl} target="_blank" rel="noreferrer">
                                                      {attachment.file_name || '未命名附件'}
                                                    </a>
                                                  ) : (
                                                    <span>{attachment.file_name || '未命名附件'}</span>
                                                  )}
                                                </div>
                                                <div className="bug-detail-page__comment-attachment-extra">
                                                  <span>{formatAttachmentSize(attachment.file_size)}</span>
                                                  <span>{attachment.uploaded_by_name || item.operator_name || '-'}</span>
                                                  <span>{formatBeijingDateTime(attachment.created_at)}</span>
                                                </div>
                                              </div>
                                              {attachmentUrl ? (
                                                <a href={attachment.download_file_url || attachmentUrl} target="_blank" rel="noreferrer">
                                                  <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<DownloadOutlined />}
                                                    title="下载附件"
                                                  />
                                                </a>
                                              ) : null}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : null}
                                    {isReplyingCurrent ? (
                                      <div className="bug-detail-page__comment-reply-box">
                                        <Input.TextArea
                                          autoSize={{ minRows: 2, maxRows: 10 }}
                                          maxLength={20000}
                                          value={replyValue}
                                          onChange={(event) => setReplyValue(event.target.value)}
                                          placeholder={`回复 ${item.operator_name || '该评论'}...`}
                                          onPaste={(event) => {
                                            void handleReplyAttachmentPaste(event)
                                          }}
                                        />
                                        <Select
                                          mode="multiple"
                                          showSearch
                                          allowClear
                                          placeholder="选择需要通知的人员（可选，可多选）"
                                          options={mentionUserOptions}
                                          loading={mentionUserLoading}
                                          filterOption={(input, option) => pinyinSelectFilter(input, option)}
                                          optionFilterProp="label"
                                          value={replyMentionUserIds}
                                          onChange={(value) => setReplyMentionUserIds(Array.isArray(value) ? value : [])}
                                          maxTagCount="responsive"
                                        />
                                        <div
                                          className="bug-detail-page__comment-upload-zone bug-detail-page__comment-upload-zone--reply"
                                          tabIndex={0}
                                          onClick={handleUploadPasteFocus}
                                          onPaste={(event) => {
                                            void handleReplyAttachmentPaste(event)
                                          }}
                                        >
                                          <div className="bug-detail-page__comment-upload-hint">
                                            点击此区域后，可直接 `Ctrl/Cmd + V` 粘贴附件
                                          </div>
                                          <Upload
                                            className="bug-detail-page__comment-upload"
                                            beforeUpload={() => false}
                                            fileList={replyDraftFileList}
                                            listType="picture"
                                            multiple
                                            maxCount={9}
                                            onChange={handleReplyAttachmentChange}
                                            onPreview={handleCommentAttachmentPreview}
                                            showUploadList={{ showPreviewIcon: false }}
                                            itemRender={renderDraftAttachmentUploadItem}
                                          >
                                            <Button size="small">选择附件</Button>
                                          </Upload>
                                        </div>
                                        <Space size={8} className="bug-detail-page__comment-editor-actions">
                                          <Button
                                            type="primary"
                                            size="small"
                                            loading={replySubmitting}
                                            onClick={() => handleSubmitReply(item)}
                                          >
                                            回复
                                          </Button>
                                          <Button size="small" onClick={handleCancelReplyComment}>
                                            取消
                                          </Button>
                                        </Space>
                                      </div>
                                    ) : null}
                                    {replies.length > 0 ? (
                                      <div className="bug-detail-page__comment-reply-list">
                                        {replies.map((reply) => {
                                          const replyId = Number(reply?.id || 0)
                                          const isOwnReply = Number(reply?.operator_id || 0) === currentUserId
                                          const isEditingReply = editingCommentId === replyId
                                          const replyAttachments = Array.isArray(reply?.attachments) ? reply.attachments : []
                                          return (
                                            <div className="bug-detail-page__comment-reply-item" key={`comment-reply-${replyId}`}>
                                              <div className="bug-detail-page__comment-card bug-detail-page__comment-card--reply">
                                                <div className="bug-detail-page__log-item">
                                                  <div className="bug-detail-page__log-main">
                                                    <Text strong>{reply.operator_name || '-'}</Text>
                                                    <Text type="secondary">回复了评论</Text>
                                                    {reply.edited_at ? <Text type="secondary">已编辑</Text> : null}
                                                  </div>
                                                  <div className="bug-detail-page__log-time">{formatBeijingDateTime(reply.created_at)}</div>
                                                  {isEditingReply ? (
                                                    <div className="bug-detail-page__comment-editor">
                                                      <Input.TextArea
                                                        autoSize={{ minRows: 2, maxRows: 10 }}
                                                        maxLength={20000}
                                                        value={editingCommentValue}
                                                        onChange={(event) => setEditingCommentValue(event.target.value)}
                                                        placeholder="请输入回复内容"
                                                      />
                                                      <Space size={8} className="bug-detail-page__comment-editor-actions">
                                                        <Button
                                                          type="primary"
                                                          size="small"
                                                          loading={editingCommentSubmitting}
                                                          onClick={() => handleSaveEditComment(replyId)}
                                                        >
                                                          保存
                                                        </Button>
                                                        <Button size="small" onClick={handleCancelEditComment}>
                                                          取消
                                                        </Button>
                                                      </Space>
                                                    </div>
                                                  ) : reply.remark ? (
                                                    <div className="bug-detail-page__log-remark">{reply.remark}</div>
                                                  ) : null}
                                                </div>
                                                <div className="bug-detail-page__comment-actions">
                                                  {isOwnReply ? (
                                                    <Button
                                                      type="text"
                                                      size="small"
                                                      className="bug-detail-page__comment-action-btn"
                                                      icon={<EditOutlined />}
                                                      title="编辑回复"
                                                      onClick={() => handleStartEditComment(reply)}
                                                    />
                                                  ) : null}
                                                </div>
                                              </div>
                                              {replyAttachments.length > 0 ? (
                                                <div className="bug-detail-page__comment-attachments bug-detail-page__comment-attachments--reply">
                                                  {replyAttachments.map((attachment) => {
                                                    const attachmentUrl = getAttachmentUrl(attachment)
                                                    const isImage = isImageAttachment(attachment)
                                                    const isVideo = isVideoAttachment(attachment)
                                                    return (
                                                      <div
                                                        className="bug-detail-page__comment-attachment"
                                                        key={`reply-attachment-${attachment.id}`}
                                                      >
                                                        {isImage && attachmentUrl ? (
                                                          <Image
                                                            className="bug-detail-page__comment-attachment-image"
                                                            src={attachmentUrl}
                                                            alt={attachment.file_name || '回复附件'}
                                                            width={72}
                                                            height={72}
                                                            preview={{
                                                              zIndex: 2100,
                                                              cover: <span className="bug-detail-page__image-mask-hint">点击放大</span>,
                                                            }}
                                                          />
                                                        ) : isVideo && attachmentUrl ? (
                                                          <button
                                                            type="button"
                                                            className="bug-detail-page__comment-attachment-icon bug-detail-page__comment-attachment-icon--video"
                                                            onClick={() => openMediaPreview({
                                                              src: attachmentUrl,
                                                              title: attachment.file_name || '回复视频附件',
                                                              type: 'video',
                                                            })}
                                                          >
                                                            <PlayCircleOutlined />
                                                            <span>预览视频</span>
                                                          </button>
                                                        ) : (
                                                          <div className="bug-detail-page__comment-attachment-icon">
                                                            <PaperClipOutlined />
                                                          </div>
                                                        )}
                                                        <div className="bug-detail-page__comment-attachment-meta">
                                                          <div className="bug-detail-page__comment-attachment-name">
                                                            {attachmentUrl ? (
                                                              <a href={attachmentUrl} target="_blank" rel="noreferrer">
                                                                {attachment.file_name || '未命名附件'}
                                                              </a>
                                                            ) : (
                                                              <span>{attachment.file_name || '未命名附件'}</span>
                                                            )}
                                                          </div>
                                                          <div className="bug-detail-page__comment-attachment-extra">
                                                            <span>{formatAttachmentSize(attachment.file_size)}</span>
                                                            <span>{attachment.uploaded_by_name || reply.operator_name || '-'}</span>
                                                            <span>{formatBeijingDateTime(attachment.created_at)}</span>
                                                          </div>
                                                        </div>
                                                        {attachmentUrl ? (
                                                          <a href={attachment.download_file_url || attachmentUrl} target="_blank" rel="noreferrer">
                                                            <Button
                                                              type="text"
                                                              size="small"
                                                              icon={<DownloadOutlined />}
                                                              title="下载附件"
                                                            />
                                                          </a>
                                                        ) : null}
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              ) : null}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
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
              assigneeScope="all"
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
            <Modal
              open={commentPreviewOpen}
              title={commentPreviewTitle}
              footer={null}
              onCancel={() => setCommentPreviewOpen(false)}
              centered
              width={860}
            >
              {commentPreviewType === 'video' ? (
                <video
                  className="bug-detail-page__comment-preview-video"
                  src={commentPreviewImage}
                  controls
                  preload="metadata"
                />
              ) : (
                <Image
                  className="bug-detail-page__comment-preview-image"
                  src={commentPreviewImage}
                  alt={commentPreviewTitle || '评论附件预览'}
                  preview={{
                    zIndex: 2100,
                    cover: <span className="bug-detail-page__image-mask-hint">点击放大</span>,
                  }}
                />
              )}
            </Modal>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bug不存在或已被删除" />
        )}
      </Card>
    </div>
  )
}

export default BugDetailPage
