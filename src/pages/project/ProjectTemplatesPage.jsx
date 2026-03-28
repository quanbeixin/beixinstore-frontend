import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createProjectTemplateApi,
  getProjectTemplatesApi,
  updateProjectTemplateApi,
} from '../../api/work'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

function parseNodeConfigText(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') return parsed
  throw new Error('node_config 必须是 JSON 对象或数组')
}

function ProjectTemplates() {
  const canManage = hasPermission('project.template.manage')
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)

  const [list, setList] = useState([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState()

  const statusOptions = useMemo(
    () => [
      { label: '全部状态', value: undefined },
      { label: '启用', value: 1 },
      { label: '停用', value: 0 },
    ],
    [],
  )

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page: 1,
        pageSize: 200,
      }
      if (keyword) params.keyword = keyword
      if (statusFilter === 0 || statusFilter === 1) params.status = statusFilter

      const result = await getProjectTemplatesApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取模板列表失败')
        return
      }
      setList(result.data?.list || [])
    } catch (error) {
      message.error(error?.message || '获取模板列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const openCreateModal = () => {
    if (!canManage) return
    setEditingTemplate(null)
    form.resetFields()
    form.setFieldsValue({
      status: 1,
      node_config_text: JSON.stringify([], null, 2),
    })
    setModalOpen(true)
  }

  const openEditModal = (record) => {
    if (!canManage) return
    setEditingTemplate(record)
    form.resetFields()
    form.setFieldsValue({
      name: record.name || '',
      description: record.description || '',
      status: Number(record.status) === 1 ? 1 : 0,
      node_config_text: JSON.stringify(record.node_config || [], null, 2),
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingTemplate(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const nodeConfig = parseNodeConfigText(values.node_config_text)
      setSubmitting(true)

      const payload = {
        name: String(values.name || '').trim(),
        description: String(values.description || '').trim(),
        status: Number(values.status) === 1 ? 1 : 0,
        node_config: nodeConfig,
      }

      const result = editingTemplate
        ? await updateProjectTemplateApi(editingTemplate.id, payload)
        : await createProjectTemplateApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingTemplate ? '模板更新失败' : '模板创建失败'))
        return
      }

      message.success(editingTemplate ? '模板更新成功' : '模板创建成功')
      closeModal()
      await fetchTemplates()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '模板保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (value) => <Tag color="blue">#{value}</Tag>,
    },
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value) => (Number(value) === 1 ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: '节点配置',
      dataIndex: 'node_config',
      key: 'node_config',
      render: (value) => {
        if (Array.isArray(value)) return `数组(${value.length})`
        if (value && typeof value === 'object') return `对象(${Object.keys(value).length}项)`
        return '-'
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, record) =>
        canManage ? (
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
        ) : (
          '-'
        ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title="项目模板管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchTemplates}>
              刷新
            </Button>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                新建模板
              </Button>
            ) : null}
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            allowClear
            style={{ width: 280 }}
            placeholder="搜索模板名称/描述"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onPressEnter={() => setKeyword(keywordInput.trim())}
          />
          <Select
            style={{ width: 140 }}
            value={statusFilter}
            options={statusOptions}
            onChange={(value) => setStatusFilter(value)}
          />
          <Button type="primary" onClick={() => setKeyword(keywordInput.trim())}>
            查询
          </Button>
          <Button
            onClick={() => {
              setKeywordInput('')
              setKeyword('')
              setStatusFilter(undefined)
            }}
          >
            重置
          </Button>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={false}
          scroll={{ x: 1120 }}
        />

        {!canManage ? (
          <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
            当前账号仅可查看模板，如需维护请分配 `project.template.manage` 权限。
          </Text>
        ) : null}
      </Card>

      <Modal
        title={editingTemplate ? '编辑项目模板' : '新建项目模板'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={760}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input maxLength={100} placeholder="例如：标准研发流程模板" />
          </Form.Item>
          <Form.Item label="模板描述" name="description">
            <Input.TextArea rows={3} maxLength={4000} placeholder="描述模板用途、适用场景等" />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { label: '启用', value: 1 },
                { label: '停用', value: 0 },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="节点配置(JSON)"
            name="node_config_text"
            rules={[
              { required: true, message: '请输入节点配置 JSON' },
              {
                validator: (_, value) => {
                  try {
                    parseNodeConfigText(value)
                    return Promise.resolve()
                  } catch (err) {
                    return Promise.reject(new Error(err?.message || 'JSON 格式不正确'))
                  }
                },
              },
            ]}
          >
            <Input.TextArea
              rows={12}
              placeholder={`示例:\n[\n  {\n    "node_key": "PLAN",\n    "node_name": "需求评审"\n  }\n]`}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ProjectTemplates
