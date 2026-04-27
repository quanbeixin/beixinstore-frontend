import { Alert, Button, Drawer, Form, Image, Input, Modal, Select, Space, Upload, message } from 'antd'
import { EyeOutlined, InboxOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDictItemsApi } from '../../../api/configDict'
import { getWorkDemandsApi } from '../../../api/work'
import { getBugAssigneesApi } from '../../../api/bug'
import { buildAttachmentFileSignature, precheckDraftAttachment, uploadBugAttachmentFile } from '../utils/attachmentUpload'
import {
  BUG_DESCRIPTION_TEMPLATE_TEXT,
  buildBugDescriptionInitialHtml,
  createPendingDescriptionImageToken,
  hasMeaningfulBugDescription,
  hydrateBugDescriptionAttachmentUrls,
  sanitizeBugDescriptionHtml,
} from '../utils/descriptionRichText'
import BugRichTextEditor from './BugRichTextEditor'
import { pinyinSelectFilter } from '../../../utils/selectSearch'
import './bug-form-modal.css'

function isImageFile(file) {
  const mimeType = String(file?.type || file?.originFileObj?.type || '').toLowerCase()
  if (mimeType.startsWith('image/')) return true

  const fileName = String(file?.name || file?.fileName || file?.originFileObj?.name || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(fileName)
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

function buildUploadFileSignature(fileLike) {
  const rawFile = fileLike?.originFileObj instanceof File ? fileLike.originFileObj : fileLike
  return `${rawFile?.name || fileLike?.name || ''}|${rawFile?.size || fileLike?.size || 0}|${rawFile?.type || fileLike?.type || ''}`
}

function buildDraftUploadFile(file, token = '') {
  const safeFile = file instanceof File ? file : null
  if (!safeFile) return null
  return {
    uid: token || `bug-desc-${Date.now()}-${safeFile.size || 0}`,
    name: safeFile.name || 'image.png',
    status: 'done',
    size: safeFile.size || 0,
    type: safeFile.type || '',
    originFileObj: safeFile,
  }
}

function mergeUniqueUploadFiles(fileList = []) {
  const dedup = new Map()
  ;(Array.isArray(fileList) ? fileList : []).forEach((item, index) => {
    if (!item) return
    const key = buildUploadFileSignature(item) || `${item?.uid || 'file'}|${index}`
    if (!dedup.has(key)) dedup.set(key, item)
  })
  return Array.from(dedup.values())
}

function mapDictOptions(rows) {
  return (rows || []).map((item) => ({
    label: item?.item_name || item?.item_code || '-',
    value: item?.item_code,
  }))
}

function mapDemandOptions(rows) {
  return (rows || []).map((item) => ({
    label: `${item?.id || ''} · ${item?.name || '-'}`,
    value: item?.id,
  }))
}

function mapAssigneeOptions(rows) {
  return (rows || []).map((item) => ({
    label: item?.name || item?.username || `用户${item?.id}`,
    value: item?.id,
  }))
}

function BugFormModal({
  open,
  onCancel,
  onSubmit,
  initialValues = null,
  demandIdPreset = '',
  lockDemand = false,
  title = '新建Bug',
  submitText = '保存',
  confirmLoading = false,
  showDraftAttachments = true,
  presentation = 'modal',
  assigneeScope = 'demand',
}) {
  const [form] = Form.useForm()
  const selectedDemandId = Form.useWatch('demand_id', form)
  const [draftFileList, setDraftFileList] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [previewType, setPreviewType] = useState('image')
  const [previewTitle, setPreviewTitle] = useState('')
  const [attachmentChecking, setAttachmentChecking] = useState(false)
  const [attachmentRejectList, setAttachmentRejectList] = useState([])
  const draftFileListRef = useRef([])
  const pendingDescriptionImageMapRef = useRef(new Map())
  const pendingDescriptionPreviewUrlSetRef = useRef(new Set())
  const pastedFileCountRef = useRef(0)
  const attachmentPasteDedupRef = useRef({ signature: '', timestamp: 0 })
  const attachmentCheckingCountRef = useRef(0)
  const rejectedAttachmentQueueRef = useRef([])
  const rejectedAttachmentFlushTimerRef = useRef(null)

  const [loadingOptions, setLoadingOptions] = useState(false)
  const [severityOptions, setSeverityOptions] = useState([])
  const [bugTypeOptions, setBugTypeOptions] = useState([])
  const [productOptions, setProductOptions] = useState([])
  const [stageOptions, setStageOptions] = useState([])
  const [demandOptions, setDemandOptions] = useState([])
  const [assigneeOptions, setAssigneeOptions] = useState([])
  const isCreateMode = !initialValues?.id

  const normalizedDemandPreset = String(demandIdPreset || '').trim()

  const resetPendingDescriptionImages = useCallback(() => {
    pendingDescriptionPreviewUrlSetRef.current.forEach((url) => {
      if (!url) return
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.warn('revoke bug description preview url failed', error)
      }
    })
    pendingDescriptionPreviewUrlSetRef.current = new Set()
    pendingDescriptionImageMapRef.current = new Map()
  }, [])

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const [severityRes, bugTypeRes, productRes, stageRes, demandRes] = await Promise.all([
        getDictItemsApi('bug_severity', { enabledOnly: true }),
        getDictItemsApi('bug_type', { enabledOnly: true }),
        getDictItemsApi('bug_product', { enabledOnly: true }),
        getDictItemsApi('bug_stage', { enabledOnly: true }),
        getWorkDemandsApi({ page: 1, pageSize: 200 }),
      ])

      setSeverityOptions(mapDictOptions(severityRes?.data || []))
      setBugTypeOptions(mapDictOptions(bugTypeRes?.data || []))
      setProductOptions(mapDictOptions(productRes?.data || []))
      setStageOptions(mapDictOptions(stageRes?.data || []))
      setDemandOptions(mapDemandOptions(demandRes?.data?.list || []))
    } catch (error) {
      message.error(error?.message || '加载Bug表单选项失败')
    } finally {
      setLoadingOptions(false)
    }
  }, [])

  const loadAssignees = useCallback(async (demandId) => {
    const shouldFilterByDemand = String(assigneeScope || '').trim().toLowerCase() !== 'all'
    try {
      const result = await getBugAssigneesApi({
        demand_id: shouldFilterByDemand ? demandId || undefined : undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取处理人列表失败')
        return
      }
      setAssigneeOptions(mapAssigneeOptions(result.data || []))
    } catch (error) {
      message.error(error?.message || '获取处理人列表失败')
    }
  }, [assigneeScope])

  useEffect(() => {
    if (!open) return
    loadOptions()
  }, [open, loadOptions])

  useEffect(() => {
    if (open) return
    setDraftFileList([])
    draftFileListRef.current = []
    resetPendingDescriptionImages()
    setPreviewOpen(false)
    setPreviewImage('')
    setPreviewType('image')
    setPreviewTitle('')
    pastedFileCountRef.current = 0
    attachmentCheckingCountRef.current = 0
    rejectedAttachmentQueueRef.current = []
    if (rejectedAttachmentFlushTimerRef.current) {
      window.clearTimeout(rejectedAttachmentFlushTimerRef.current)
      rejectedAttachmentFlushTimerRef.current = null
    }
    setAttachmentChecking(false)
    setAttachmentRejectList([])
  }, [open, resetPendingDescriptionImages])

  useEffect(() => () => {
    resetPendingDescriptionImages()
  }, [resetPendingDescriptionImages])

  const handleAttachmentPaste = useCallback((event) => {
    if (event?.nativeEvent?.__bugFormAttachmentHandled) return
    const clipboardFiles = Array.from(event?.clipboardData?.files || []).filter(Boolean)
    const signature = clipboardFiles.map((file) => buildUploadFileSignature(file)).join('||')
    const now = Date.now()
    if (
      signature &&
      attachmentPasteDedupRef.current.signature === signature &&
      now - Number(attachmentPasteDedupRef.current.timestamp || 0) < 1200
    ) {
      return
    }
    attachmentPasteDedupRef.current = { signature, timestamp: now }
    if (event?.nativeEvent) {
      event.nativeEvent.__bugFormAttachmentHandled = true
    }
    pastedFileCountRef.current = clipboardFiles.length
  }, [])

  const handleAttachmentChange = useCallback(({ fileList }) => {
    const prevList = Array.isArray(draftFileListRef.current) ? draftFileListRef.current : []
    const nextList = mergeUniqueUploadFiles(fileList).slice(0, 9)
    draftFileListRef.current = nextList
    setDraftFileList(nextList)

    const addedCount = Math.max(0, nextList.length - prevList.length)
    if (addedCount > 0 && pastedFileCountRef.current > 0) {
      message.success(`已粘贴 ${Math.min(addedCount, pastedFileCountRef.current)} 个附件`)
    }
    if (Array.isArray(fileList) && mergeUniqueUploadFiles(fileList).length < fileList.length) {
      message.info('检测到重复附件，已自动去重')
    }
    pastedFileCountRef.current = 0
  }, [])

  const flushRejectedAttachmentQueue = useCallback(() => {
    const queuedItems = Array.isArray(rejectedAttachmentQueueRef.current) ? rejectedAttachmentQueueRef.current : []
    if (queuedItems.length === 0) return
    rejectedAttachmentQueueRef.current = []
    if (rejectedAttachmentFlushTimerRef.current) {
      window.clearTimeout(rejectedAttachmentFlushTimerRef.current)
      rejectedAttachmentFlushTimerRef.current = null
    }

    const dedupedItems = []
    const seen = new Set()
    queuedItems.forEach((item) => {
      const fileName = String(item?.fileName || '未命名文件').trim() || '未命名文件'
      const reason = String(item?.reason || '附件预检失败').trim() || '附件预检失败'
      const key = `${fileName}__${reason}`
      if (seen.has(key)) return
      seen.add(key)
      dedupedItems.push({ fileName, reason })
    })

    if (dedupedItems.length === 0) return

    setAttachmentRejectList((prev) => {
      const next = [...dedupedItems]
      ;(Array.isArray(prev) ? prev : []).forEach((item) => {
        const fileName = String(item?.fileName || '未命名文件').trim() || '未命名文件'
        const reason = String(item?.reason || '附件预检失败').trim() || '附件预检失败'
        const key = `${fileName}__${reason}`
        if (!seen.has(key)) {
          seen.add(key)
          next.push({ fileName, reason })
        }
      })
      return next.slice(0, 8)
    })

    const previewNames = dedupedItems.map((item) => item.fileName).slice(0, 3)
    const suffix = dedupedItems.length > 3 ? ` 等 ${dedupedItems.length} 个文件` : previewNames.join('、')
    message.warning(`以下附件预检失败：${suffix}。详情见下方失败列表`)
  }, [])

  const queueRejectedAttachment = useCallback((fileName, reason) => {
    rejectedAttachmentQueueRef.current = [
      ...(Array.isArray(rejectedAttachmentQueueRef.current) ? rejectedAttachmentQueueRef.current : []),
      {
        fileName: String(fileName || '未命名文件').trim() || '未命名文件',
        reason: String(reason || '附件预检失败').trim() || '附件预检失败',
      },
    ]
    if (rejectedAttachmentFlushTimerRef.current) return
    rejectedAttachmentFlushTimerRef.current = window.setTimeout(() => {
      flushRejectedAttachmentQueue()
    }, 160)
  }, [flushRejectedAttachmentQueue])

  const handleBeforeUpload = useCallback(async (file) => {
    attachmentCheckingCountRef.current += 1
    setAttachmentChecking(true)
    try {
      await precheckDraftAttachment(file)
      return false
    } catch (error) {
      queueRejectedAttachment(file?.name || '未命名文件', error?.message || '附件预检失败')
      return Upload.LIST_IGNORE
    } finally {
      attachmentCheckingCountRef.current = Math.max(0, attachmentCheckingCountRef.current - 1)
      setAttachmentChecking(attachmentCheckingCountRef.current > 0)
    }
  }, [queueRejectedAttachment])

  const handleAttachmentPreview = useCallback(async (file) => {
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
      setPreviewImage(previewSrc)
      setPreviewType(isVideoFile(file) ? 'video' : 'image')
      setPreviewTitle(file?.name || rawFile?.name || '附件预览')
      setPreviewOpen(true)
    } catch (error) {
      message.error(error?.message || '附件预览生成失败')
    }
  }, [])

  const renderDraftUploadItem = useCallback((originNode, file) => {
    const previewable = isImageFile(file) || isVideoFile(file)
    return (
      <div className="bug-form-modal__upload-list-item">
        {originNode}
        {previewable ? (
          <Button
            type="link"
            size="small"
            className="bug-form-modal__upload-preview-btn"
            icon={<EyeOutlined />}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void handleAttachmentPreview(file)
            }}
          >
            预览
          </Button>
        ) : null}
      </div>
    )
  }, [handleAttachmentPreview])

  const handleDescriptionImageUpload = useCallback(async (file) => {
    const currentFile = file instanceof File ? file : null
    if (!currentFile) {
      throw new Error('图片文件无效')
    }

    await precheckDraftAttachment(currentFile)

    if (isCreateMode) {
      const signature = buildAttachmentFileSignature(currentFile)
      const existingSignatures = new Set(
        (Array.isArray(draftFileListRef.current) ? draftFileListRef.current : []).map((item) => buildUploadFileSignature(item)),
      )
      const shouldAppendToDraftList = !existingSignatures.has(signature)
      if (shouldAppendToDraftList && (draftFileListRef.current?.length || 0) >= 9) {
        throw new Error('附件列表最多保留 9 个，无法再插入更多图片')
      }

      const token = createPendingDescriptionImageToken()
      const previewUrl = URL.createObjectURL(currentFile)
      pendingDescriptionPreviewUrlSetRef.current.add(previewUrl)
      pendingDescriptionImageMapRef.current.set(token, {
        signature,
        fileName: currentFile.name || '图片',
        objectUrl: previewUrl,
      })

      if (shouldAppendToDraftList) {
        const nextDraftFiles = mergeUniqueUploadFiles([
          ...(Array.isArray(draftFileListRef.current) ? draftFileListRef.current : []),
          buildDraftUploadFile(currentFile, token),
        ]).slice(0, 9)
        draftFileListRef.current = nextDraftFiles
        setDraftFileList(nextDraftFiles)
      }

      return {
        src: previewUrl,
        token,
        alt: currentFile.name || '图片',
        title: currentFile.name || '图片',
      }
    }

    const bugId = Number(initialValues?.id || 0)
    if (!bugId) {
      throw new Error('当前Bug尚未创建，无法上传图片')
    }

    const uploaded = await uploadBugAttachmentFile(bugId, currentFile)
    message.success('图片已插入描述，并同步到附件列表')
    return {
      src: uploaded?.object_url || uploaded?.download_url || '',
      attachmentId: uploaded?.id || null,
      alt: currentFile.name || '图片',
      title: currentFile.name || '图片',
    }
  }, [initialValues?.id, isCreateMode])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    const nextDemandId = normalizedDemandPreset || String(initialValues?.demand_id || '').trim()
    const initialAssigneeIds = Array.isArray(initialValues?.assignee_ids)
      ? initialValues.assignee_ids
      : []
    if (initialAssigneeIds.length === 0 && initialValues?.assignee_id) {
      initialAssigneeIds.push(initialValues.assignee_id)
    }
    const initialWatcherIds = Array.isArray(initialValues?.watcher_ids)
      ? initialValues.watcher_ids
      : []
    const nextValues = {
      title: initialValues?.title || '',
      description: buildBugDescriptionInitialHtml(initialValues),
      severity_code: initialValues?.severity_code || undefined,
      bug_type_code: initialValues?.bug_type_code || undefined,
      product_code: initialValues?.product_code || undefined,
      issue_stage: initialValues?.issue_stage || undefined,
      demand_id: nextDemandId || undefined,
      assignee_ids: initialAssigneeIds,
      watcher_ids: initialWatcherIds,
    }
    form.setFieldsValue(nextValues)
    loadAssignees(nextDemandId)
  }, [open, form, initialValues, normalizedDemandPreset, loadAssignees])

  useEffect(() => {
    if (!open) return
    loadAssignees(selectedDemandId)
  }, [selectedDemandId, open, loadAssignees])

  useEffect(() => {
    if (open) return
    form.resetFields()
  }, [form, open])

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields()
      const normalizedDescription = sanitizeBugDescriptionHtml(values.description, { keepPendingImages: true })
      const persistedDescription = hydrateBugDescriptionAttachmentUrls(
        normalizedDescription,
        initialValues?.attachments || [],
        { preferSignedUrl: false },
      )
      const currentDraftAttachments = (Array.isArray(draftFileListRef.current) ? draftFileListRef.current : [])
        .map((item) => item?.originFileObj || item)
        .filter(Boolean)
      if (!hasMeaningfulBugDescription(persistedDescription)) {
        form.setFields([{ name: 'description', errors: ['请输入Bug描述'] }])
        return
      }
      if (persistedDescription.length > 20000) {
        form.setFields([{ name: 'description', errors: ['描述内容过长，请精简后再保存'] }])
        return
      }
      const normalizedAssigneeIds = Array.from(
        new Set((Array.isArray(values.assignee_ids) ? values.assignee_ids : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
      )
      const normalizedWatcherIds = Array.from(
        new Set((Array.isArray(values.watcher_ids) ? values.watcher_ids : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
      )
      const pendingDescriptionImages = Array.from(pendingDescriptionImageMapRef.current.entries())
        .filter(([token, item]) => {
          const normalizedToken = String(token || '').trim()
          const objectUrl = String(item?.objectUrl || '').trim()
          return (normalizedToken && normalizedDescription.includes(normalizedToken)) || (objectUrl && normalizedDescription.includes(objectUrl))
        })
        .map(([token, item]) => ({
          token,
          signature: item?.signature || '',
          fileName: item?.fileName || '',
          objectUrl: item?.objectUrl || '',
        }))
      await onSubmit?.(
        {
          ...values,
          description: persistedDescription,
          assignee_ids: normalizedAssigneeIds,
          assignee_id: normalizedAssigneeIds[0] || null,
          watcher_ids: normalizedWatcherIds,
          demand_id: values.demand_id || null,
          bug_type_code: values.bug_type_code || null,
          product_code: values.product_code || null,
          issue_stage: values.issue_stage || null,
        },
        {
          draftAttachments: currentDraftAttachments,
          pendingDescriptionImages,
        },
      )
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存Bug失败')
    }
  }, [form, initialValues?.attachments, onSubmit])

  const isDrawer = presentation === 'drawer'
  const actionButtons = useMemo(
    () => (
      <Space>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" loading={confirmLoading} onClick={handleOk}>
          {submitText}
        </Button>
      </Space>
    ),
    [confirmLoading, handleOk, onCancel, submitText],
  )

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      className="bug-form-modal__form"
      disabled={loadingOptions || confirmLoading}
    >
      <div className="bug-form-modal__layout">
        <div className="bug-form-modal__main">
          <Form.Item
            label="Bug标题"
            name="title"
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请输入Bug标题' }]}
          >
            <Input.TextArea
              maxLength={200}
              placeholder="简明描述问题现象"
              autoSize={{ minRows: 1, maxRows: 6 }}
            />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            extra="支持基础排版，支持直接粘贴截图；新建时会在创建成功后自动把正文图片同步成Bug附件。"
            rules={[
              {
                validator: async (_, value) => {
                  if (hasMeaningfulBugDescription(value)) return
                  throw new Error('请输入Bug描述')
                },
              },
            ]}
          >
            <BugRichTextEditor
              placeholder={BUG_DESCRIPTION_TEMPLATE_TEXT}
              disabled={loadingOptions || confirmLoading}
              onUploadImage={handleDescriptionImageUpload}
            />
          </Form.Item>

          {showDraftAttachments ? (
            <Form.Item
              label="附件"
              extra="可选。Bug创建成功后将自动上传并关联到该Bug。"
            >
              <div onPaste={handleAttachmentPaste}>
                <Upload.Dragger
                  className="bug-form-modal__dragger"
                  multiple
                  beforeUpload={handleBeforeUpload}
                  pastable
                  listType="picture"
                  fileList={draftFileList}
                  onChange={handleAttachmentChange}
                  onPreview={handleAttachmentPreview}
                  showUploadList={{ showPreviewIcon: false }}
                  itemRender={renderDraftUploadItem}
                  maxCount={9}
                  disabled={attachmentChecking}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击、拖拽或粘贴上传附件（最多 9 个）</p>
                  <p className="ant-upload-hint">
                    {attachmentChecking ? '正在校验附件...' : '文件会在加入列表前先做可上传性校验'}
                  </p>
                </Upload.Dragger>
                {attachmentRejectList.length > 0 ? (
                  <Alert
                    className="bug-form-modal__attachment-alert"
                    type="warning"
                    showIcon
                    title={`最近有 ${attachmentRejectList.length} 个附件未通过预检`}
                    description={
                      <div className="bug-form-modal__attachment-alert-list">
                        {attachmentRejectList.map((item, index) => (
                          <div
                            className="bug-form-modal__attachment-alert-item"
                            key={`${item.fileName}-${item.reason}-${index}`}
                          >
                            <span className="bug-form-modal__attachment-alert-name">{item.fileName}</span>
                            <span className="bug-form-modal__attachment-alert-reason">{item.reason}</span>
                          </div>
                        ))}
                      </div>
                    }
                    closable
                    onClose={() => setAttachmentRejectList([])}
                  />
                ) : null}
              </div>
            </Form.Item>
          ) : null}
        </div>

        <div className="bug-form-modal__side">
          <div className="bug-form-modal__meta-card">
            <Form.Item label="产品模块" name="product_code">
              <Select allowClear options={productOptions} placeholder="可选" />
            </Form.Item>

            <Form.Item
              label="严重程度"
              name="severity_code"
              rules={[{ required: true, message: '请选择严重程度' }]}
            >
              <Select options={severityOptions} placeholder="请选择" />
            </Form.Item>

            <Form.Item label="Bug类型" name="bug_type_code">
              <Select allowClear options={bugTypeOptions} placeholder="可选" />
            </Form.Item>

            <Form.Item
              label="Bug阶段"
              name="issue_stage"
              rules={isCreateMode ? [{ required: true, message: '请选择Bug阶段' }] : []}
            >
              <Select allowClear={!isCreateMode} options={stageOptions} placeholder={isCreateMode ? '请选择' : '可选'} />
            </Form.Item>

            <Form.Item label="关联需求" name="demand_id">
              <Select
                allowClear={!lockDemand}
                showSearch
                options={demandOptions}
                filterOption={pinyinSelectFilter}
                disabled={lockDemand}
                placeholder={lockDemand ? '已锁定当前需求' : '可选'}
              />
            </Form.Item>

            <Form.Item
              label="处理人"
              name="assignee_ids"
              rules={[{ required: true, message: '请选择处理人' }]}
            >
              <Select
                mode="multiple"
                showSearch
                options={assigneeOptions}
                filterOption={pinyinSelectFilter}
                placeholder="可选择多个处理人"
                maxTagCount="responsive"
              />
            </Form.Item>

            <Form.Item
              label="关注人"
              name="watcher_ids"
            >
              <Select
                mode="multiple"
                showSearch
                options={assigneeOptions}
                filterOption={pinyinSelectFilter}
                placeholder="可选，补充需要关注该Bug的人"
                maxTagCount="responsive"
              />
            </Form.Item>
          </div>
        </div>
      </div>
    </Form>
  )

  const previewModal = (
    <Modal
      open={previewOpen}
      title={previewTitle}
      footer={null}
      onCancel={() => setPreviewOpen(false)}
      centered
      width={860}
    >
      {previewType === 'video' ? (
        <video
          className="bug-form-modal__preview-video"
          src={previewImage}
          controls
          preload="metadata"
        />
      ) : (
          <Image
            className="bug-form-modal__preview-image"
            src={previewImage}
            alt={previewTitle || '附件预览'}
            preview={{
              zIndex: 2100,
              cover: <span className="bug-form-modal__image-mask-hint">点击放大</span>,
            }}
          />
      )}
    </Modal>
  )

  if (isDrawer) {
    return (
      <Drawer
        open={open}
        title={title}
        size={900}
        className="bug-form-modal"
        onClose={onCancel}
        footer={actionButtons}
        destroyOnHidden
        mask={{ closable: true }}
      >
        <>
          {formContent}
          {previewModal}
        </>
      </Drawer>
    )
  }

  return (
    <Modal
      open={open}
      title={title}
      width={900}
      className="bug-form-modal"
      onCancel={onCancel}
      footer={actionButtons}
      destroyOnHidden
      mask={{ closable: true }}
    >
      <>
        {formContent}
        {previewModal}
      </>
    </Modal>
  )
}

export default BugFormModal
