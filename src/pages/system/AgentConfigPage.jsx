import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAgentApi,
  getAgentsApi,
  updateAgentApi,
  updateAgentEnabledApi,
} from '../../api/agent'
import { hasRole } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Search, TextArea } = Input
const { Paragraph, Text } = Typography

const AGENT_SCENE_OPTIONS = [
  {
    value: 'MORNING_STANDUP_ANALYSIS',
    label: '晨会看板分析',
    description: '用于晨会看板中的人工触发分析场景。',
  },
  {
    value: 'DEMAND_POOL_ANALYSIS',
    label: '需求池分析',
    description: '用于需求池列表页中基于当前筛选结果做整体分析。',
  },
]

const DEFAULT_FORM_VALUES = {
  agent_code: '',
  agent_name: '',
  business_purpose: '',
  scene_code: 'MORNING_STANDUP_ANALYSIS',
  description: '',
  model: 'gpt-4o-mini',
  system_prompt: '',
  output_format_instruction: '请输出清晰、简洁、可执行的纯文本分析结果。',
  temperature: 0.7,
  max_tokens: 2000,
  enabled: true,
  sort_order: 100,
}

function getSceneMeta(sceneCode) {
  return AGENT_SCENE_OPTIONS.find((item) => item.value === sceneCode) || null
}

function normalizeAgentRecord(record = {}) {
  return {
    ...record,
    id: Number(record?.id || 0),
    enabled: Number(record?.enabled) === 1 ? 1 : 0,
    temperature: Number.isFinite(Number(record?.temperature)) ? Number(record.temperature) : 0.7,
    max_tokens: Number.isInteger(Number(record?.max_tokens)) ? Number(record.max_tokens) : 2000,
    sort_order: Number.isInteger(Number(record?.sort_order)) ? Number(record.sort_order) : 100,
  }
}

function AgentConfigPage() {
  const canManage = hasRole('ADMIN') || hasRole('SUPER_ADMIN')
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toggleLoadingId, setToggleLoadingId] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({
    scene_code: '',
    enabled: 'ALL',
    keyword: '',
  })
  const [keywordInput, setKeywordInput] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAgentsApi({
        ...(filters.scene_code ? { scene_code: filters.scene_code } : {}),
        ...(filters.enabled === 'ALL' ? {} : { enabled: filters.enabled === 'ENABLED' ? 1 : 0 }),
        ...(filters.keyword ? { keyword: filters.keyword } : {}),
      })
      if (!result?.success) {
        message.error(result?.message || '获取 Agent 配置失败')
        return
      }
      setRows((result?.data || []).map((item) => normalizeAgentRecord(item)))
    } catch (error) {
      message.error(error?.message || '获取 Agent 配置失败')
    } finally {
      setLoading(false)
    }
  }, [filters.enabled, filters.keyword, filters.scene_code])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreateModal = useCallback(() => {
    setEditingRecord(null)
    form.setFieldsValue(DEFAULT_FORM_VALUES)
    setModalOpen(true)
  }, [form])

  const openEditModal = useCallback(
    (record) => {
      const normalized = normalizeAgentRecord(record)
      setEditingRecord(normalized)
      form.setFieldsValue({
        ...normalized,
        enabled: normalized.enabled === 1,
      })
      setModalOpen(true)
    },
    [form],
  )

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }, [form])

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        enabled: values.enabled ? 1 : 0,
      }

      const result = editingRecord
        ? await updateAgentApi(editingRecord.id, payload)
        : await createAgentApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingRecord ? '更新 Agent 失败' : '创建 Agent 失败'))
        return
      }

      message.success(editingRecord ? 'Agent 更新成功' : 'Agent 创建成功')
      closeModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || (editingRecord ? '更新 Agent 失败' : '创建 Agent 失败'))
    } finally {
      setSubmitting(false)
    }
  }, [closeModal, editingRecord, form, loadData])

  const handleToggleEnabled = useCallback(
    async (record, checked) => {
      try {
        setToggleLoadingId(record.id)
        const result = await updateAgentEnabledApi(record.id, checked ? 1 : 0)
        if (!result?.success) {
          message.error(result?.message || '更新 Agent 状态失败')
          return
        }
        message.success(`Agent 已${checked ? '启用' : '停用'}`)
        setRows((prev) =>
          prev.map((item) =>
            item.id === record.id ? normalizeAgentRecord(result?.data || { ...item, enabled: checked ? 1 : 0 }) : item,
          ),
        )
      } catch (error) {
        message.error(error?.message || '更新 Agent 状态失败')
      } finally {
        setToggleLoadingId(0)
      }
    },
    [],
  )

  const columns = useMemo(
    () => [
      {
        title: 'Agent',
        dataIndex: 'agent_name',
        key: 'agent_name',
        width: 260,
        render: (_, record) => (
          <Space orientation="vertical" size={2}>
            <Space size={6} wrap>
              <Text strong>{record.agent_name || '-'}</Text>
              <Tag>{record.agent_code || '-'}</Tag>
              {record.enabled === 1 ? <Tag color="success">启用中</Tag> : <Tag>未启用</Tag>}
            </Space>
            {record.description ? <Text type="secondary">{record.description}</Text> : null}
          </Space>
        ),
      },
      {
        title: '业务定位',
        dataIndex: 'business_purpose',
        key: 'business_purpose',
        width: 260,
        ellipsis: true,
        render: (value) => (
          <Paragraph ellipsis={{ rows: 2, tooltip: value || '-' }} style={{ marginBottom: 0 }}>
            {value || '-'}
          </Paragraph>
        ),
      },
      {
        title: '适用场景',
        dataIndex: 'scene_code',
        key: 'scene_code',
        width: 180,
        render: (value) => {
          const meta = getSceneMeta(value)
          return (
            <Space orientation="vertical" size={2}>
              <Tag color="blue" style={{ width: 'fit-content' }}>
                {meta?.label || value || '-'}
              </Tag>
              <Text type="secondary">{meta?.description || '-'}</Text>
            </Space>
          )
        },
      },
      {
        title: '模型参数',
        key: 'model',
        width: 220,
        render: (_, record) => (
          <Space orientation="vertical" size={2}>
            <Text strong>{record.model || '-'}</Text>
            <Text type="secondary">{`temperature=${record.temperature} · max_tokens=${record.max_tokens}`}</Text>
          </Space>
        ),
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        key: 'enabled',
        width: 100,
        render: (value, record) => (
          <Switch
            size="small"
            checked={Number(value) === 1}
            disabled={!canManage}
            loading={toggleLoadingId === record.id}
            onChange={(checked) => handleToggleEnabled(record, checked)}
          />
        ),
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 190,
        render: (value, record) => (
          <Space orientation="vertical" size={2}>
            <Text>{formatBeijingDateTime(value)}</Text>
            <Text type="secondary">{record.updated_by_name || '系统'}</Text>
          </Space>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link"
            icon={<EditOutlined />}
            disabled={!canManage}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
        ),
      },
    ],
    [canManage, handleToggleEnabled, openEditModal, toggleLoadingId],
  )

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title="Agent 配置"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!canManage} onClick={openCreateModal}>
              新建 Agent
            </Button>
          </Space>
        }
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap size={12}>
            <Select
              style={{ width: 180 }}
              placeholder="全部场景"
              value={filters.scene_code || undefined}
              allowClear
              options={AGENT_SCENE_OPTIONS}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, scene_code: value || '' }))
              }}
            />
            <Select
              style={{ width: 160 }}
              value={filters.enabled}
              options={[
                { value: 'ALL', label: '全部状态' },
                { value: 'ENABLED', label: '仅启用' },
                { value: 'DISABLED', label: '仅停用' },
              ]}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, enabled: value }))
              }}
            />
            <Search
              allowClear
              placeholder="搜索名称 / 编码 / 业务定位"
              style={{ width: 280 }}
              value={keywordInput}
              enterButton={<SearchOutlined />}
              onChange={(event) => {
                const nextValue = String(event?.target?.value || '')
                setKeywordInput(nextValue)
                if (!nextValue.trim()) {
                  setFilters((prev) => ({ ...prev, keyword: '' }))
                }
              }}
              onSearch={(value) => {
                const nextKeyword = String(value || '').trim()
                setKeywordInput(nextKeyword)
                setFilters((prev) => ({ ...prev, keyword: nextKeyword }))
              }}
            />
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1180 }}
          />
        </Space>
      </Card>

      <Modal
        title={editingRecord ? '编辑 Agent' : '新建 Agent'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        okText={editingRecord ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={submitting}
        width={880}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={DEFAULT_FORM_VALUES}
          preserve={false}
        >
          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item
              label="Agent 编码"
              name="agent_code"
              style={{ flex: 1 }}
              rules={[
                { required: true, message: '请输入 Agent 编码' },
                { pattern: /^[A-Za-z0-9_-]+$/, message: '仅支持字母、数字、下划线、中划线' },
              ]}
            >
              <Input placeholder="例如：MORNING_STANDUP_V1" maxLength={64} />
            </Form.Item>
            <Form.Item
              label="Agent 名称"
              name="agent_name"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入 Agent 名称' }]}
            >
              <Input placeholder="例如：晨会风险分析助手" maxLength={128} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item
              label="适用场景"
              name="scene_code"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请选择适用场景' }]}
            >
              <Select options={AGENT_SCENE_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="模型"
              name="model"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入模型名称' }]}
            >
              <Input placeholder="例如：gpt-4o-mini" maxLength={64} />
            </Form.Item>
          </Space>

          <Form.Item
            label="业务定位"
            name="business_purpose"
            rules={[{ required: true, message: '请输入业务定位' }]}
          >
            <Input
              placeholder="描述当前 Agent 负责解决什么业务问题，例如：识别晨会中需要重点同步的风险、延迟和资源问题。"
              maxLength={255}
              showCount
            />
          </Form.Item>

          <Form.Item label="补充说明" name="description">
            <Input
              placeholder="可选。用于页面上给管理员补充说明这个 Agent 的适用范围。"
              maxLength={500}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="System Prompt"
            name="system_prompt"
            rules={[{ required: true, message: '请输入 System Prompt' }]}
          >
            <TextArea
              rows={8}
              placeholder="请输入该 Agent 的系统提示词。"
              showCount
            />
          </Form.Item>

          <Form.Item label="结果格式要求" name="output_format_instruction">
            <TextArea
              rows={4}
              placeholder="例如：请按“整体结论 / 风险点 / 建议动作”输出纯文本。"
              showCount
            />
          </Form.Item>

          <Space style={{ width: '100%' }} size={12} align="start">
            <Form.Item
              label="Temperature"
              name="temperature"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入 Temperature' }]}
            >
              <InputNumber min={0} max={2} step={0.1} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="Max Tokens"
              name="max_tokens"
              style={{ flex: 1 }}
              rules={[{ required: true, message: '请输入 Max Tokens' }]}
            >
              <InputNumber min={1} max={32000} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="排序值" name="sort_order" style={{ flex: 1 }}>
              <InputNumber min={0} max={9999} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked" style={{ minWidth: 96 }}>
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

export default AgentConfigPage
