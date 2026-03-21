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
import { getDictItemsApi } from '../api/configDict'
import { getDepartmentsApi } from '../api/org'
import { getOptionsApi } from '../api/options'
import {
  createUserApi,
  deleteUserApi,
  getUserByIdApi,
  getUsersApi,
  updateUserApi,
} from '../api/users'

const { Search } = Input

function highlightText(text, keyword) {
  const source = String(text || '')
  const key = String(keyword || '').trim()
  if (!key) return source

  const lowerSource = source.toLowerCase()
  const lowerKey = key.toLowerCase()
  const parts = []
  let cursor = 0

  while (cursor < source.length) {
    const matchedIndex = lowerSource.indexOf(lowerKey, cursor)
    if (matchedIndex < 0) {
      parts.push(source.slice(cursor))
      break
    }

    if (matchedIndex > cursor) {
      parts.push(source.slice(cursor, matchedIndex))
    }
    parts.push(
      <mark key={`${matchedIndex}-${lowerKey}`} style={{ padding: 0, background: '#fff3bf' }}>
        {source.slice(matchedIndex, matchedIndex + key.length)}
      </mark>,
    )
    cursor = matchedIndex + key.length
  }

  return <>{parts}</>
}

function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState('real_name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [statusOptions, setStatusOptions] = useState([
    { item_code: 'ACTIVE', item_name: '正常', color: 'success' },
    { item_code: 'DISABLED', item_name: '停用', color: 'default' },
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

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getUsersApi({
        page: currentPage,
        pageSize,
        ...(keyword ? { keyword } : {}),
        sort_by: sortBy,
        sort_order: sortOrder,
      })

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
  }, [currentPage, pageSize, keyword, sortBy, sortOrder])

  const fetchOptions = useCallback(async () => {
    try {
      const [departmentResult, roleResult] = await Promise.all([
        getDepartmentsApi({ mode: 'flat' }),
        getOptionsApi('roles'),
      ])

      if (departmentResult.success) {
        setDepartments(departmentResult.data)
      } else {
        message.error(departmentResult.message || '获取部门选项失败')
      }

      if (roleResult.success) {
        setRoles(roleResult.data)
      } else {
        message.error(roleResult.message || '获取角色选项失败')
      }
    } catch (error) {
      message.error(error?.message || '获取系统选项失败')
    }
  }, [])

  const fetchStatusOptions = useCallback(async () => {
    try {
      const result = await getDictItemsApi('user_status', { enabledOnly: true })
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        setStatusOptions(result.data)
      }
    } catch (error) {
      console.warn('Fetch user_status options failed, fallback to defaults:', error)
    }
  }, [])

  useEffect(() => {
    setCurrentUserId(getCurrentUserId())
    fetchUsers()
    fetchOptions()
    fetchStatusOptions()
  }, [fetchUsers, fetchOptions, fetchStatusOptions])

  const handleSearch = (value) => {
    setKeyword(value)
    setCurrentPage(1)
  }

  const handleTableChange = (pagination, _filters, sorter) => {
    setCurrentPage(pagination.current || 1)
    setPageSize(pagination.pageSize || 10)
    const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter
    const nextColumnKey = String(nextSorter?.columnKey || '')
    if ((nextColumnKey === 'username' || nextColumnKey === 'real_name') && nextSorter?.order) {
      setSortBy(nextColumnKey)
      setSortOrder(nextSorter.order === 'ascend' ? 'asc' : 'desc')
      return
    }
    setSortBy('real_name')
    setSortOrder('asc')
  }

  const refreshUsersAfterMutation = () => {
    if (currentPage === 1) {
      fetchUsers()
      return
    }

    setCurrentPage(1)
  }

  const handleCreate = () => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({
      status_code: 'ACTIVE',
    })
    setIsModalVisible(true)
  }

  const handleEdit = async (user) => {
    setEditingUser(user)
    setIsModalVisible(true)
    try {
      const result = await getUserByIdApi(user.id)
      if (!result.success) {
        message.error(result.message || '获取用户详情失败')
        return
      }

      const detail = result.data
      const roleIds = detail.role_ids ? String(detail.role_ids).split(',').map(Number) : []
      form.setFieldsValue({
        real_name: detail.real_name || '',
        email: detail.email,
        department_id: detail.department_id,
        status_code: detail.status_code || 'ACTIVE',
        role_ids: roleIds,
      })
    } catch (error) {
      message.error(error?.message || '获取用户详情失败')
      console.error('Fetch user detail error:', error)
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setEditingUser(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      const values = await form.validateFields()
      const payload = {
        real_name: values.real_name || '',
        email: values.email || null,
        department_id: values.department_id ?? null,
        status_code: values.status_code || 'ACTIVE',
        role_ids: values.role_ids || [],
      }

      let result
      if (editingUser) {
        result = await updateUserApi(editingUser.id, payload)
      } else {
        result = await createUserApi({
          ...payload,
          username: values.username,
          password: values.password,
        })
      }

      if (result.success) {
        message.success(editingUser ? '更新成功' : '新增成功')
        handleCancel()
        refreshUsersAfterMutation()
      } else {
        message.error(result.message || (editingUser ? '更新失败' : '新增失败'))
      }
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error(error?.message || '网络请求失败')
        console.error('Submit user error:', error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (user) => {
    if (user.id === currentUserId) {
      message.warning('不能删除当前登录用户')
      return
    }

    try {
      const result = await deleteUserApi(user.id)

      if (result.success) {
        message.success('删除成功')
        refreshUsersAfterMutation()
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
    setSortBy('real_name')
    setSortOrder('asc')
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
      sorter: true,
      sortOrder: sortBy === 'username' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (value) => highlightText(value, keyword),
    },
    {
      title: '真实姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 160,
      sorter: true,
      sortOrder: sortBy === 'real_name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (value, record) => highlightText(value || record.username || '-', keyword),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (value) => highlightText(value, keyword),
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
      render: (_, record) => {
        const option = statusOptions.find((item) => item.item_code === record.status_code)
        const label = option?.item_name || record.status_code || '未知'
        const color = option?.color || 'default'
        return <Tag color={color}>{label}</Tag>
      },
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
            description={`确定要删除用户 "${record.real_name || record.username}" 吗？`}
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
    <div style={{ padding: '12px' }}>
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
            placeholder="搜索用户名/真实姓名/邮箱"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ width: 300 }}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
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
        title={editingUser ? '编辑用户' : '新增用户'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
        width={500}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '24px' }}>
          {!editingUser && (
            <>
              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, message: '用户名至少 2 个字符' },
                  { max: 20, message: '用户名最多 20 个字符' },
                  {
                    pattern: /^[a-zA-Z0-9_]+$/,
                    message: '用户名只能包含字母、数字和下划线',
                  },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 8, message: '密码至少 8 个字符' },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                    message: '密码需同时包含字母和数字',
                  },
                ]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>

              <Form.Item
                label="确认密码"
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: '请再次输入密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="请再次输入密码" />
              </Form.Item>
            </>
          )}

          <Form.Item
            label="真实姓名"
            name="real_name"
            rules={[
              { required: true, message: '请输入真实姓名' },
              { min: 2, message: '真实姓名至少 2 个字符' },
              { max: 32, message: '真实姓名最多 32 个字符' },
            ]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>

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

          <Form.Item
            label="状态"
            name="status_code"
            rules={[{ required: true, message: '请选择用户状态' }]}
            initialValue="ACTIVE"
          >
            <Select
              placeholder="请选择状态"
              options={statusOptions.map((item) => ({
                value: item.item_code,
                label: item.item_name,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Users
