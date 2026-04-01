import { ReloadOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getMyAssignedItemsApi, updateAssignedLogApi } from '../../api/work'
import { formatBeijingDate } from '../../utils/datetime'
import { getUnifiedStatusMeta } from '../../utils/workStatus'

const { Text } = Typography

const STATUS_OPTIONS = [
  { label: '待开始', value: 'TODO' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
]

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getStatusTagColor(status) {
  if (status === 'TODO') return 'default'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'DONE') return 'success'
  return 'default'
}

function getStatusLabel(status) {
  if (status === 'TODO') return '待开始'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'DONE') return '已完成'
  return status || '-'
}

function MyAssignedItemsPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getMyAssignedItemsApi()
      if (!result?.success) {
        message.error(result?.message || '获取我的指派事项失败')
        return
      }
      setData(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取我的指派事项失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openEditModal = (item) => {
    setEditingItem(item)
    form.setFieldsValue({
      description: item.description,
      owner_estimate_hours: item.owner_estimate_hours,
      expected_start_date: item.expected_start_date,
      expected_completion_date: item.expected_completion_date,
      log_status: item.log_status,
    })
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingItem(null)
    form.resetFields()
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = await updateAssignedLogApi(editingItem.id, values)
      if (!result?.success) {
        message.error(result?.message || '更新失败')
        return
      }
      message.success('更新成功')
      closeEditModal()
      await loadData()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '更新失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '综合状态',
      key: 'unified_status',
      width: 110,
      render: (_, row) => {
        const meta = getUnifiedStatusMeta(row)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '负责人',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '工作描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '关联需求',
      key: 'demand',
      width: 200,
      render: (_, row) => (row.demand_id ? `${row.demand_id} - ${row.demand_name || '-'}` : '-'),
    },
    {
      title: '阶段',
      key: 'phase',
      width: 150,
      render: (_, row) => row.phase_name || row.phase_key || '-',
    },
    {
      title: 'Owner评估(h)',
      dataIndex: 'owner_estimate_hours',
      key: 'owner_estimate_hours',
      width: 130,
      render: (value) =>
        value === null || value === undefined ? <Tag color="orange">待评估</Tag> : toNumber(value, 0).toFixed(1),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 100,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '预计完成日期',
      dataIndex: 'expected_completion_date',
      key: 'expected_completion_date',
      width: 130,
      render: (value) => formatBeijingDate(value),
    },
    {
      title: '状态',
      dataIndex: 'log_status',
      key: 'log_status',
      width: 96,
      render: (value) => <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(row)}>
          编辑
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        title="我的指派事项"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            刷新
          </Button>
        }
      >
        {data.length === 0 && !loading ? (
          <Empty description="暂无指派事项" />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            size="small"
            scroll={{ x: 1400 }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        )}
      </Card>

      <Modal
        title="编辑事项"
        open={editModalOpen}
        onCancel={closeEditModal}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="工作描述" name="description" rules={[{ required: true, message: '请输入工作描述' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Owner评估(h)" name="owner_estimate_hours">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="预计开始日期" name="expected_start_date">
            <Input type="date" />
          </Form.Item>
          <Form.Item label="预计完成日期" name="expected_completion_date">
            <Input type="date" />
          </Form.Item>
          <Form.Item label="状态" name="log_status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MyAssignedItemsPage
