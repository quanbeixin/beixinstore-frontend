import { Button, Form, Input, Modal, Select, Space, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDictItemsApi } from '../../../api/configDict'
import { getWorkDemandsApi } from '../../../api/work'
import { getBugAssigneesApi } from '../../../api/bug'
import './bug-form-modal.css'

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
}) {
  const [form] = Form.useForm()
  const selectedDemandId = Form.useWatch('demand_id', form)
  const [draftFileList, setDraftFileList] = useState([])
  const pastedFileCountRef = useRef(0)

  const [loadingOptions, setLoadingOptions] = useState(false)
  const [severityOptions, setSeverityOptions] = useState([])
  const [priorityOptions, setPriorityOptions] = useState([])
  const [bugTypeOptions, setBugTypeOptions] = useState([])
  const [productOptions, setProductOptions] = useState([])
  const [stageOptions, setStageOptions] = useState([])
  const [demandOptions, setDemandOptions] = useState([])
  const [assigneeOptions, setAssigneeOptions] = useState([])

  const normalizedDemandPreset = String(demandIdPreset || '').trim()

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const [severityRes, priorityRes, bugTypeRes, productRes, stageRes, demandRes] = await Promise.all([
        getDictItemsApi('bug_severity', { enabledOnly: true }),
        getDictItemsApi('bug_priority', { enabledOnly: true }),
        getDictItemsApi('bug_type', { enabledOnly: true }),
        getDictItemsApi('bug_product', { enabledOnly: true }),
        getDictItemsApi('bug_stage', { enabledOnly: true }),
        getWorkDemandsApi({ page: 1, pageSize: 200 }),
      ])

      setSeverityOptions(mapDictOptions(severityRes?.data || []))
      setPriorityOptions(mapDictOptions(priorityRes?.data || []))
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

  useEffect(() => {
    if (!open) return
    const nextDemandId = normalizedDemandPreset || String(initialValues?.demand_id || '').trim()
    const nextValues = {
      title: initialValues?.title || '',
      description: initialValues?.description || '',
      severity_code: initialValues?.severity_code || undefined,
      priority_code: initialValues?.priority_code || undefined,
      bug_type_code: initialValues?.bug_type_code || undefined,
      product_code: initialValues?.product_code || undefined,
      issue_stage: initialValues?.issue_stage || undefined,
      demand_id: nextDemandId || undefined,
      assignee_id: initialValues?.assignee_id || undefined,
      reproduce_steps: initialValues?.reproduce_steps || '',
      expected_result: initialValues?.expected_result || '',
      actual_result: initialValues?.actual_result || '',
      environment_info: initialValues?.environment_info || '',
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
      await onSubmit?.(
        {
          ...values,
          demand_id: values.demand_id || null,
          bug_type_code: values.bug_type_code || null,
          product_code: values.product_code || null,
          issue_stage: values.issue_stage || null,
          environment_info: values.environment_info || null,
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

  const footer = useMemo(
    () => [
      <Button key="cancel" onClick={onCancel}>
        取消
      </Button>,
      <Button key="submit" type="primary" loading={confirmLoading} onClick={handleOk}>
        {submitText}
      </Button>,
    ],
    [confirmLoading, handleOk, onCancel, submitText],
  )

  return (
    <Modal
      open={open}
      title={title}
      width={760}
      className="bug-form-modal"
      onCancel={onCancel}
      footer={footer}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" disabled={loadingOptions || confirmLoading}>
        <Space size={12} style={{ width: '100%' }} wrap>
          <Form.Item
            label="Bug标题"
            name="title"
            style={{ minWidth: 320, flex: 1 }}
            rules={[{ required: true, message: '请输入Bug标题' }]}
          >
            <Input maxLength={200} placeholder="简明描述问题现象" />
          </Form.Item>
          <Form.Item
            label="处理人"
            name="assignee_id"
            style={{ minWidth: 220 }}
            rules={[{ required: true, message: '请选择处理人' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={assigneeOptions}
              placeholder="请选择处理人"
            />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} wrap>
          <Form.Item
            label="严重程度"
            name="severity_code"
            style={{ minWidth: 160 }}
            rules={[{ required: true, message: '请选择严重程度' }]}
          >
            <Select options={severityOptions} placeholder="请选择" />
          </Form.Item>
          <Form.Item
            label="优先级"
            name="priority_code"
            style={{ minWidth: 160 }}
            rules={[{ required: true, message: '请选择优先级' }]}
          >
            <Select options={priorityOptions} placeholder="请选择" />
          </Form.Item>
          <Form.Item label="Bug类型" name="bug_type_code" style={{ minWidth: 160 }}>
            <Select allowClear options={bugTypeOptions} placeholder="可选" />
          </Form.Item>
          <Form.Item label="产品模块" name="product_code" style={{ minWidth: 160 }}>
            <Select allowClear options={productOptions} placeholder="可选" />
          </Form.Item>
          <Form.Item label="Bug阶段" name="issue_stage" style={{ minWidth: 160 }}>
            <Select allowClear options={stageOptions} placeholder="可选" />
          </Form.Item>
        </Space>

        <Form.Item label="关联需求" name="demand_id">
          <Select
            allowClear={!lockDemand}
            showSearch
            optionFilterProp="label"
            options={demandOptions}
            disabled={lockDemand}
            placeholder={lockDemand ? '已锁定当前需求' : '可选'}
          />
        </Form.Item>

        <Form.Item
          label="Bug描述"
          name="description"
          rules={[{ required: true, message: '请输入Bug描述' }]}
        >
          <Input.TextArea rows={3} maxLength={20000} placeholder="简明说明问题背景和影响范围" />
        </Form.Item>

        <Form.Item
          label="重现步骤"
          name="reproduce_steps"
          rules={[{ required: true, message: '请输入重现步骤' }]}
        >
          <Input.TextArea rows={4} maxLength={20000} placeholder="按顺序描述如何复现该问题" />
        </Form.Item>

        <Form.Item
          label="预期结果"
          name="expected_result"
          rules={[{ required: true, message: '请输入预期结果' }]}
        >
          <Input.TextArea rows={3} maxLength={20000} placeholder="正确行为应该是什么" />
        </Form.Item>

        <Form.Item
          label="实际结果"
          name="actual_result"
          rules={[{ required: true, message: '请输入实际结果' }]}
        >
          <Input.TextArea rows={3} maxLength={20000} placeholder="实际发生了什么" />
        </Form.Item>

        <Form.Item label="环境信息" name="environment_info">
          <Input.TextArea rows={2} maxLength={20000} placeholder="浏览器、系统、设备等，可选" />
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
                fileList={draftFileList}
                onChange={handleAttachmentChange}
                showUploadList={{ showPreviewIcon: false }}
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
      </Form>
    </Modal>
  )
}

export default BugFormModal
