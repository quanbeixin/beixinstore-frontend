import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createDictItemApi,
  createDictTypeApi,
  deleteDictItemApi,
  deleteDictTypeApi,
  getDictItemsApi,
  getDictTypesApi,
  updateDictItemApi,
  updateDictTypeApi,
} from '../api/configDict'

function DictCenter() {
  const [types, setTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [selectedTypeKey, setSelectedTypeKey] = useState('')

  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [typeSubmitting, setTypeSubmitting] = useState(false)

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemSubmitting, setItemSubmitting] = useState(false)

  const [typeForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const selectedType = useMemo(
    () => types.find((type) => type.type_key === selectedTypeKey) || null,
    [types, selectedTypeKey],
  )

  const fetchTypes = useCallback(async () => {
    setTypesLoading(true)
    try {
      const result = await getDictTypesApi()
      if (!result.success) {
        message.error(result.message || '获取字典类型失败')
        return
      }

      setTypes(result.data)
      if (!selectedTypeKey && result.data.length > 0) {
        setSelectedTypeKey(result.data[0].type_key)
      }
    } catch (error) {
      message.error(error?.message || '获取字典类型失败')
    } finally {
      setTypesLoading(false)
    }
  }, [selectedTypeKey])

  const fetchItems = useCallback(async (typeKey) => {
    if (!typeKey) {
      setItems([])
      return
    }

    setItemsLoading(true)
    try {
      const result = await getDictItemsApi(typeKey)
      if (!result.success) {
        message.error(result.message || '获取字典项失败')
        return
      }

      setItems(result.data)
    } catch (error) {
      message.error(error?.message || '获取字典项失败')
    } finally {
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTypes()
  }, [fetchTypes])

  useEffect(() => {
    fetchItems(selectedTypeKey)
  }, [selectedTypeKey, fetchItems])

  const openCreateType = () => {
    setEditingType(null)
    typeForm.setFieldsValue({ enabled: true })
    setTypeModalOpen(true)
  }

  const openEditType = (record) => {
    setEditingType(record)
    typeForm.setFieldsValue({
      typeName: record.type_name,
      description: record.description,
      enabled: Boolean(record.enabled),
    })
    setTypeModalOpen(true)
  }

  const closeTypeModal = () => {
    setTypeModalOpen(false)
    setEditingType(null)
    typeForm.resetFields()
  }

  const submitType = async () => {
    try {
      setTypeSubmitting(true)
      const values = await typeForm.validateFields()

      let result
      if (editingType) {
        result = await updateDictTypeApi(editingType.type_key, {
          typeName: values.typeName,
          description: values.description || null,
          enabled: values.enabled,
        })
      } else {
        result = await createDictTypeApi({
          typeKey: values.typeKey,
          typeName: values.typeName,
          description: values.description || null,
          enabled: values.enabled,
        })
      }

      if (!result.success) {
        message.error(result.message || (editingType ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingType ? '类型更新成功' : '类型创建成功')
      closeTypeModal()
      fetchTypes()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查类型表单输入')
      } else {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setTypeSubmitting(false)
    }
  }

  const removeType = async (record) => {
    try {
      const result = await deleteDictTypeApi(record.type_key)
      if (!result.success) {
        message.error(result.message || '删除失败')
        return
      }

      message.success('类型删除成功')
      if (selectedTypeKey === record.type_key) {
        setSelectedTypeKey('')
      }
      fetchTypes()
    } catch (error) {
      message.error(error?.message || '删除失败')
    }
  }

  const openCreateItem = () => {
    if (!selectedTypeKey) {
      message.warning('请先选择字典类型')
      return
    }

    setEditingItem(null)
    itemForm.setFieldsValue({
      enabled: true,
      sortOrder: 0,
    })
    setItemModalOpen(true)
  }

  const openEditItem = (record) => {
    setEditingItem(record)
    itemForm.setFieldsValue({
      itemName: record.item_name,
      sortOrder: record.sort_order,
      enabled: Boolean(record.enabled),
      color: record.color,
      remark: record.remark,
      extraJson: record.extra_json,
    })
    setItemModalOpen(true)
  }

  const closeItemModal = () => {
    setItemModalOpen(false)
    setEditingItem(null)
    itemForm.resetFields()
  }

  const submitItem = async () => {
    try {
      setItemSubmitting(true)
      const values = await itemForm.validateFields()

      let result
      if (editingItem) {
        result = await updateDictItemApi(editingItem.id, {
          itemName: values.itemName,
          sortOrder: values.sortOrder,
          enabled: values.enabled,
          color: values.color || null,
          remark: values.remark || null,
          extraJson: values.extraJson || null,
        })
      } else {
        result = await createDictItemApi({
          typeKey: selectedTypeKey,
          itemCode: values.itemCode?.trim().toUpperCase(),
          itemName: values.itemName,
          sortOrder: values.sortOrder,
          enabled: values.enabled,
          color: values.color || null,
          remark: values.remark || null,
          extraJson: values.extraJson || null,
        })
      }

      if (!result.success) {
        message.error(result.message || (editingItem ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingItem ? '字典项更新成功' : '字典项创建成功')
      closeItemModal()
      fetchItems(selectedTypeKey)
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查字典项表单输入')
      } else {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setItemSubmitting(false)
    }
  }

  const removeItem = async (record) => {
    try {
      const result = await deleteDictItemApi(record.id)
      if (!result.success) {
        message.error(result.message || '删除失败')
        return
      }

      message.success('字典项删除成功')
      fetchItems(selectedTypeKey)
    } catch (error) {
      message.error(error?.message || '删除失败')
    }
  }

  const typeColumns = [
    {
      title: '类型标识',
      dataIndex: 'type_key',
      key: 'type_key',
    },
    {
      title: '类型名称',
      dataIndex: 'type_name',
      key: 'type_name',
    },
    {
      title: '状态',
      key: 'enabled',
      width: 90,
      render: (_, record) => (
        <Tag color={record.enabled ? 'success' : 'default'}>{record.enabled ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditType(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除类型"
            description="删除前请先清空该类型下的字典项"
            onConfirm={() => removeType(record)}
            disabled={Boolean(record.is_builtin)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} disabled={Boolean(record.is_builtin)}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const itemColumns = [
    {
      title: '编码',
      dataIndex: 'item_code',
      key: 'item_code',
      width: 140,
    },
    {
      title: '名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 160,
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
      width: 90,
      render: (_, record) => (
        <Tag color={record.enabled ? 'success' : 'default'}>{record.enabled ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '颜色',
      key: 'color',
      width: 120,
      render: (_, record) => (record.color ? <Tag color={record.color}>{record.color}</Tag> : '-'),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditItem(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除字典项"
            onConfirm={() => removeItem(record)}
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
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>字典中心（M1）</h1>
        <p style={{ color: '#666', marginTop: '8px' }}>
          管理通用选型字段：先定义“字典类型”，再维护该类型下的“字典项”。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '16px' }}>
        <Card
          title="字典类型"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateType}>
              新增类型
            </Button>
          }
        >
          <Table
            rowKey="type_key"
            loading={typesLoading}
            columns={typeColumns}
            dataSource={types}
            size="small"
            pagination={false}
            onRow={(record) => ({
              onClick: () => setSelectedTypeKey(record.type_key),
            })}
            rowClassName={(record) => (record.type_key === selectedTypeKey ? 'selected-row' : '')}
          />
        </Card>

        <Card
          title={selectedType ? `字典项：${selectedType.type_name} (${selectedType.type_key})` : '字典项'}
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateItem} disabled={!selectedTypeKey}>
              新增字典项
            </Button>
          }
        >
          <Table
            rowKey="id"
            loading={itemsLoading}
            columns={itemColumns}
            dataSource={items}
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
          />
        </Card>
      </div>

      <Modal
        title={editingType ? '编辑字典类型' : '新增字典类型'}
        open={typeModalOpen}
        onCancel={closeTypeModal}
        onOk={submitType}
        confirmLoading={typeSubmitting}
      >
        <Form form={typeForm} layout="vertical" style={{ marginTop: '16px' }}>
          {!editingType && (
            <Form.Item
              label="类型标识（typeKey）"
              name="typeKey"
              rules={[
                { required: true, message: '请输入类型标识' },
                { pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '仅支持小写字母、数字、下划线，需字母开头' },
              ]}
            >
              <Input placeholder="示例：user_status" />
            </Form.Item>
          )}

          <Form.Item
            label="类型名称"
            name="typeName"
            rules={[{ required: true, message: '请输入类型名称' }]}
          >
            <Input placeholder="示例：用户状态" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="可选：说明该类型用于哪些业务场景" />
          </Form.Item>

          <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingItem ? '编辑字典项' : '新增字典项'}
        open={itemModalOpen}
        onCancel={closeItemModal}
        onOk={submitItem}
        confirmLoading={itemSubmitting}
        width={640}
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: '16px' }}>
          {!editingItem && (
            <Form.Item
              label="字典项编码（itemCode）"
              name="itemCode"
              rules={[
                { required: true, message: '请输入字典项编码' },
                { pattern: /^[A-Za-z][A-Za-z0-9_]{1,63}$/, message: '仅支持字母、数字、下划线，需字母开头' },
              ]}
            >
              <Input placeholder="示例：enabled（保存时会自动转为 ENABLED）" />
            </Form.Item>
          )}

          <Form.Item
            label="字典项名称"
            name="itemName"
            rules={[{ required: true, message: '请输入字典项名称' }]}
          >
            <Input placeholder="示例：启用" />
          </Form.Item>

          <Form.Item label="排序" name="sortOrder" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="颜色" name="color">
            <Input placeholder="可选：如 green / #52c41a" />
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>

          <Form.Item label="扩展 JSON" name="extraJson">
            <Input.TextArea rows={3} placeholder='可选：{"icon":"check-circle"}' />
          </Form.Item>

          <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DictCenter
