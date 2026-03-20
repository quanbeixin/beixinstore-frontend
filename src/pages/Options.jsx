import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  message,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { createOptionApi, deleteOptionApi, getOptionsApi, updateOptionApi } from '../api/options'

const OPTION_TYPE = 'roles'

function Options() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form] = Form.useForm()

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOptionsApi(OPTION_TYPE)
      if (!result.success) {
        message.error(result.message || '获取角色列表失败')
        return
      }

      setRoles(result.data || [])
    } catch (error) {
      message.error(error?.message || '获取角色列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除角色"
            description={`确定要删除"${record.name}"吗？`}
            okText="确定"
            cancelText="取消"
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const openCreateModal = () => {
    setEditingItem(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingItem(record)
    form.setFieldsValue({ name: record.name })
    setModalVisible(true)
  }

  const closeModal = () => {
    setModalVisible(false)
    setEditingItem(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      const values = await form.validateFields()

      const result = editingItem
        ? await updateOptionApi(OPTION_TYPE, editingItem.id, values)
        : await createOptionApi(OPTION_TYPE, values)

      if (!result.success) {
        message.error(result.message || (editingItem ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingItem ? '更新成功' : '创建成功')
      closeModal()
      fetchRoles()
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
      const result = await deleteOptionApi(OPTION_TYPE, record.id)
      if (!result.success) {
        message.error(result.message || '删除失败')
        return
      }

      message.success('删除成功')
      fetchRoles()
    } catch (error) {
      message.error(error?.message || '删除失败')
    }
  }

  return (
    <div style={{ padding: '16px' }}>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新增角色
        </Button>
      </div>

      <Table rowKey="id" loading={loading} columns={columns} dataSource={roles} pagination={false} />

      <Modal
        title={editingItem ? '编辑角色' : '新增角色'}
        open={modalVisible}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            label="角色名称"
            name="name"
            rules={[
              { required: true, message: '请输入角色名称' },
              { min: 2, message: '至少 2 个字符' },
              { max: 30, message: '最多 30 个字符' },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Options
