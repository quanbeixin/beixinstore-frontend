import { ApartmentOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDepartmentsApi, getUserDepartmentsApi, setUserDepartmentsApi } from '../api/org'
import { getUsersApi } from '../api/users'
import { hasPermission } from '../utils/access'

const { Search } = Input

function UserDepartments() {
  const canManage = hasPermission('dept.manage')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')

  const [departments, setDepartments] = useState([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  const [form] = Form.useForm()

  const departmentOptions = useMemo(
    () => departments.map((dept) => ({ value: dept.id, label: dept.name })),
    [departments],
  )

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getUsersApi({
        page: currentPage,
        pageSize,
        ...(keyword ? { keyword } : {}),
      })

      if (!result?.success) {
        message.error(result?.message || '获取用户列表失败')
        return
      }

      setUsers(result.data?.list || [])
      setTotal(result.data?.total || 0)
    } catch (error) {
      message.error(error?.message || '获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, keyword])

  const fetchDepartments = useCallback(async () => {
    try {
      const result = await getDepartmentsApi({ mode: 'flat' })
      if (result?.success) {
        setDepartments(result.data || [])
      }
    } catch (error) {
      console.warn('加载部门列表失败:', error)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  const handleSearch = (value) => {
    setKeyword(value)
    setCurrentPage(1)
  }

  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current || 1)
    setPageSize(pagination.pageSize || 10)
  }

  const openAssignModal = async (record) => {
    setEditingUser(record)
    setModalOpen(true)
    form.resetFields()

    try {
      const result = await getUserDepartmentsApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '读取用户部门关系失败')
        return
      }

      const list = result.data?.departments || []
      const primary = list.find((item) => Number(item.is_primary) === 1)?.id
      const firstDepartmentId = list[0]?.id

      form.setFieldsValue({
        department_id: primary || firstDepartmentId || undefined,
      })
    } catch (error) {
      message.error(error?.message || '读取用户部门关系失败')
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingUser(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    if (!editingUser) return

    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const selectedDepartmentId = values.department_id || null
      const payload = {
        department_ids: selectedDepartmentId ? [selectedDepartmentId] : [],
        primary_department_id: selectedDepartmentId,
      }

      const result = await setUserDepartmentsApi(editingUser.id, payload)
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success('部门分配已更新')
      closeModal()
      fetchUsers()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error(error?.message || '保存失败')
      }
    } finally {
      setSubmitting(false)
    }
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
      width: 140,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 220,
      render: (email) => email || '-',
    },
    {
      title: '当前部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 160,
      render: (departmentName) => departmentName || '-',
    },
    {
      title: '角色',
      dataIndex: 'role_names',
      key: 'role_names',
      width: 220,
      render: (roleNames) => {
        const names = roleNames ? String(roleNames).split(',') : []
        if (names.length === 0) return '-'

        return (
          <>
            {names.map((role) => (
              <Tag color="blue" key={role}>
                {role}
              </Tag>
            ))}
          </>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) =>
        canManage ? (
          <Button type="link" icon={<ApartmentOutlined />} onClick={() => openAssignModal(record)}>
            分配部门
          </Button>
        ) : (
          '-'
        ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>用户部门分配</h1>
        <p style={{ color: '#666', marginTop: '8px' }}>
          为用户分配唯一部门（会同步到用户主数据）。
        </p>
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
            style={{ width: 320 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={users}
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
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingUser ? `分配部门 - ${editingUser.username}` : '分配部门'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            label="所属部门"
            name="department_id"
            rules={[{ required: true, message: '请选择部门' }]}
          >
            <Select
              allowClear
              placeholder="请选择部门"
              options={departmentOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserDepartments
