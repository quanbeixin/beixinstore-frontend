import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StarFilled,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import {
  getImportantEmailConfigApi,
  updateImportantEmailConfigApi,
} from '../../api/aiConfig'
import {
  readImportantEmailConfigCache,
  writeImportantEmailConfigCache,
} from '../../utils/importantEmailConfig'

const { Text } = Typography

const STYLE_OPTIONS = [
  { label: '标红', value: 'RED' },
  { label: '✨展示', value: 'STAR' },
  { label: '标红 + ✨', value: 'RED_STAR' },
]

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function sortRules(list = []) {
  return [...list].sort((a, b) => {
    if (Boolean(a?.enabled) !== Boolean(b?.enabled)) {
      return a?.enabled ? -1 : 1
    }
    return String(a?.email || '').localeCompare(String(b?.email || ''))
  })
}

function ImportantEmailConfigPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmail, setEditingEmail] = useState('')
  const [rules, setRules] = useState([])

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getImportantEmailConfigApi()
      const nextRules = sortRules(Array.isArray(result?.data) ? result.data : [])
      setRules(nextRules)
      writeImportantEmailConfigCache(nextRules)
    } catch (error) {
      const cachedRules = sortRules(readImportantEmailConfigCache())
      setRules(cachedRules)
      message.error(error?.message || '获取重点邮箱配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const persistRules = useCallback(async (nextRules, successMessage = '配置保存成功') => {
    setSaving(true)
    try {
      const payload = sortRules(nextRules).map((item) => ({
        email: normalizeEmail(item.email),
        style: String(item.style || 'STAR').trim().toUpperCase(),
        note: String(item.note || '').trim(),
        enabled: Boolean(item.enabled),
      }))
      const result = await updateImportantEmailConfigApi(payload)
      const savedRules = sortRules(Array.isArray(result?.data) ? result.data : payload)
      setRules(savedRules)
      writeImportantEmailConfigCache(savedRules)
      message.success(successMessage)
      return savedRules
    } catch (error) {
      message.error(error?.message || '保存失败')
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  const previewNode = useCallback((record) => {
    const style = String(record?.style || 'STAR').trim().toUpperCase()
    const isRed = style === 'RED' || style === 'RED_STAR'
    const hasStar = style === 'STAR' || style === 'RED_STAR'

    return (
      <Space size={6} wrap>
        <span style={{ color: isRed ? '#be123c' : '#1f2937', fontWeight: isRed ? 600 : 400 }}>
          {record?.email || '-'}
        </span>
        {hasStar ? (
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
            <StarFilled /> 重点
          </Tag>
        ) : null}
      </Space>
    )
  }, [])

  const handleCreate = () => {
    setEditingEmail('')
    form.setFieldsValue({
      email: '',
      style: 'STAR',
      note: '',
      enabled: true,
    })
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingEmail(normalizeEmail(record?.email))
    form.setFieldsValue({
      email: record?.email || '',
      style: record?.style || 'STAR',
      note: record?.note || '',
      enabled: Boolean(record?.enabled),
    })
    setModalOpen(true)
  }

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除重点邮箱？',
      content: `删除后，${record?.email || '-'} 将不再在反馈列表中显示重点标记。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const nextRules = rules.filter((item) => normalizeEmail(item.email) !== normalizeEmail(record?.email))
        await persistRules(nextRules, '重点邮箱已删除')
      },
    })
  }

  const handleToggleEnabled = async (record, enabled) => {
    const targetEmail = normalizeEmail(record?.email)
    const nextRules = rules.map((item) =>
      normalizeEmail(item.email) === targetEmail
        ? { ...item, enabled: Boolean(enabled) }
        : item,
    )
    await persistRules(nextRules, enabled ? '重点邮箱已启用' : '重点邮箱已停用')
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const email = normalizeEmail(values.email)
      const duplicated = rules.some(
        (item) => normalizeEmail(item.email) === email && normalizeEmail(item.email) !== editingEmail,
      )
      if (duplicated) {
        message.warning('该邮箱已存在，请直接编辑原有配置')
        return
      }

      const nextItem = {
        email,
        style: values.style || 'STAR',
        note: String(values.note || '').trim(),
        enabled: Boolean(values.enabled),
      }

      const nextRules = editingEmail
        ? rules.map((item) => (normalizeEmail(item.email) === editingEmail ? nextItem : item))
        : rules.concat(nextItem)

      const saved = await persistRules(nextRules, editingEmail ? '重点邮箱已更新' : '重点邮箱已新增')
      if (!saved) return

      setModalOpen(false)
      setEditingEmail('')
      form.resetFields()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    }
  }

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 320,
      render: (value) => value || '-',
    },
    {
      title: '标记方式',
      dataIndex: 'style',
      key: 'style',
      width: 140,
      render: (value) => {
        const matched = STYLE_OPTIONS.find((item) => item.value === value)
        return matched?.label || '✨展示'
      },
    },
    {
      title: '预览',
      key: 'preview',
      width: 240,
      render: (_, record) => previewNode(record),
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      render: (value) =>
        value ? (
          <Tooltip title={value} placement="topLeft">
            <span>{value}</span>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (value, record) => (
        <Switch
          checked={Boolean(value)}
          onChange={(checked) => {
            void handleToggleEnabled(record, checked)
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        title="重点邮箱配置"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchConfig}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新增邮箱
            </Button>
          </Space>
        }
      >
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: '#fafafa',
            border: '1px solid #f0f0f0',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>使用说明</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#667085' }}>
            <li>用于维护反馈列表中的重点邮箱展示规则，便于快速识别重要邮件。</li>
            <li>支持“标红”“✨展示”“标红 + ✨”三种样式。</li>
            <li>保存后，用户问题记录页面会立即按最新配置展示。</li>
          </ul>
        </div>

        <Table
          rowKey="email"
          loading={loading || saving}
          dataSource={rules}
          columns={columns}
          pagination={false}
          scroll={{ x: 980 }}
          locale={{ emptyText: '暂无重点邮箱配置' }}
        />
      </Card>

      <Modal
        title={editingEmail ? '编辑重点邮箱' : '新增重点邮箱'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingEmail('')
          form.resetFields()
        }}
        onOk={() => {
          void handleSubmit()
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="例如：vip@example.com" />
          </Form.Item>
          <Form.Item label="标记方式" name="style" rules={[{ required: true, message: '请选择标记方式' }]}>
            <Select options={STYLE_OPTIONS} />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input.TextArea rows={3} maxLength={255} placeholder="可选，说明为什么需要重点关注该邮箱" />
          </Form.Item>
          <Form.Item label="启用状态" name="enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ImportantEmailConfigPage
