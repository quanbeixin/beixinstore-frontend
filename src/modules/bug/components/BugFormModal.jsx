import { Button, Drawer, Form, Input, Modal, Select, Space, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDictItemsApi } from '../../../api/configDict'
import { getWorkDemandsApi } from '../../../api/work'
import { getBugAssigneesApi } from '../../../api/bug'
import { pinyinSelectFilter } from '../../../utils/selectSearch'
import './bug-form-modal.css'

const BUG_DESCRIPTION_TEMPLATE = `【前置条件】

【复现步骤】

【实际结果】

【预期结果】
-`

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

function buildDescriptionInitialValue(initialValues = null) {
  const description = String(initialValues?.description || '').trim()
  if (description) return description

  const reproduceSteps = String(initialValues?.reproduce_steps || '').trim()
  const actualResult = String(initialValues?.actual_result || '').trim()
  const expectedResult = String(initialValues?.expected_result || '').trim()
  const hasLegacyContent = reproduceSteps || actualResult || expectedResult
  if (!hasLegacyContent) return BUG_DESCRIPTION_TEMPLATE

  return `【前置条件】

【复现步骤】
${reproduceSteps}

【实际结果】
${actualResult}

【预期结果】
${expectedResult}
-`
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
}) {
  const [form] = Form.useForm()
  const selectedDemandId = Form.useWatch('demand_id', form)
  const [draftFileList, setDraftFileList] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [previewType, setPreviewType] = useState('image')
  const [previewTitle, setPreviewTitle] = useState('')
  const pastedFileCountRef = useRef(0)

  const [loadingOptions, setLoadingOptions] = useState(false)
  const [severityOptions, setSeverityOptions] = useState([])
  const [bugTypeOptions, setBugTypeOptions] = useState([])
  const [productOptions, setProductOptions] = useState([])
  const [stageOptions, setStageOptions] = useState([])
  const [demandOptions, setDemandOptions] = useState([])
  const [assigneeOptions, setAssigneeOptions] = useState([])
  const isCreateMode = !initialValues?.id

  const normalizedDemandPreset = String(demandIdPreset || '').trim()

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
    try {
      const result = await getBugAssigneesApi({
        demand_id: demandId || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取处理人列表失败')
        return
      }
      setAssigneeOptions(mapAssigneeOptions(result.data || []))
    } catch (error) {
      message.error(error?.message || '获取处理人列表失败')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadOptions()
  }, [open, loadOptions])

  useEffect(() => {
    if (open) return
    setDraftFileList([])
    setPreviewOpen(false)
    setPreviewImage('')
    setPreviewType('image')
    setPreviewTitle('')
    pastedFileCountRef.current = 0
  }, [open])

  const handleAttachmentPaste = useCallback((event) => {
    const clipboardFiles = Array.from(event?.clipboardData?.files || []).filter(Boolean)
    pastedFileCountRef.current = clipboardFiles.length
  }, [])

  const handleAttachmentChange = useCallback(({ fileList }) => {
    const nextList = fileList.slice(0, 9)
    setDraftFileList((prevList) => {
      const addedCount = Math.max(0, nextList.length - prevList.length)
      if (addedCount > 0 && pastedFileCountRef.current > 0) {
        message.success(`已粘贴 ${Math.min(addedCount, pastedFileCountRef.current)} 个附件`)
      }
      pastedFileCountRef.current = 0
      return nextList
    })
  }, [])

  const handleAttachmentPreview = useCallback(async (file) => {
    if (!isImageFile(file) && !isVideoFile(file)) {
      message.info('当前附件暂不支持预览')
      return
    }

    try {
      let previewSrc = file?.url || file?.thumbUrl || file?.preview || ''
      const rawFile = file?.originFileObj
      if (!previewSrc && rawFile instanceof Blob && isImageFile(file)) {
        previewSrc = await readFileAsDataUrl(rawFile)
      }
      if (!previewSrc && rawFile instanceof Blob && isVideoFile(file)) {
        previewSrc = URL.createObjectURL(rawFile)
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

  useEffect(() => {
    if (!open) return
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
      description: buildDescriptionInitialValue(initialValues),
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

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validateFields()
      const normalizedAssigneeIds = Array.from(
        new Set((Array.isArray(values.assignee_ids) ? values.assignee_ids : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
      )
      const normalizedWatcherIds = Array.from(
        new Set((Array.isArray(values.watcher_ids) ? values.watcher_ids : []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
      )
      await onSubmit?.(
        {
          ...values,
          assignee_ids: normalizedAssigneeIds,
          assignee_id: normalizedAssigneeIds[0] || null,
          watcher_ids: normalizedWatcherIds,
          demand_id: values.demand_id || null,
          bug_type_code: values.bug_type_code || null,
          product_code: values.product_code || null,
          issue_stage: values.issue_stage || null,
        },
        {
          draftAttachments: draftFileList.map((item) => item?.originFileObj || item).filter(Boolean),
        },
      )
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存Bug失败')
    }
  }, [draftFileList, form, onSubmit])

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
            <Input maxLength={200} placeholder="简明描述问题现象" />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[{ required: true, message: '请输入Bug描述' }]}
          >
            <Input.TextArea rows={9} maxLength={20000} placeholder={BUG_DESCRIPTION_TEMPLATE} />
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
                  beforeUpload={() => false}
                  pastable
                  listType="picture"
                  fileList={draftFileList}
                  onChange={handleAttachmentChange}
                  onPreview={handleAttachmentPreview}
                  showUploadList={{ showPreviewIcon: true }}
                  maxCount={9}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击、拖拽或粘贴上传附件（最多 9 个）</p>
                </Upload.Dragger>
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
        <img className="bug-form-modal__preview-image" src={previewImage} alt={previewTitle || '附件预览'} />
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
