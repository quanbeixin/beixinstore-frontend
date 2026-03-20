import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getUserByIdApi, getUsersApi } from '../api/users'
import {
  createDepartmentApi,
  deleteDepartmentApi,
  getDepartmentsApi,
  updateDepartmentApi,
} from '../api/org'
import { hasPermission } from '../utils/access'

function flattenDepartments(tree = [], acc = []) {
  tree.forEach((node) => {
    acc.push(node)
    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenDepartments(node.children, acc)
    }
  })
  return acc
}

function getDescendantIds(node) {
  const ids = []

  function walk(current) {
    if (!Array.isArray(current?.children)) return
    current.children.forEach((child) => {
      ids.push(child.id)
      walk(child)
    })
  }

  walk(node)
  return ids
}

function Departments() {
  const canManage = hasPermission('dept.manage')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [treeData, setTreeData] = useState([])
  const [users, setUsers] = useState([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState(null)

  const [form] = Form.useForm()

  const flatDepartments = useMemo(() => flattenDepartments(treeData, []), [treeData])

  const departmentNameMap = useMemo(() => {
    const map = new Map()
    flatDepartments.forEach((dept) => {
      map.set(dept.id, dept.name)
    })
    return map
  }, [flatDepartments])

  const parentOptions = useMemo(() => {
    if (!editingDept) {
      return flatDepartments.map((dept) => ({ value: dept.id, label: dept.name }))
    }

    const currentNode = flatDepartments.find((dept) => dept.id === editingDept.id)
    const blockedIds = new Set([editingDept.id, ...(currentNode ? getDescendantIds(currentNode) : [])])

    return flatDepartments
      .filter((dept) => !blockedIds.has(dept.id))
      .map((dept) => ({ value: dept.id, label: dept.name }))
  }, [editingDept, flatDepartments])

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.username}${user.email ? ` (${user.email})` : ''}` })),
    [users],
  )

  const fetchDepartments = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getDepartmentsApi({ mode: 'tree' })
      if (!result?.success) {
        message.error(result?.message || '获取部门树失败')
        return
      }

      setTreeData(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取部门树失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const result = await getUsersApi({ page: 1, pageSize: 500, keyword: '' })
      if (result?.success) {
        setUsers(result.data?.list || [])
      }
    } catch (error) {
      console.warn('加载用户列表失败:', error)
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
    fetchUsers()
  }, [fetchDepartments, fetchUsers])

  const openCreate = () => {
    setEditingDept(null)
    form.resetFields()
    form.setFieldsValue({
      sort_order: 0,
      enabled: true,
    })
    setModalOpen(true)
  }

  const openEdit = async (record) => {
    setEditingDept(record)
    setModalOpen(true)

    try {
      let managerExists = true
      if (record.manager_user_id) {
        const managerDetail = await getUserByIdApi(record.manager_user_id)
        managerExists = Boolean(managerDetail?.success && managerDetail?.data)
      }

      form.setFieldsValue({
        name: record.name,
        parent_id: record.parent_id || undefined,
        manager_user_id: managerExists ? record.manager_user_id || undefined : undefined,
        sort_order: Number.isFinite(Number(record.sort_order)) ? Number(record.sort_order) : 0,
        enabled: Boolean(record.enabled),
      })
    } catch (error) {
      message.error(error?.message || '读取部门详情失败')
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingDept(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        name: values.name?.trim(),
        parent_id: values.parent_id || null,
        manager_user_id: values.manager_user_id || null,
        sort_order: Number.isFinite(Number(values.sort_order)) ? Number(values.sort_order) : 0,
        enabled: values.enabled ? 1 : 0,
      }

      const result = editingDept
        ? await updateDepartmentApi(editingDept.id, payload)
        : await createDepartmentApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingDept ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingDept ? '部门更新成功' : '部门创建成功')
      closeModal()
      fetchDepartments()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      const result = await deleteDepartmentApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除失败')
        return
      }

      message.success('删除成功')
      fetchDepartments()
    } catch (error) {
      message.error(error?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '部门名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
    },
    {
      title: '上级部门',
      key: 'parent_name',
      width: 180,
      render: (_, record) => (record.parent_id ? departmentNameMap.get(record.parent_id) || '-' : '顶级部门'),
    },
    {
      title: '负责人',
      dataIndex: 'manager_name',
      key: 'manager_name',
      width: 140,
      render: (managerName) => managerName || '-',
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 90,
    },
    {
      title: '状态',
      key: 'enabled',
      width: 100,
      render: (_, record) => (
        <Tag color={record.enabled ? 'success' : 'default'}>{record.enabled ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => {
        if (!canManage) return '-'

        return (
          <Space size="small">
            <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="确认删除部门"
              description={`确定删除部门“${record.name}”吗？`}
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: '16px' }}>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Button icon={<ReloadOutlined />} onClick={fetchDepartments}>
          刷新
        </Button>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增部门
          </Button>
        )}
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={treeData}
        pagination={false}
        scroll={{ x: 900 }}
      />

      <Modal
        title={editingDept ? '编辑部门' : '新增部门'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            label="部门名称"
            name="name"
            rules={[
              { required: true, message: '请输入部门名称' },
              { min: 2, message: '至少 2 个字符' },
              { max: 64, message: '最多 64 个字符' },
            ]}
          >
            <Input placeholder="请输入部门名称" />
          </Form.Item>

          <Form.Item label="上级部门" name="parent_id">
            <Select
              allowClear
              placeholder="无则为顶级部门"
              options={parentOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item label="部门负责人" name="manager_user_id">
            <Select
              allowClear
              placeholder="可选"
              options={userOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item label="排序" name="sort_order" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Departments
