import { EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
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
import { useNavigate } from 'react-router-dom'
import {
  createProjectTemplateApi,
  getProjectTemplatesApi,
} from '../../api/work'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

function getNodeSummary(value) {
  let list = []
  if (Array.isArray(value)) {
    list = value
  } else if (value && typeof value === 'object' && Array.isArray(value.nodes)) {
    list = value.nodes
  } else if (value && typeof value === 'object') {
    list = Object.values(value).filter((item) => item && typeof item === 'object')
  }

  if (list.length === 0) return { count: 0, labels: [] }

  return {
    count: list.length,
    labels: list
      .slice(0, 3)
      .map((item, index) => String(item?.node_name || item?.name || item?.title || `节点${index + 1}`).trim())
      .filter(Boolean),
  }
}

function ProjectTemplates() {
  const navigate = useNavigate()
  const canManage = hasPermission('project.template.manage')
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

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
    form.resetFields()
    form.setFieldsValue({
      status: 1,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        name: String(values.name || '').trim(),
        description: String(values.description || '').trim(),
        status: Number(values.status) === 1 ? 1 : 0,
        node_config: [],
      }

      const result = await createProjectTemplateApi(payload)

      if (!result?.success) {
        message.error(result?.message || '模板创建失败')
        return
      }

      const nextTemplateId = Number(result?.data?.id || result?.data?.template_id)
      message.success('模板创建成功，进入流程设计页')
      closeModal()
      await fetchTemplates()
      if (nextTemplateId > 0) {
        navigate(`/project-templates/${nextTemplateId}`)
      }
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
        const summary = getNodeSummary(value)
        if (summary.count === 0) return <Text type="secondary">未配置节点</Text>
        return (
          <Space size={[6, 6]} wrap>
            <Tag color="processing">共 {summary.count} 个节点</Tag>
            {summary.labels.map((label) => (
              <Tag key={label}>{label}</Tag>
            ))}
          </Space>
        )
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
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            icon={canManage ? <EditOutlined /> : <EyeOutlined />}
            onClick={() => navigate(`/project-templates/${record.id}`)}
          >
            {canManage ? '编辑流程' : '查看详情'}
          </Button>
        </Space>
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
        title="新建项目模板"
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={640}
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
          <Alert
            showIcon
            type="info"
            title="创建后进入详情页继续设计"
            description="节点流程不再在弹窗中通过 JSON 维护，创建成功后将进入模板详情页完成可视化配置。"
          />
        </Form>
      </Modal>
    </div>
  )
}

export default ProjectTemplates
