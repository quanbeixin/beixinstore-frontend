import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'

const { Search } = Input

function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)

  const [departments] = useState([
    { id: 1, name: '技术部' },
    { id: 2, name: '运营部' },
    { id: 3, name: '市场部' },
    { id: 4, name: '财务部' },
  ])

  const [roles] = useState([
    { id: 1, name: '超级管理员' },
    { id: 2, name: '运营' },
    { id: 3, name: '编辑' },
    { id: 4, name: '审核员' },
  ])

  const [form] = Form.useForm()

  const getCurrentUserId = () => {
    const userStr = localStorage.getItem('user')
    if (!userStr) return null

    try {
      const user = JSON.parse(userStr)
      return user.id
    } catch {
      return null
    }
  }

  const apiRequest = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    }

    const response = await fetch(`http://localhost:3000${url}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      })

      if (keyword) {
        params.set('keyword', keyword)
      }

      const result = await apiRequest(`/api/users?${params.toString()}`)

      if (result.success) {
        setUsers(result.data.list)
        setTotal(result.data.total)
      } else {
        message.error(result.message || '获取用户列表失败')
      }
    } catch (error) {
      message.error('网络请求失败')
      console.error('Fetch users error:', error)
    } finally {
      setLoading(false)
    }
  }, [apiRequest, currentPage, pageSize, keyword])

  useEffect(() => {
    setCurrentUserId(getCurrentUserId())
    fetchUsers()
  }, [fetchUsers])

  const handleSearch = (value) => {
    setKeyword(value)
    setCurrentPage(1)
  }

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current || 1)
    setPageSize(pagination.pageSize || 10)
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setIsModalVisible(true)

    const roleIds = user.role_ids ? user.role_ids.split(',').map(Number) : []
    form.setFieldsValue({
      email: user.email,
      department_id: user.department_id,
      role_ids: roleIds,
    })
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setEditingUser(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!editingUser) return

      const result = await apiRequest(`/api/users/${editingUser.id}/update`, {
        method: 'POST',
        body: JSON.stringify(values),
      })

      if (result.success) {
        message.success('更新成功')
        handleCancel()
        fetchUsers()
      } else {
        message.error(result.message || '更新失败')
      }
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error('网络请求失败')
        console.error('Update user error:', error)
      }
    }
  }

  const handleDelete = async (user) => {
    if (user.id === currentUserId) {
      message.warning('不能删除当前登录用户')
      return
    }

    try {
      const result = await apiRequest(`/api/users/${user.id}/delete`, {
        method: 'POST',
      })

      if (result.success) {
        message.success('删除成功')
        fetchUsers()
      } else {
        message.error(result.message || '删除失败')
      }
    } catch (error) {
      message.error('网络请求失败')
      console.error('Delete user error:', error)
    }
  }

  const handleRefresh = () => {
    setKeyword('')
    setCurrentPage(1)
    fetchUsers()
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 120,
    },
    {
      title: '角色',
      dataIndex: 'role_names',
      key: 'role_names',
      width: 200,
      render: (roleNames) => (
        <>
          {roleNames?.split(',').map((role, index) => (
            <Tag color="blue" key={index}>
              {role}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => <Tag color="success">正常</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除用户 "${record.username}" 吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
            disabled={record.id === currentUserId}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === currentUserId}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>用户管理</h1>
        <p style={{ color: '#666', marginTop: '8px' }}>管理系统用户信息、权限和状态</p>
      </div>

      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Search
            placeholder="搜索用户名或邮箱"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ width: 300 }}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />}>
          新增用户
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (currentTotal) => `共 ${currentTotal} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        onChange={handleTableChange}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="编辑用户"
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '24px' }}>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item label="部门" name="department_id">
            <Select
              placeholder="请选择部门"
              allowClear
              options={departments.map((dept) => ({ value: dept.id, label: dept.name }))}
            />
          </Form.Item>

          <Form.Item label="角色" name="role_ids">
            <Select
              mode="multiple"
              placeholder="请选择角色"
              allowClear
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Users
