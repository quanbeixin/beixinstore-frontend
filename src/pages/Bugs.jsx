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
import { createBugApi, deleteBugApi, getBugsApi, updateBugApi } from '../api/bugs'
import { getProjectsApi } from '../api/projects'
import { getRequirementsApi } from '../api/requirements'
import { getUsersApi } from '../api/users'
import './ProjectManagement.css'

const SEVERITY_OPTIONS = [
  { label: '低', value: 'LOW' },
  { label: '中', value: 'MEDIUM' },
  { label: '高', value: 'HIGH' },
  { label: '严重', value: 'CRITICAL' },
]

const STATUS_OPTIONS = [
  { label: '待修复', value: 'OPEN' },
  { label: '修复中', value: 'FIXING' },
  { label: '已验证', value: 'VERIFIED' },
  { label: '已关闭', value: 'CLOSED' },
]

const STAGE_OPTIONS = [
  { label: '开发', value: 'DEVELOPMENT' },
  { label: '测试', value: 'TEST' },
  { label: '发布', value: 'RELEASE' },
]

function getOptionLabel(options, value) {
  const matched = options.find((item) => item.value === value)
  return matched?.label || value || '-'
}

function getSeverityColor(severity) {
  if (severity === 'CRITICAL') return 'red'
  if (severity === 'HIGH') return 'orange'
  if (severity === 'MEDIUM') return 'blue'
  return 'default'
}

function getStatusColor(status) {
  if (status === 'CLOSED') return 'success'
  if (status === 'VERIFIED') return 'cyan'
  if (status === 'FIXING') return 'processing'
  return 'warning'
}

function Bugs() {
  const [form] = Form.useForm()
  const [bugs, setBugs] = useState([])
  const [projects, setProjects] = useState([])
  const [requirements, setRequirements] = useState([])
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
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')

  const loadBaseOptions = useCallback(async () => {
    try {
      const [projectResult, requirementResult, userResult] = await Promise.all([
        getProjectsApi({ page: 1, pageSize: 200 }),
        getRequirementsApi({ page: 1, pageSize: 200 }),
        getUsersApi({ page: 1, pageSize: 200 }),
      ])
      if (projectResult?.success) setProjects(projectResult.data?.list || [])
      if (requirementResult?.success) setRequirements(requirementResult.data?.list || [])
      if (userResult?.success) setUsers(userResult.data?.list || [])
    } catch (error) {
      console.error('Load bug options failed:', error)
    }
  }, [])

  const loadBugs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBugsApi({
        page,
        pageSize,
        ...(keyword ? { keyword } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
      })

      if (!result?.success) {
        message.error(result?.message || '获取 Bug 列表失败')
        return
      }

      setBugs(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取 Bug 列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, page, pageSize, projectId, severity, status])

  useEffect(() => {
    loadBaseOptions()
  }, [loadBaseOptions])

  useEffect(() => {
    loadBugs()
  }, [loadBugs])

  const openCreateModal = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      severity: 'MEDIUM',
      status: 'OPEN',
      stage: 'DEVELOPMENT',
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
      requirement_id: record.requirement_id || undefined,
      title: record.title,
      description: record.description || '',
      reproduce_steps: record.reproduce_steps || '',
      severity: record.severity,
      status: record.status,
      stage: record.stage,
      assignee_user_id: record.assignee_user_id || undefined,
      estimated_hours: Number(record.estimated_hours || 0),
      actual_hours: Number(record.actual_hours || 0),
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
        requirement_id: values.requirement_id || null,
        description: values.description || null,
        reproduce_steps: values.reproduce_steps || null,
        assignee_user_id: values.assignee_user_id || null,
      }

      const result = editingRecord
        ? await updateBugApi(editingRecord.id, payload)
        : await createBugApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingRecord ? '更新 Bug 失败' : '创建 Bug 失败'))
        return
      }

      message.success(editingRecord ? 'Bug 更新成功' : 'Bug 创建成功')
      closeModal()
      loadBugs()
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
      const result = await deleteBugApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除 Bug 失败')
        return
      }
      message.success('Bug 删除成功')
      loadBugs()
    } catch (error) {
      message.error(error?.message || '删除 Bug 失败')
    }
  }

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 220 },
    { title: '业务线', dataIndex: 'project_name', key: 'project_name', width: 180 },
    {
      title: '关联需求',
      dataIndex: 'requirement_title',
      key: 'requirement_title',
      width: 180,
      render: (value) => value || '-',
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (value) => <Tag color={getSeverityColor(value)}>{getOptionLabel(SEVERITY_OPTIONS, value)}</Tag>,
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
      width: 120,
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
            title="确认删除 Bug"
            description={`确定删除 Bug「${record.title}」吗？`}
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
            <h1 className="pm-hero-title">缺陷管理</h1>
            <p className="pm-hero-subtitle">记录复现步骤、严重程度、处理人和修复进度，支持关联业务线与需求。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建 Bug
          </Button>
        </div>
      </Card>

      <Card className="pm-panel" variant="borderless">
        <div className="pm-toolbar">
          <div className="pm-toolbar-left">
            <Input.Search
              placeholder="搜索 Bug 标题"
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
              placeholder="严重程度"
              style={{ width: 140 }}
              value={severity || undefined}
              options={SEVERITY_OPTIONS}
              onChange={(value) => {
                setSeverity(value || '')
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
          </div>
          <div className="pm-toolbar-right">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKeyword('')
                setProjectId(undefined)
                setSeverity('')
                setStatus('')
                setPage(1)
                loadBugs()
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
          dataSource={bugs}
          scroll={{ x: 1360 }}
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
        title={editingRecord ? '编辑 Bug' : '新建 Bug'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={760}
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
              <Form.Item label="关联需求" name="requirement_id">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={requirements.map((item) => ({
                    value: item.id,
                    label: item.title,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Bug 标题" name="title" rules={[{ required: true, message: '请输入 Bug 标题' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="严重程度" name="severity" rules={[{ required: true, message: '请选择严重程度' }]}>
                <Select options={SEVERITY_OPTIONS} />
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
            <Col span={12}>
              <Form.Item label="截止日期" name="due_date">
                <Input placeholder="YYYY-MM-DD" />
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
          <Form.Item label="问题描述" name="description">
            <Input.TextArea rows={3} maxLength={5000} />
          </Form.Item>
          <Form.Item label="复现步骤" name="reproduce_steps">
            <Input.TextArea rows={4} maxLength={5000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Bugs
