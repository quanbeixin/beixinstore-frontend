import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getProjectsApi } from '../api/projects'
import {
  createRequirementApi,
  deleteRequirementApi,
  getRequirementsApi,
  updateRequirementApi,
} from '../api/requirements'
import { getUsersApi } from '../api/users'
import './ProjectManagement.css'

const PRIORITY_OPTIONS = [
  { label: '低', value: 'LOW' },
  { label: '中', value: 'MEDIUM' },
  { label: '高', value: 'HIGH' },
  { label: '紧急', value: 'URGENT' },
]

const STATUS_OPTIONS = [
  { label: '待处理', value: 'TODO' },
  { label: '开发中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
]

const STAGE_OPTIONS = [
  { label: '需求', value: 'REQUIREMENT' },
  { label: '开发', value: 'DEVELOPMENT' },
  { label: '测试', value: 'TEST' },
  { label: '发布', value: 'RELEASE' },
]

function getOptionLabel(options, value) {
  const matched = options.find((item) => item.value === value)
  return matched?.label || value || '-'
}

function getPriorityColor(priority) {
  if (priority === 'URGENT') return 'red'
  if (priority === 'HIGH') return 'orange'
  if (priority === 'MEDIUM') return 'blue'
  return 'default'
}

function getStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  return 'warning'
}

function Requirements() {
  const [form] = Form.useForm()
  const [requirements, setRequirements] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [projectId, setProjectId] = useState()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')

  const loadBaseOptions = useCallback(async () => {
    try {
      const [projectResult, userResult] = await Promise.all([
        getProjectsApi({ page: 1, pageSize: 200 }),
        getUsersApi({ page: 1, pageSize: 200 }),
      ])
      if (projectResult?.success) setProjects(projectResult.data?.list || [])
      if (userResult?.success) setUsers(userResult.data?.list || [])
    } catch (error) {
      console.error('Load requirement options failed:', error)
    }
  }, [])

  const loadRequirements = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getRequirementsApi({
        page,
        pageSize,
        ...(keyword ? { keyword } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      })

      if (!result?.success) {
        message.error(result?.message || '获取需求列表失败')
        return
      }

      setRequirements(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取需求列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, page, pageSize, projectId, status, priority])

  useEffect(() => {
    loadBaseOptions()
  }, [loadBaseOptions])

  useEffect(() => {
    loadRequirements()
  }, [loadRequirements])

  const openCreateModal = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      priority: 'MEDIUM',
      status: 'TODO',
      stage: 'REQUIREMENT',
      estimated_hours: 0,
      actual_hours: 0,
    })
    setModalOpen(true)
  }

  const openEditModal = (record) => {
    setEditingRecord(record)
    form.resetFields()
    form.setFieldsValue({
      project_id: record.project_id,
      title: record.title,
      description: record.description || '',
      priority: record.priority,
      status: record.status,
      stage: record.stage,
      assignee_user_id: record.assignee_user_id || undefined,
      estimated_hours: Number(record.estimated_hours || 0),
      actual_hours: Number(record.actual_hours || 0),
      start_date: record.start_date || null,
      due_date: record.due_date || null,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        description: values.description || null,
        assignee_user_id: values.assignee_user_id || null,
      }

      const result = editingRecord
        ? await updateRequirementApi(editingRecord.id, payload)
        : await createRequirementApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingRecord ? '更新需求失败' : '创建需求失败'))
        return
      }

      message.success(editingRecord ? '需求更新成功' : '需求创建成功')
      closeModal()
      loadRequirements()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      const result = await deleteRequirementApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除需求失败')
        return
      }
      message.success('需求删除成功')
      loadRequirements()
    } catch (error) {
      message.error(error?.message || '删除需求失败')
    }
  }

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 220 },
    { title: '所属业务线', dataIndex: 'project_name', key: 'project_name', width: 180 },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (value) => <Tag color={getPriorityColor(value)}>{getOptionLabel(PRIORITY_OPTIONS, value)}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={getStatusColor(value)}>{getOptionLabel(STATUS_OPTIONS, value)}</Tag>,
    },
    {
      title: '阶段',
      dataIndex: 'stage',
      key: 'stage',
      width: 130,
      render: (value) => getOptionLabel(STAGE_OPTIONS, value),
    },
    {
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '预计/实际(h)',
      key: 'hours',
      width: 130,
      render: (_, record) => `${record.estimated_hours || 0} / ${record.actual_hours || 0}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除需求"
            description={`确定删除需求「${record.title}」吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="pm-page">
      <Card className="pm-hero" variant="borderless">
        <div className="pm-hero-head">
          <div>
            <h1 className="pm-hero-title">需求管理</h1>
            <p className="pm-hero-subtitle">围绕业务线维护需求标题、优先级、状态、负责人和工时，支持基础流程推进。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建需求
          </Button>
        </div>
      </Card>

      <Card className="pm-panel" variant="borderless">
        <div className="pm-toolbar">
          <div className="pm-toolbar-left">
            <Input.Search
              placeholder="搜索需求标题"
              allowClear
              enterButton={<SearchOutlined />}
              style={{ width: 260 }}
              onSearch={(value) => {
                setKeyword(value)
                setPage(1)
              }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="所属业务线"
              style={{ width: 180 }}
              value={projectId}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              onChange={(value) => {
                setProjectId(value)
                setPage(1)
              }}
            />
            <Select
              allowClear
              placeholder="状态"
              style={{ width: 140 }}
              value={status || undefined}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value || '')
                setPage(1)
              }}
            />
            <Select
              allowClear
              placeholder="优先级"
              style={{ width: 140 }}
              value={priority || undefined}
              options={PRIORITY_OPTIONS}
              onChange={(value) => {
                setPriority(value || '')
                setPage(1)
              }}
            />
          </div>
          <div className="pm-toolbar-right">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKeyword('')
                setProjectId(undefined)
                setStatus('')
                setPriority('')
                setPage(1)
                loadRequirements()
              }}
            >
              刷新
            </Button>
          </div>
        </div>
      </Card>

      <Card className="pm-panel" variant="borderless">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={requirements}
          scroll={{ x: 1280 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
          }}
          onChange={(pagination) => {
            setPage(pagination.current || 1)
            setPageSize(pagination.pageSize || 10)
          }}
        />
      </Card>

      <Modal
        title={editingRecord ? '编辑需求' : '新建需求'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="所属业务线" name="project_id" rules={[{ required: true, message: '请选择业务线' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="负责人" name="assignee_user_id">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={users.map((user) => ({
                    value: user.id,
                    label: user.real_name || user.username,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="需求标题" name="title" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请选择优先级' }]}>
                <Select options={PRIORITY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="阶段" name="stage" rules={[{ required: true, message: '请选择阶段' }]}>
                <Select options={STAGE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="预计工时" name="estimated_hours">
                <Input type="number" min={0} step="0.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="实际工时" name="actual_hours">
                <Input type="number" min={0} step="0.5" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="开始日期" name="start_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="截止日期" name="due_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="需求描述" name="description">
            <Input.TextArea rows={4} maxLength={5000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Requirements
