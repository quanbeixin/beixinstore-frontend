import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMatrixPackageNotificationRuleApi,
  deleteMatrixPackageNotificationRuleApi,
  deleteNotificationTemplateFileApi,
  getMatrixPackageNotificationFeishuChatsApi,
  getMatrixPackageNotificationMetaApi,
  getMatrixPackageNotificationRulesApi,
  getNotificationTemplateFileUploadPolicyApi,
  getNotificationTemplateFilesApi,
  updateMatrixPackageNotificationRuleApi,
  upsertNotificationTemplateFileApi,
} from '../../api/matrixPackageNotification'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

const SCENE_TYPE_LABEL_MAP = {
  STATUS_CHANGE: '状态变更',
  UPCOMING: '即将到期',
  OVERDUE: '逾期提醒',
  SIDE_DEADLINE: '侧信息提醒',
  PRODUCTION_NODE_DEADLINE: '前置准备节点到期提醒',
  PREPARATION_ALL_COMPLETED: '前置准备全部完成通知',
  INVENTORY_LOW: '库存低水位',
}

const REMINDER_UNIT_OPTIONS = [
  { label: '小时', value: 'hour' },
  { label: '天', value: 'day' },
]
const ANY_STATUS_OPTION = { label: '任意状态', value: '*' }
const INVENTORY_TYPE_OPTIONS = [
  { label: '冷备包', value: 'COLD_STANDBY' },
  { label: '热备包', value: 'HOT_STANDBY' },
]
const MATRIX_PACKAGE_GROUP_SCENE_TYPES = new Set([
  'UPCOMING',
  'OVERDUE',
  'SIDE_DEADLINE',
  'PRODUCTION_NODE_DEADLINE',
  'PREPARATION_ALL_COMPLETED',
])

function normalizeTemplateRows(rows) {
  return (rows || []).map((row) => ({
    id: Number(row?.id || 0),
    template_key: String(row?.template_key || '').trim(),
    template_name: String(row?.template_name || '').trim(),
    description: String(row?.description || '').trim(),
    sort_order: Number(row?.sort_order || 0),
    file_name: String(row?.file_name || '').trim(),
    mime_type: String(row?.mime_type || '').trim(),
    storage_provider: String(row?.storage_provider || '').trim(),
    bucket_name: String(row?.bucket_name || '').trim(),
    object_key: String(row?.object_key || '').trim(),
    object_url: String(row?.object_url || '').trim(),
    download_url: String(row?.download_url || '').trim(),
    preview_url: String(row?.preview_url || '').trim(),
    updated_by_name: String(row?.updated_by_name || '').trim(),
    updated_at: row?.updated_at || null,
  }))
}

function isDirectLinkTemplate(row) {
  return Boolean(row?.object_url) && !row?.object_key
}

function buildUploadFormData(policy = {}, file = null) {
  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  return formData
}

function MatrixPackageNotificationPage() {
  const [form] = Form.useForm()
  const [templateForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rules, setRules] = useState([])
  const [meta, setMeta] = useState({ scenes: [], statuses: [] })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [chatOptions, setChatOptions] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('rules')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateRows, setTemplateRows] = useState([])
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateSavingKey, setTemplateSavingKey] = useState('')
  const [templateFileList, setTemplateFileList] = useState([])

  const statusOptions = useMemo(
    () => (Array.isArray(meta.statuses) ? meta.statuses.map((item) => ({ label: item.name, value: item.code })) : []),
    [meta.statuses],
  )

  const sceneOptions = useMemo(
    () => (Array.isArray(meta.scenes) ? meta.scenes.map((item) => ({ label: item.name, value: item.code })) : []),
    [meta.scenes],
  )

  const sceneMap = useMemo(() => {
    const map = new Map()
    ;(meta.scenes || []).forEach((item) => {
      map.set(item.code, item)
    })
    return map
  }, [meta.scenes])

  const sortedTemplateRows = useMemo(
    () => [...templateRows].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [templateRows],
  )

  const loadChats = useCallback(async (keyword = '') => {
    setChatLoading(true)
    try {
      let pageToken = ''
      let pageCount = 0
      const aggregated = []

      while (pageCount < 10) {
        const result = await getMatrixPackageNotificationFeishuChatsApi({
          keyword,
          page_size: 100,
          page_token: pageToken,
        })
        if (!result?.success) {
          message.error(result?.message || '获取飞书群失败')
          return
        }

        const items = Array.isArray(result?.data?.items) ? result.data.items : []
        aggregated.push(...items)

        if (!result?.data?.has_more || !result?.data?.next_page_token) {
          break
        }
        pageToken = result.data.next_page_token
        pageCount += 1
      }

      const dedupedItems = Array.from(
        new Map(
          aggregated.map((item) => [
            item?.chat_id,
            {
              label: item?.name ? `${item.name} (${item.chat_id})` : item.chat_id,
              value: item?.chat_id,
            },
          ]),
        ).values(),
      )

      setChatOptions(dedupedItems)
    } finally {
      setChatLoading(false)
    }
  }, [])

  const loadPageData = useCallback(async () => {
    setLoading(true)
    try {
      const [metaResult, rulesResult] = await Promise.all([
        getMatrixPackageNotificationMetaApi(),
        getMatrixPackageNotificationRulesApi(),
      ])

      if (!metaResult?.success) {
        message.error(metaResult?.message || '获取通知配置元数据失败')
        return
      }
      if (!rulesResult?.success) {
        message.error(rulesResult?.message || '获取通知规则失败')
        return
      }

      setMeta(metaResult.data || { scenes: [], statuses: [] })
      setRules(Array.isArray(rulesResult.data) ? rulesResult.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTemplateData = useCallback(async () => {
    setTemplateLoading(true)
    try {
      const result = await getNotificationTemplateFilesApi()
      if (!result?.success) {
        message.error(result?.message || '获取通用文件模板失败')
        return
      }
      setTemplateRows(normalizeTemplateRows(result.data))
    } catch (error) {
      message.error(error?.message || '获取通用文件模板失败')
    } finally {
      setTemplateLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPageData()
    loadChats()
    loadTemplateData()
  }, [loadPageData, loadChats, loadTemplateData])

  const sceneCode = Form.useWatch('scene_code', form)
  const sceneType = sceneMap.get(sceneCode)?.type || ''

  const openCreateModal = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({
      scene_code: 'matrix_package_status_change',
      status_transitions: [{ from_status: '*', to_status: undefined }],
      schedule_hour: 9,
      schedule_minute: 0,
      reminder_offset_unit: 'hour',
      reminder_offset_value: 24,
      inventory_type: 'HOT_STANDBY',
      threshold_count: 3,
      chat_id_manual: '',
      is_enabled: true,
    })
    setModalOpen(true)
  }

  const openEditModal = (rule) => {
    setEditingRule(rule)
    form.setFieldsValue({
      rule_name: rule.rule_name,
      scene_code: rule.scene_code,
      chat_id: rule.chat_id || undefined,
      chat_id_manual: '',
      status_transitions:
        Array.isArray(rule.status_transitions) && rule.status_transitions.length > 0
          ? rule.status_transitions
          : [{ from_status: '*', to_status: undefined }],
      schedule_hour: rule.schedule?.hour ?? 9,
      schedule_minute: rule.schedule?.minute ?? 0,
      reminder_offset_unit: rule.reminder?.offset_unit || 'hour',
      reminder_offset_value: rule.reminder?.offset_value ?? 24,
      inventory_type: rule.inventory?.inventory_type || 'HOT_STANDBY',
      threshold_count: rule.inventory?.threshold_count ?? 3,
      is_enabled: Number(rule.is_enabled) === 1,
    })
    if (rule.chat_id && rule.chat_name) {
      setChatOptions((current) => {
        const exists = current.some((item) => item.value === rule.chat_id)
        if (exists) return current
        return [{ label: rule.chat_name, value: rule.chat_id }, ...current]
      })
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRule(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const manualChatId = String(values.chat_id_manual || '').trim()
      const finalChatId = manualChatId || values.chat_id
      const selectedChatOption = chatOptions.find((item) => item.value === finalChatId)
      const selectedSceneType = sceneMap.get(values.scene_code)?.type || ''
      const useMatrixPackageGroup = MATRIX_PACKAGE_GROUP_SCENE_TYPES.has(selectedSceneType)
      const payload = {
        rule_name: values.rule_name,
        scene_code: values.scene_code,
        is_enabled: values.is_enabled ? 1 : 0,
      }

      if (!useMatrixPackageGroup) {
        payload.chat_id = finalChatId
        payload.chat_name = selectedChatOption?.label || finalChatId
      }

      if (selectedSceneType === 'STATUS_CHANGE') {
        payload.status_transitions = (values.status_transitions || []).map((item) => ({
          from_status: item?.from_status || '*',
          to_status: item?.to_status,
        }))
      } else if (['UPCOMING', 'OVERDUE', 'SIDE_DEADLINE', 'PRODUCTION_NODE_DEADLINE'].includes(selectedSceneType)) {
        payload.schedule = {
          hour: values.schedule_hour,
          minute: values.schedule_minute,
        }
      }

      if (['UPCOMING', 'SIDE_DEADLINE', 'PRODUCTION_NODE_DEADLINE'].includes(selectedSceneType)) {
        payload.reminder = {
          offset_unit: values.reminder_offset_unit,
          offset_value: values.reminder_offset_value,
        }
      }

      if (selectedSceneType === 'INVENTORY_LOW') {
        payload.inventory = {
          inventory_type: values.inventory_type,
          threshold_count: values.threshold_count,
        }
      }

      setSubmitting(true)
      const result = editingRule
        ? await updateMatrixPackageNotificationRuleApi(editingRule.id, payload)
        : await createMatrixPackageNotificationRuleApi(payload)

      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success(editingRule ? '规则已更新' : '规则已创建')
      closeModal()
      await loadPageData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (rule) => {
    const result = await deleteMatrixPackageNotificationRuleApi(rule.id)
    if (!result?.success) {
      message.error(result?.message || '删除失败')
      return
    }
    message.success('规则已删除')
    await loadPageData()
  }

  const openTemplateModal = (row = null) => {
    setEditingTemplate(row || null)
    templateForm.setFieldsValue({
      template_key: row?.template_key || '',
      template_name: row?.template_name || '',
      description: row?.description || '',
      sort_order: row?.sort_order ?? 100,
      object_url: row?.object_url || '',
    })
    setTemplateFileList([])
    setTemplateModalOpen(true)
  }

  const closeTemplateModal = () => {
    setTemplateModalOpen(false)
    setEditingTemplate(null)
    setTemplateFileList([])
    templateForm.resetFields()
  }

  const handleTemplateDownload = (row) => {
    const downloadUrl = row?.download_url || row?.preview_url || row?.object_url || ''
    if (!downloadUrl) {
      message.warning('暂无可下载的文件')
      return
    }
    window.open(downloadUrl, '_blank', 'noopener,noreferrer')
  }

  const handleTemplateDelete = async (row) => {
    const templateKey = String(row?.template_key || '').trim()
    if (!templateKey) return

    const result = await deleteNotificationTemplateFileApi(templateKey)
    if (!result?.success) {
      message.error(result?.message || '删除模板失败')
      return
    }

    message.success('模板已删除')
    await loadTemplateData()
  }

  const handleTemplateSubmit = async () => {
    try {
      const values = await templateForm.validateFields()
      const templateKey = String(values.template_key || '').trim().toLowerCase()
      const selectedFile = templateFileList?.[0]?.originFileObj || null

      setTemplateSavingKey(templateKey)

      let uploadMeta = null
      if (selectedFile) {
        const policyResult = await getNotificationTemplateFileUploadPolicyApi({
          template_key: templateKey,
          file_name: selectedFile.name,
          file_size: selectedFile.size || 0,
          mime_type: selectedFile.type || '',
        })
        if (!policyResult?.success) {
          throw new Error(policyResult?.message || '获取上传策略失败')
        }
        const policy = policyResult.data || {}
        const uploadResponse = await fetch(policy.host, {
          method: 'POST',
          body: buildUploadFormData(policy, selectedFile),
        })
        if (!uploadResponse.ok) {
          throw new Error(`上传失败(${uploadResponse.status})`)
        }
        uploadMeta = {
          storage_provider: policy.provider || 'ALIYUN_OSS',
          bucket_name: policy.bucket_name || '',
          object_key: policy.object_key || '',
          object_url: policy.object_url || '',
          file_name: selectedFile.name || '',
          mime_type: selectedFile.type || '',
        }
      }

      const result = await upsertNotificationTemplateFileApi(templateKey, {
        template_name: values.template_name,
        description: values.description,
        sort_order: values.sort_order,
        object_url: uploadMeta ? uploadMeta.object_url : (String(values.object_url || '').trim() || ''),
        file_name: uploadMeta ? uploadMeta.file_name : '',
        mime_type: uploadMeta ? uploadMeta.mime_type : '',
        storage_provider: uploadMeta ? uploadMeta.storage_provider : '',
        bucket_name: uploadMeta ? uploadMeta.bucket_name : '',
        object_key: uploadMeta ? uploadMeta.object_key : '',
        ...(uploadMeta || {}),
      })
      if (!result?.success) {
        throw new Error(result?.message || '保存模板失败')
      }
      message.success('模板已保存')
      closeTemplateModal()
      await loadTemplateData()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存模板失败')
    } finally {
      setTemplateSavingKey('')
    }
  }

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 220,
    },
    {
      title: '规则类型',
      dataIndex: 'scene_type',
      key: 'scene_type',
      width: 120,
      render: (value, record) => (
        <Tag color={value === 'STATUS_CHANGE' ? 'blue' : value === 'UPCOMING' ? 'gold' : value === 'INVENTORY_LOW' ? 'purple' : 'red'}>
          {SCENE_TYPE_LABEL_MAP[value] || record.scene_name}
        </Tag>
      ),
    },
    {
      title: '触发条件',
      dataIndex: 'trigger_summary',
      key: 'trigger_summary',
    },
    {
      title: '通知对象',
      dataIndex: 'receiver_label',
      key: 'receiver_label',
      width: 220,
      render: (value, record) => value || record.chat_name || record.chat_id || '-',
    },
    {
      title: '启用',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 90,
      render: (value) => <Tag color={Number(value) === 1 ? 'success' : 'default'}>{Number(value) === 1 ? '启用' : '停用'}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_value, record) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除这条通知规则？" onConfirm={() => handleDelete(record)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const templateColumns = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 240,
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value || '-'}</Text>
          <Text type="secondary">{row.description || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '模板编码',
      dataIndex: 'template_key',
      key: 'template_key',
      width: 180,
      render: (value) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: '当前资源',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Text>{value || row.object_url || '未上传'}</Text>
          {row.object_key ? <Text type="secondary" style={{ fontSize: 12 }}>{row.object_key}</Text> : null}
        </Space>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Text>{formatBeijingDateTime(value)}</Text>
          {row.updated_by_name ? <Text type="secondary" style={{ fontSize: 12 }}>{row.updated_by_name}</Text> : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openTemplateModal(row)}
          >
            编辑
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!row.download_url && !row.preview_url && !row.object_url}
            onClick={() => handleTemplateDownload(row)}
          >
            {isDirectLinkTemplate(row) ? '打开' : '下载'}
          </Button>
          <Popconfirm title="确认删除这个通用文件模板？" onConfirm={() => handleTemplateDelete(row)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Card
        title="通知配置"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={activeTab === 'rules' ? loadPageData : loadTemplateData}
            >
              刷新
            </Button>
            {activeTab === 'rules' ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                新建规则
              </Button>
            ) : null}
            {activeTab === 'template' ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openTemplateModal()}>
                新增模板
              </Button>
            ) : null}
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'rules',
              label: '通知配置',
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={columns}
                  dataSource={rules}
                  pagination={false}
                  locale={{ emptyText: '暂无通知规则' }}
                />
              ),
            },
            {
              key: 'template',
              label: '通用文件模板',
              children: (
                <Table
                  rowKey="template_key"
                  loading={templateLoading}
                  columns={templateColumns}
                  dataSource={sortedTemplateRows}
                  pagination={false}
                  scroll={{ x: 1020 }}
                  locale={{ emptyText: '暂无通用文件模板' }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingRule ? '编辑通知规则' : '新建通知规则'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="rule_name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input maxLength={128} placeholder="例如：冷备包即将到期提醒" />
          </Form.Item>

          <Form.Item name="scene_code" label="通知场景" rules={[{ required: true, message: '请选择通知场景' }]}>
            <Select options={sceneOptions} />
          </Form.Item>

          {!MATRIX_PACKAGE_GROUP_SCENE_TYPES.has(sceneType) ? (
            <>
              <Form.Item
                name="chat_id"
                label="飞书群"
                dependencies={['chat_id_manual']}
                rules={[
                  {
                    validator: async () => {
                      const selectedChatId = String(form.getFieldValue('chat_id') || '').trim()
                      const manualChatId = String(form.getFieldValue('chat_id_manual') || '').trim()
                      if (selectedChatId || manualChatId) return
                      throw new Error('请选择飞书群或手动填写 chat_id')
                    },
                  },
                ]}
              >
                <Select
                  allowClear
                  showSearch
                  filterOption={false}
                  onFocus={() => loadChats('')}
                  onSearch={(value) => loadChats(value)}
                  placeholder="优先搜索选择飞书群"
                  notFoundContent={chatLoading ? '加载中...' : '暂无数据'}
                  options={chatOptions}
                />
              </Form.Item>

              <Form.Item name="chat_id_manual" label="手动填写 chat_id">
                <Input placeholder="如果群下拉里搜不到，可直接填写 chat_id" />
              </Form.Item>
            </>
          ) : (
            <Form.Item label="通知对象">
              <Input value="矩阵包生产群" disabled />
            </Form.Item>
          )}

          {sceneType === 'STATUS_CHANGE' ? (
            <Form.Item label="状态流转">
              <Form.List name="status_transitions">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {fields.map((field) => (
                      <Space key={field.key} align="start" style={{ display: 'flex' }}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'from_status']}
                          rules={[{ required: true, message: '请选择原状态' }]}
                          style={{ width: 180, marginBottom: 0 }}
                        >
                          <Select options={[ANY_STATUS_OPTION, ...statusOptions]} placeholder="原状态" />
                        </Form.Item>
                        <div style={{ lineHeight: '32px', color: '#8c8c8c' }}>→</div>
                        <Form.Item
                          {...field}
                          name={[field.name, 'to_status']}
                          rules={[{ required: true, message: '请选择新状态' }]}
                          style={{ width: 180, marginBottom: 0 }}
                        >
                          <Select options={statusOptions} placeholder="新状态" />
                        </Form.Item>
                        <Button danger type="text" onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ from_status: '*', to_status: undefined })} block>
                      新增流转
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          ) : null}

          {sceneType === 'INVENTORY_LOW' ? (
            <Space.Compact block>
              <Form.Item
                style={{ width: '50%' }}
                name="inventory_type"
                label="库存类型"
                rules={[{ required: true, message: '请选择库存类型' }]}
              >
                <Select options={INVENTORY_TYPE_OPTIONS} />
              </Form.Item>
              <Form.Item
                style={{ width: '50%' }}
                name="threshold_count"
                label="低库存准线"
                rules={[{ required: true, message: '请输入低库存准线' }]}
              >
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Space.Compact>
          ) : null}

          {sceneType !== 'STATUS_CHANGE' && sceneType !== 'INVENTORY_LOW' ? (
            <Space.Compact block>
              <Form.Item
                style={{ width: '50%' }}
                name="schedule_hour"
                label="扫描小时"
                rules={[{ required: true, message: '请输入扫描小时' }]}
              >
                <InputNumber min={0} max={23} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                style={{ width: '50%' }}
                name="schedule_minute"
                label="扫描分钟"
                rules={[{ required: true, message: '请输入扫描分钟' }]}
              >
                <InputNumber min={0} max={59} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Space.Compact>
          ) : null}

          {sceneType === 'UPCOMING' || sceneType === 'SIDE_DEADLINE' || sceneType === 'PRODUCTION_NODE_DEADLINE' ? (
            <Space.Compact block>
              <Form.Item
                style={{ width: '50%' }}
                name="reminder_offset_value"
                label="提前阈值"
                rules={[{ required: true, message: '请输入提前阈值' }]}
              >
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                style={{ width: '50%' }}
                name="reminder_offset_unit"
                label="阈值单位"
                rules={[{ required: true, message: '请选择阈值单位' }]}
              >
                <Select options={REMINDER_UNIT_OPTIONS} />
              </Form.Item>
            </Space.Compact>
          ) : null}

          <Form.Item name="is_enabled" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingTemplate ? '编辑通用文件模板' : '新增通用文件模板'}
        open={templateModalOpen}
        onCancel={closeTemplateModal}
        onOk={handleTemplateSubmit}
        okButtonProps={{ loading: Boolean(templateSavingKey) }}
        destroyOnClose
        width={720}
      >
        <Form form={templateForm} layout="vertical">
          <Form.Item
            name="template_key"
            label="模板编码"
            rules={[{ required: true, message: '请输入模板编码' }]}
          >
            <Input
              allowClear
              maxLength={64}
              disabled={Boolean(editingTemplate)}
              placeholder="例如：data_safety_file"
            />
          </Form.Item>
          <Form.Item
            name="template_name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input allowClear maxLength={100} placeholder="例如：报名-数据安全文件" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input allowClear maxLength={255} placeholder="可选" />
          </Form.Item>
          <Form.Item name="object_url" label="链接地址">
            <Input allowClear maxLength={1000} placeholder="可选，适用于固定链接模板" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="文件">
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              fileList={templateFileList}
              onChange={({ fileList }) => setTemplateFileList(fileList.slice(-1))}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              选择文件后会自动上传并保存到模板记录中。
            </Text>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MatrixPackageNotificationPage
