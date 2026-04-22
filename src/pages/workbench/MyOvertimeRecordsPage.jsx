import { ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
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
import {
  confirmOvertimeRecordApi,
  deleteOvertimeRecordApi,
  getOvertimeRecordsApi,
  updateOvertimeRecordApi,
} from '../../api/work'
import { getAccessSnapshot } from '../../utils/access'

const { RangePicker } = DatePicker

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待确认', value: 'PENDING_CONFIRM' },
  { label: '已确认', value: 'CONFIRMED' },
]

function formatDateTime(value) {
  const text = String(value || '').trim()
  return text || '-'
}

function getStatusMeta(status) {
  if (status === 'PENDING_CONFIRM') return { label: '待确认', color: 'warning' }
  if (status === 'CONFIRMED') return { label: '已确认', color: 'success' }
  return { label: status || '-', color: 'default' }
}

function MyOvertimeRecordsPage() {
  const access = useMemo(() => getAccessSnapshot() || {}, [])
  const isSuperAdmin = Boolean(access?.is_super_admin)

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [actingId, setActingId] = useState(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(
    async ({ force = false } = {}) => {
      setLoading(true)
      try {
        const result = await getOvertimeRecordsApi(
          {
            status: statusFilter || undefined,
            show_all: isSuperAdmin && showAll ? 1 : 0,
            start_date: Array.isArray(dateRange) && dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
            end_date: Array.isArray(dateRange) && dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
          },
          { force },
        )
        if (!result?.success) {
          message.error(result?.message || '获取加班记录失败')
          return
        }
        const items = Array.isArray(result?.data?.items) ? result.data.items : []
        setRecords(items)
      } catch (error) {
        message.error(error?.message || '获取加班记录失败')
      } finally {
        setLoading(false)
      }
    },
    [dateRange, isSuperAdmin, showAll, statusFilter],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  const openEditModal = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      overtime_date: record?.overtime_date || '',
      duration_hours: Number(record?.duration_hours || 0),
      reason: String(record?.reason || ''),
    })
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }

  const handleSaveEdit = async () => {
    if (!editingRecord?.id) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = await updateOvertimeRecordApi(editingRecord.id, {
        overtime_date: values.overtime_date,
        duration_hours: values.duration_hours,
        reason: values.reason,
      })
      if (!result?.success) {
        message.error(result?.message || '更新失败')
        return
      }
      message.success('更新成功')
      closeEditModal()
      await loadData({ force: true })
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '更新失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (recordId) => {
    setActingId(recordId)
    try {
      const result = await deleteOvertimeRecordApi(recordId)
      if (!result?.success) {
        message.error(result?.message || '删除失败')
        return
      }
      message.success('已删除')
      await loadData({ force: true })
    } catch (error) {
      message.error(error?.message || '删除失败')
    } finally {
      setActingId(null)
    }
  }

  const handleConfirm = async (recordId) => {
    setActingId(recordId)
    try {
      const result = await confirmOvertimeRecordApi(recordId)
      if (!result?.success) {
        message.error(result?.message || '确认失败')
        return
      }
      message.success('确认成功')
      await loadData({ force: true })
    } catch (error) {
      message.error(error?.message || '确认失败')
    } finally {
      setActingId(null)
    }
  }

  const columns = [
    {
      title: '加班时间',
      dataIndex: 'overtime_date',
      key: 'overtime_date',
      width: 120,
    },
    {
      title: '加班时长(h)',
      dataIndex: 'duration_hours',
      key: 'duration_hours',
      width: 120,
      render: (value) => Number(value || 0).toFixed(1),
    },
    {
      title: '加班原因',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value) => {
        const statusMeta = getStatusMeta(value)
        return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
      },
    },
    isSuperAdmin
      ? {
          title: '加班人',
          dataIndex: 'applicant_name',
          key: 'applicant_name',
          width: 120,
        }
      : null,
    {
      title: '确认人',
      dataIndex: 'confirmed_by_name',
      key: 'confirmed_by_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '确认时间',
      dataIndex: 'confirmed_at',
      key: 'confirmed_at',
      width: 170,
      render: (value) => formatDateTime(value),
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          {row?.can_edit ? (
            <Button type="link" onClick={() => openEditModal(row)}>
              编辑
            </Button>
          ) : null}
          {row?.can_delete ? (
            <Popconfirm title="确认删除该加班记录？" onConfirm={() => handleDelete(row.id)}>
              <Button type="link" danger loading={actingId === row.id}>
                撤回/删除
              </Button>
            </Popconfirm>
          ) : null}
          {row?.can_confirm ? (
            <Popconfirm title="确认将该记录标记为已确认？" onConfirm={() => handleConfirm(row.id)}>
              <Button type="link" loading={actingId === row.id}>
                确认
              </Button>
            </Popconfirm>
          ) : null}
          {!row?.can_edit && !row?.can_delete && !row?.can_confirm ? '-' : null}
        </Space>
      ),
    },
  ].filter(Boolean)

  return (
    <div style={{ padding: 12 }}>
      <Card
        title="加班记录"
        extra={
          <Space>
            {isSuperAdmin ? (
              <Space size={6}>
                <span style={{ color: '#667085', fontSize: 12 }}>查看全部</span>
                <Switch checked={showAll} onChange={(checked) => setShowAll(checked)} size="small" />
              </Space>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => loadData({ force: true })} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            style={{ width: 140 }}
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder="状态"
          />
          <RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value)}
            allowClear
            placeholder={['开始日期', '结束日期']}
          />
          <Button type="primary" onClick={() => loadData({ force: true })}>
            查询
          </Button>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={records}
          size="small"
          scroll={{ x: 1280 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>

      <Modal
        title={editingRecord?.id ? `编辑加班记录 #${editingRecord.id}` : '编辑加班记录'}
        open={editModalOpen}
        onCancel={closeEditModal}
        onOk={handleSaveEdit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="加班时间"
            name="overtime_date"
            rules={[{ required: true, message: '请选择加班时间' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            label="加班时长(h)"
            name="duration_hours"
            rules={[
              { required: true, message: '请输入加班时长' },
              {
                validator: (_, value) =>
                  Number(value) > 0 ? Promise.resolve() : Promise.reject(new Error('加班时长需大于 0')),
              },
            ]}
          >
            <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="加班原因"
            name="reason"
            rules={[{ required: true, message: '请填写加班原因' }]}
          >
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MyOvertimeRecordsPage
