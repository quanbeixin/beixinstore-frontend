import {
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDepartmentsApi } from '../api/org'
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

const { Search } = Input
const { Text } = Typography

function parseJsonObject(raw) {
  if (!raw) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return null

  const text = raw.trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function toExtraJsonText(raw) {
  if (raw === null || raw === undefined || raw === '') return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw, null, 2)
    } catch {
      return ''
    }
  }
  return ''
}

function getRequireDemandValue(raw) {
  const obj = parseJsonObject(raw)
  if (!obj) return false
  const value = obj.require_demand ?? obj.requireDemand
  if (value === true || value === 1 || value === '1') return true
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true
  return false
}

function getOwnerEstimateRuleValue(raw) {
  const obj = parseJsonObject(raw)
  if (!obj) return 'NONE'
  const value = String(obj.owner_estimate_rule ?? obj.ownerEstimateRule ?? '').trim().toUpperCase()
  if (value === 'OPTIONAL' || value === 'REQUIRED') return value
  return 'NONE'
}

function getOwnerDepartmentIdValue(raw) {
  const obj = parseJsonObject(raw)
  if (!obj) return null
  const value = obj.owner_department_id ?? obj.ownerDepartmentId
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function getOwnerEstimateRequiredValue(raw) {
  const obj = parseJsonObject(raw)
  if (!obj) return false
  const value = obj.owner_estimate_required ?? obj.ownerEstimateRequired
  if (value === true || value === 1 || value === '1') return true
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true
  return false
}

function DictCenter() {
  const [types, setTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [selectedTypeKey, setSelectedTypeKey] = useState('')
  const [typeKeyword, setTypeKeyword] = useState('')

  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [departments, setDepartments] = useState([])

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
  const itemModalTypeKey = editingItem?.type_key || selectedTypeKey
  const isIssueTypeItem = itemModalTypeKey === 'issue_type'
  const isDemandPhaseTypeItem = itemModalTypeKey === 'demand_phase_type'

  const departmentOptions = useMemo(
    () =>
      (departments || []).map((item) => ({
        value: item.id,
        label: item.name ? item.name : `部门${item.id}`,
      })),
    [departments],
  )
  const departmentNameMap = useMemo(() => {
    const map = new Map()
    ;(departments || []).forEach((item) => {
      if (item?.id) map.set(Number(item.id), item.name || `部门#${item.id}`)
    })
    return map
  }, [departments])

  const filteredTypes = useMemo(() => {
    const q = typeKeyword.trim().toLowerCase()
    if (!q) return types

    return types.filter((type) => {
      const text = `${type.type_key} ${type.type_name} ${type.description || ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [types, typeKeyword])

  const fetchTypes = useCallback(async () => {
    setTypesLoading(true)
    try {
      const result = await getDictTypesApi()
      if (!result.success) {
        message.error(result.message || '获取字典类型失败')
        return
      }

      const list = result.data || []
      setTypes(list)
      setSelectedTypeKey((prev) => {
        if (prev && list.some((item) => item.type_key === prev)) return prev
        return list[0]?.type_key || ''
      })
    } catch (error) {
      message.error(error?.message || '获取字典类型失败')
    } finally {
      setTypesLoading(false)
    }
  }, [])

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

      setItems(result.data || [])
    } catch (error) {
      message.error(error?.message || '获取字典项失败')
    } finally {
      setItemsLoading(false)
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    try {
      const result = await getDepartmentsApi({ mode: 'flat' })
      if (!result?.success) return
      const rows = Array.isArray(result.data) ? result.data : []
      const enabledOnly = rows.filter((item) => Number(item.enabled ?? 1) === 1)
      setDepartments(enabledOnly)
    } catch {
      setDepartments([])
    }
  }, [])

  useEffect(() => {
    fetchTypes()
  }, [fetchTypes])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  useEffect(() => {
    fetchItems(selectedTypeKey)
  }, [selectedTypeKey, fetchItems])

  const handleRefresh = async () => {
    await Promise.all([fetchTypes(), fetchItems(selectedTypeKey), fetchDepartments()])
  }

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
      requireDemand: false,
      ownerEstimateRule: 'NONE',
      ownerDepartmentId: undefined,
      ownerEstimateRequired: false,
      extraJson: '',
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
      extraJson: toExtraJsonText(record.extra_json),
      requireDemand: getRequireDemandValue(record.extra_json),
      ownerEstimateRule: getOwnerEstimateRuleValue(record.extra_json),
      ownerDepartmentId: getOwnerDepartmentIdValue(record.extra_json) || undefined,
      ownerEstimateRequired: getOwnerEstimateRequiredValue(record.extra_json),
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
      const extraJsonText = String(values.extraJson || '').trim()
      let finalExtraJson = extraJsonText || null

      let baseObj = null
      if (isIssueTypeItem || isDemandPhaseTypeItem) {
        baseObj = {}
        if (extraJsonText) {
          try {
            const parsed = JSON.parse(extraJsonText)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              baseObj = parsed
            } else {
              message.error('扩展 JSON 必须是对象（例如 {"a":1}）')
              return
            }
          } catch {
            message.error('扩展 JSON 不是合法 JSON')
            return
          }
        }
      }

      if (isIssueTypeItem && baseObj) {
        baseObj.require_demand = Boolean(values.requireDemand)
        baseObj.owner_estimate_rule = String(values.ownerEstimateRule || 'NONE').toUpperCase()
        finalExtraJson = JSON.stringify(baseObj)
      }

      if (isDemandPhaseTypeItem && baseObj) {
        const ownerDepartmentId = Number(values.ownerDepartmentId)
        if (Number.isInteger(ownerDepartmentId) && ownerDepartmentId > 0) {
          baseObj.owner_department_id = ownerDepartmentId
        } else {
          delete baseObj.owner_department_id
          delete baseObj.ownerDepartmentId
        }
        baseObj.owner_estimate_required = Boolean(values.ownerEstimateRequired)
        finalExtraJson = JSON.stringify(baseObj)
      }

      let result
      if (editingItem) {
        result = await updateDictItemApi(editingItem.id, {
          itemName: values.itemName,
          sortOrder: values.sortOrder,
          enabled: values.enabled,
          color: values.color || null,
          remark: values.remark || null,
          extraJson: finalExtraJson,
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
          extraJson: finalExtraJson,
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
      width: 170,
      render: (value) => <Text code>{value}</Text>,
    },
    {
      title: '类型名称',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 160,
      ellipsis: true,
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
      fixed: 'right',
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
      render: (value) => <Text code>{value}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 160,
      ellipsis: true,
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
      title: 'Owner评估配置',
      key: 'owner_estimate_config',
      width: 220,
      render: (_, record) => {
        if (selectedTypeKey === 'issue_type') {
          const rule = getOwnerEstimateRuleValue(record.extra_json)
          const color = rule === 'REQUIRED' ? 'red' : rule === 'OPTIONAL' ? 'gold' : 'default'
          const text = rule === 'REQUIRED' ? '必须评估' : rule === 'OPTIONAL' ? '可选评估' : '不需要'
          return <Tag color={color}>{text}</Tag>
        }

        if (selectedTypeKey === 'demand_phase_type') {
          const deptId = getOwnerDepartmentIdValue(record.extra_json)
          const deptName = deptId ? departmentNameMap.get(Number(deptId)) || `部门#${deptId}` : '未设置责任部门'
          const required = getOwnerEstimateRequiredValue(record.extra_json)
          return (
            <Space size={4} wrap>
              <Tag color={deptId ? 'blue' : 'default'}>{deptName}</Tag>
              <Tag color={required ? 'red' : 'default'}>{required ? '必须评估' : '非必须'}</Tag>
            </Space>
          )
        }

        return '-'
      },
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
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditItem(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除字典项" onConfirm={() => removeItem(record)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="dict-center-page">
      <Card className="dict-center-hero" variant="borderless">
        <div className="dict-center-hero-head">
          <div>
            <h1 className="dict-center-title">字典中心（M1）</h1>
            <p className="dict-center-subtitle">管理通用选型字段：先定义类型，再维护类型下字典项。</p>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={typesLoading || itemsLoading}>
              刷新数据
            </Button>
          </Space>
        </div>

        <div className="dict-center-stats">
          <div className="dict-center-stat">
            <div className="label">
              <DatabaseOutlined /> 字典类型
            </div>
            <div className="value">{types.length}</div>
          </div>
          <div className="dict-center-stat">
            <div className="label">
              <TagsOutlined /> 当前类型字典项
            </div>
            <div className="value">{items.length}</div>
          </div>
          <div className="dict-center-stat">
            <div className="label">当前选中</div>
            <div className="value small">{selectedType ? selectedType.type_name : '未选择类型'}</div>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]} className="dict-center-main">
        <Col xs={24} xl={9}>
          <Card
            className="dict-center-panel"
            title="字典类型"
            variant="borderless"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateType}>
                新增类型
              </Button>
            }
          >
            <div className="dict-center-toolbar">
              <Search
                allowClear
                placeholder="搜索 type_key / 类型名称"
                prefix={<SearchOutlined />}
                onChange={(e) => setTypeKeyword(e.target.value)}
              />
            </div>

            <div className="dict-center-table-wrap">
              <Table
                rowKey="type_key"
                loading={typesLoading}
                columns={typeColumns}
                dataSource={filteredTypes}
                size="small"
                pagination={false}
                scroll={{ x: 640 }}
                onRow={(record) => ({
                  onClick: () => setSelectedTypeKey(record.type_key),
                })}
                rowClassName={(record) =>
                  record.type_key === selectedTypeKey ? 'dict-center-selected-row' : ''
                }
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card
            className="dict-center-panel"
            title={selectedType ? `字典项：${selectedType.type_name} (${selectedType.type_key})` : '字典项'}
            variant="borderless"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateItem} disabled={!selectedTypeKey}>
                新增字典项
              </Button>
            }
          >
            <div className="dict-center-table-wrap">
              <Table
                rowKey="id"
                loading={itemsLoading}
                columns={itemColumns}
                dataSource={items}
                size="small"
                pagination={false}
                scroll={{ x: 980 }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingType ? '编辑字典类型' : '新增字典类型'}
        open={typeModalOpen}
        onCancel={closeTypeModal}
        onOk={submitType}
        confirmLoading={typeSubmitting}
        forceRender
      >
        <Form form={typeForm} layout="vertical" style={{ marginTop: 16 }}>
          {!editingType && (
            <Form.Item
              label="类型标识（typeKey）"
              name="typeKey"
              rules={[
                { required: true, message: '请输入类型标识' },
                {
                  pattern: /^[a-z][a-z0-9_]{1,63}$/,
                  message: '仅支持小写字母、数字、下划线，需字母开头',
                },
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
        forceRender
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          {!editingItem && (
            <Form.Item
              label="字典项编码（itemCode）"
              name="itemCode"
              rules={[
                { required: true, message: '请输入字典项编码' },
                {
                  pattern: /^[A-Za-z][A-Za-z0-9_]{1,63}$/,
                  message: '仅支持字母、数字、下划线，需字母开头',
                },
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

          {isIssueTypeItem ? (
            <>
              <Form.Item label="是否需要关联需求" name="requireDemand" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="需要" unCheckedChildren="不需要" />
              </Form.Item>
              <Form.Item label="Owner评估规则" name="ownerEstimateRule" initialValue="NONE">
                <Select
                  options={[
                    { value: 'NONE', label: '不需要负责人评估' },
                    { value: 'OPTIONAL', label: '负责人可选评估' },
                    { value: 'REQUIRED', label: '负责人必须评估' },
                  ]}
                />
              </Form.Item>
            </>
          ) : null}

          {isDemandPhaseTypeItem ? (
            <>
              <Form.Item label="责任部门（负责人）" name="ownerDepartmentId">
                <Select
                  allowClear
                  placeholder="请选择负责评估该阶段的部门"
                  options={departmentOptions}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item
                label="该阶段是否必须负责人评估"
                name="ownerEstimateRequired"
                valuePropName="checked"
                initialValue={false}
              >
                <Switch checkedChildren="必须" unCheckedChildren="非必须" />
              </Form.Item>
            </>
          ) : null}

          <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DictCenter

