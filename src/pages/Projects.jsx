import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
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
import {
  addProjectMemberApi,
  createProjectApi,
  deleteProjectApi,
  deleteProjectMemberApi,
  getProjectActivityLogsApi,
  getProjectByIdApi,
  getProjectMembersApi,
  getProjectsApi,
  updateProjectApi,
  updateProjectMemberApi,
} from '../api/projects'
import { getUsersApi } from '../api/users'
import './ProjectManagement.css'

const PROJECT_STATUS_OPTIONS = [
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'COMPLETED' },
]

const PROJECT_ROLE_OPTIONS = [
  { label: '产品/项目', value: 'PM' },
  { label: '开发', value: 'DEV' },
  { label: '测试', value: 'QA' },
]

function getStatusTagColor(status) {
  return status === 'COMPLETED' ? 'success' : 'processing'
}

function Projects() {
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [memberSubmitting, setMemberSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailProject, setDetailProject] = useState(null)
  const [members, setMembers] = useState([])
  const [logs, setLogs] = useState([])

  const loadUsers = useCallback(async () => {
    try {
      const result = await getUsersApi({ page: 1, pageSize: 200 })
      if (result?.success) {
        setUsers(result.data?.list || [])
      }
    } catch (error) {
      console.error('Load project users failed:', error)
    }
  }, [])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getProjectsApi({
        page,
        pageSize,
        ...(keyword ? { keyword } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      if (!result?.success) {
        message.error(result?.message || '获取业务线列表失败')
        return
      }
      setProjects(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取业务线列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, page, pageSize, statusFilter])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const openCreateModal = () => {
    setEditingProject(null)
    form.resetFields()
    form.setFieldsValue({ status: 'IN_PROGRESS' })
    setModalOpen(true)
  }

  const openEditModal = (record) => {
    setEditingProject(record)
    form.resetFields()
    form.setFieldsValue({
      name: record.name,
      project_code: record.project_code || '',
      description: record.description || '',
      status: record.status,
      owner_user_id: record.owner_user_id || undefined,
      start_date: record.start_date || null,
      end_date: record.end_date || null,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingProject(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        name: values.name,
        project_code: values.project_code || null,
        description: values.description || null,
        status: values.status,
        owner_user_id: values.owner_user_id || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      }

      const result = editingProject
        ? await updateProjectApi(editingProject.id, payload)
        : await createProjectApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingProject ? '更新业务线失败' : '创建业务线失败'))
        return
      }

      message.success(editingProject ? '业务线更新成功' : '业务线创建成功')
      closeModal()
      loadProjects()
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
      const result = await deleteProjectApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除业务线失败')
        return
      }
      message.success('业务线删除成功')
      loadProjects()
    } catch (error) {
      message.error(error?.message || '删除业务线失败')
    }
  }

  const openProjectDetail = async (record) => {
    setDetailOpen(true)
    setDetailLoading(true)
    memberForm.resetFields()
    try {
      const [projectResult, memberResult, logResult] = await Promise.all([
        getProjectByIdApi(record.id),
        getProjectMembersApi(record.id),
        getProjectActivityLogsApi(record.id, { page: 1, pageSize: 50 }),
      ])

      if (!projectResult?.success) {
        message.error(projectResult?.message || '获取业务线详情失败')
        setDetailOpen(false)
        return
      }

      setDetailProject(projectResult.data || null)
      setMembers(memberResult?.success ? memberResult.data || [] : [])
      setLogs(logResult?.success ? logResult.data || [] : [])
    } catch (error) {
      message.error(error?.message || '获取业务线详情失败')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const reloadProjectDetail = async () => {
    if (!detailProject?.id) return
    await openProjectDetail(detailProject)
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailProject(null)
    setMembers([])
    setLogs([])
    memberForm.resetFields()
  }

  const handleAddMember = async () => {
    if (!detailProject?.id) return
    try {
      const values = await memberForm.validateFields()
      setMemberSubmitting(true)
      const result = await addProjectMemberApi(detailProject.id, values)
      if (!result?.success) {
        message.error(result?.message || '添加成员失败')
        return
      }
      message.success('成员添加成功')
      memberForm.resetFields()
      reloadProjectDetail()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '添加成员失败')
      }
    } finally {
      setMemberSubmitting(false)
    }
  }

  const handleUpdateMemberRole = async (memberId, projectRole) => {
    if (!detailProject?.id) return
    try {
      const result = await updateProjectMemberApi(detailProject.id, memberId, { project_role: projectRole })
      if (!result?.success) {
        message.error(result?.message || '更新成员角色失败')
        return
      }
      message.success('成员角色更新成功')
      reloadProjectDetail()
    } catch (error) {
      message.error(error?.message || '更新成员角色失败')
    }
  }

  const handleDeleteMember = async (memberId) => {
    if (!detailProject?.id) return
    try {
      const result = await deleteProjectMemberApi(detailProject.id, memberId)
      if (!result?.success) {
        message.error(result?.message || '移除成员失败')
        return
      }
      message.success('成员已移除')
      reloadProjectDetail()
    } catch (error) {
      message.error(error?.message || '移除成员失败')
    }
  }

  const projectColumns = [
    { title: '业务线名称', dataIndex: 'name', key: 'name', width: 220 },
    {
      title: '业务线编码',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 160,
      render: (value) => value || '-',
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={getStatusTagColor(value)}>{value === 'COMPLETED' ? '已完成' : '进行中'}</Tag>,
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      render: (value) => <span className="pm-mono">{value || 0}</span>,
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '结束日期',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" onClick={() => openProjectDetail(record)}>
            详情
          </Button>
          <Button type="link" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除业务线"
            description={`确定删除业务线「${record.name}」吗？`}
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

  const memberColumns = [
    {
      title: '成员',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (_, record) => record.real_name || record.username || '-',
    },
    {
      title: '账号',
      dataIndex: 'username',
      key: 'username',
      render: (value) => value || '-',
    },
    {
      title: '角色',
      dataIndex: 'project_role',
      key: 'project_role',
      render: (value, record) => (
        <Select
          size="small"
          style={{ width: 120 }}
          value={value}
          options={PROJECT_ROLE_OPTIONS}
          onChange={(nextValue) => handleUpdateMemberRole(record.id, nextValue)}
        />
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Popconfirm
          title="确认移除成员"
          description={`确定移除成员「${record.real_name || record.username}」吗？`}
          onConfirm={() => handleDeleteMember(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const logColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    { title: '类型', dataIndex: 'entity_type', key: 'entity_type', width: 120 },
    { title: '动作', dataIndex: 'action', key: 'action', width: 140 },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      render: (value) => value || '-',
    },
    { title: '说明', dataIndex: 'action_detail', key: 'action_detail', render: (value) => value || '-' },
  ]

  return (
    <div className="pm-page">
      <Card className="pm-hero" variant="borderless">
        <div className="pm-hero-head">
          <div>
            <h1 className="pm-hero-title">业务线</h1>
            <p className="pm-hero-subtitle">统一管理业务线基础信息、成员角色和活动日志，作为需求与缺陷的归属入口。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建业务线
          </Button>
        </div>
        <div className="pm-hero-stats">
          <div className="pm-stat-card">
            <div className="pm-stat-label">当前列表业务线数</div>
            <div className="pm-stat-value">{total}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">进行中</div>
            <div className="pm-stat-value">{projects.filter((item) => item.status === 'IN_PROGRESS').length}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">已完成</div>
            <div className="pm-stat-value">{projects.filter((item) => item.status === 'COMPLETED').length}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">总成员数</div>
            <div className="pm-stat-value">
              {projects.reduce((sum, item) => sum + Number(item.member_count || 0), 0)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="pm-panel" variant="borderless">
        <div className="pm-toolbar">
          <div className="pm-toolbar-left">
            <Input.Search
              placeholder="搜索业务线名称"
              allowClear
              enterButton={<SearchOutlined />}
              style={{ width: 280 }}
              onSearch={(value) => {
                setKeyword(value)
                setPage(1)
              }}
            />
            <Select
              allowClear
              placeholder="状态筛选"
              style={{ width: 140 }}
              options={PROJECT_STATUS_OPTIONS}
              value={statusFilter || undefined}
              onChange={(value) => {
                setStatusFilter(value || '')
                setPage(1)
              }}
            />
          </div>
          <div className="pm-toolbar-right">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKeyword('')
                setStatusFilter('')
                setPage(1)
                loadProjects()
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
          columns={projectColumns}
          dataSource={projects}
          scroll={{ x: 1200 }}
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
        title={editingProject ? '编辑业务线' : '新建业务线'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item label="业务线名称" name="name" rules={[{ required: true, message: '请输入业务线名称' }]}>
            <Input maxLength={100} placeholder="例如：Wegic" />
          </Form.Item>
          <Form.Item label="业务线编码" name="project_code">
            <Input maxLength={50} placeholder="例如：WEGIC" />
          </Form.Item>
          <Form.Item label="负责人" name="owner_user_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择业务线负责人"
              options={users.map((user) => ({
                value: user.id,
                label: user.real_name || user.username,
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="开始日期" name="start_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="结束日期" name="end_date">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={PROJECT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="业务线说明" name="description">
            <Input.TextArea rows={4} maxLength={2000} placeholder="补充业务线定位、范围和说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detailProject ? `业务线详情 · ${detailProject.name}` : '业务线详情'}
        open={detailOpen}
        width={920}
        onClose={closeDetail}
        destroyOnHidden
      >
        <div className="pm-drawer-grid">
          <Card className="pm-drawer-card" loading={detailLoading}>
            {detailProject ? (
              <>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="业务线编码">{detailProject.project_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="负责人">{detailProject.owner_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={getStatusTagColor(detailProject.status)}>
                      {detailProject.status === 'COMPLETED' ? '已完成' : '进行中'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="开始日期">{detailProject.start_date || '-'}</Descriptions.Item>
                  <Descriptions.Item label="结束日期">{detailProject.end_date || '-'}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">{detailProject.created_at || '-'}</Descriptions.Item>
                  <Descriptions.Item label="业务线说明" span={2}>
                    {detailProject.description || '-'}
                  </Descriptions.Item>
                </Descriptions>

                <div className="pm-kpi-grid" style={{ marginTop: 16 }}>
                  <div className="pm-kpi">
                    <div className="label">业务线成员</div>
                    <div className="value">{detailProject.member_count || 0}</div>
                  </div>
                  <div className="pm-kpi">
                    <div className="label">关联需求</div>
                    <div className="value">{detailProject.requirement_count || 0}</div>
                  </div>
                  <div className="pm-kpi">
                    <div className="label">关联 Bug</div>
                    <div className="value">{detailProject.bug_count || 0}</div>
                  </div>
                </div>
              </>
            ) : null}
          </Card>

          <Card
            className="pm-drawer-card"
            title={
              <Space>
                <TeamOutlined />
                业务线成员
              </Space>
            }
          >
            <Space wrap style={{ marginBottom: 16, width: '100%' }}>
              <Form form={memberForm} layout="inline">
                <Form.Item
                  name="user_id"
                  rules={[{ required: true, message: '请选择成员' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择成员"
                    style={{ width: 220 }}
                    options={users.map((user) => ({
                      value: user.id,
                      label: `${user.real_name || user.username} (${user.username})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="project_role"
                  initialValue="DEV"
                  rules={[{ required: true, message: '请选择角色' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select style={{ width: 140 }} options={PROJECT_ROLE_OPTIONS} />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" loading={memberSubmitting} onClick={handleAddMember}>
                    添加成员
                  </Button>
                </Form.Item>
              </Form>
            </Space>

            <Table rowKey="id" size="small" pagination={false} columns={memberColumns} dataSource={members} />
          </Card>

          <Card
            className="pm-drawer-card"
            title={
              <Space>
                <UnorderedListOutlined />
                活动日志
              </Space>
            }
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              columns={logColumns}
              dataSource={logs}
              scroll={{ x: 880 }}
            />
          </Card>
        </div>
      </Drawer>
    </div>
  )
}

export default Projects
