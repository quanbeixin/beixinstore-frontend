import {
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Col,
  Form,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useMemo } from 'react'

const { Text } = Typography

function buildOption(item) {
  return {
    label: item.name,
    value: item.code,
  }
}

function buildMetaMap(options = []) {
  return new Map(options.map((item) => [item.code, item]))
}

function DeliveryPlatformOverviewModal({
  open,
  mode = 'view',
  matrixPackage,
  rows = [],
  platformOptions = [],
  channelOptions = [],
  statusOptions = [],
  loading = false,
  saving = false,
  onCancel,
  onSave,
}) {
  const [form] = Form.useForm()
  const watchedItems = Form.useWatch('items', form) || []
  const isEditing = mode === 'edit'
  const channelMap = useMemo(() => buildMetaMap(channelOptions), [channelOptions])
  const statusMap = useMemo(() => buildMetaMap(statusOptions), [statusOptions])

  useEffect(() => {
    if (!open || !isEditing) return
    form.setFieldsValue({
      items: rows.length > 0
        ? rows.map((item) => ({
          platform_code: item.platform_code,
          channel_code: item.channel_code,
          status_code: item.status_code,
        }))
        : [],
    })
  }, [form, isEditing, open, rows])

  const detailRows = useMemo(() => {
    const rowMap = new Map(rows.map((item) => [item.platform_code, item]))
    return platformOptions.map((platform) => ({
      platform_code: platform.code,
      platform_name: platform.name,
      platform_color: platform.color,
      ...(rowMap.get(platform.code) || {}),
    }))
  }, [platformOptions, rows])

  const detailColumns = [
    {
      title: '投放平台',
      dataIndex: 'platform_code',
      width: 140,
      render: (value, record) => <Tag color={record.platform_color || 'default'}>{record.platform_name || value}</Tag>,
    },
    {
      title: '投放渠道',
      dataIndex: 'channel_code',
      width: 120,
      render: (value, record) => {
        if (!value) return '-'
        const meta = channelMap.get(value) || { name: record.channel_name || value, color: record.channel_color || 'default' }
        return <Tag color={record.channel_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '当前状态',
      dataIndex: 'status_code',
      width: 120,
      render: (value, record) => {
        if (!value) return '-'
        const meta = statusMap.get(value) || { name: record.status_name || value, color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '最近修改人',
      dataIndex: 'updated_by_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '最近修改时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value) => value || '-',
    },
  ]

  const title = (
    <Space size={8} wrap>
      <span>{isEditing ? '编辑投放平台信息概览' : '投放平台信息详情'}</span>
      <Tag>{matrixPackage?.package_name || '-'}</Tag>
      <Tag color={matrixPackage?.status_color || 'default'}>{matrixPackage?.status_name || matrixPackage?.status_code || '-'}</Tag>
    </Space>
  )

  const handleSubmit = async () => {
    const values = await form.validateFields()
    await onSave?.(Array.isArray(values.items) ? values.items : [])
  }

  return (
    <Modal
      title={title}
      open={open}
      width={isEditing ? 760 : 860}
      destroyOnHidden
      confirmLoading={saving}
      okButtonProps={{ disabled: loading }}
      okText="保存"
      cancelText="取消"
      footer={isEditing ? undefined : <Button onClick={onCancel}>关闭</Button>}
      onOk={isEditing ? handleSubmit : undefined}
      onCancel={onCancel}
    >
      {isEditing ? (
        <Form form={form} layout="vertical" className="delivery-platform-form" disabled={loading}>
          <div className="delivery-platform-form-head" aria-hidden="true">
            <span>投放平台</span>
            <span>投放渠道</span>
            <span>平台状态</span>
            <span>操作</span>
          </div>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size={12} className="delivery-platform-form-list">
                {fields.map((field) => {
                  const currentPlatformCode = watchedItems[field.name]?.platform_code
                  const selectedPlatformCodes = new Set(
                    watchedItems
                      .map((item) => item?.platform_code)
                      .filter((code) => code && code !== currentPlatformCode),
                  )
                  return (
                    <Row key={field.key} gutter={[12, 10]} align="middle">
                      <Col xs={24} md={7}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'platform_code']}
                          rules={[
                            { required: true, message: '请选择投放平台' },
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (!value) return Promise.resolve()
                                const items = getFieldValue('items') || []
                                const count = items.filter((item) => item?.platform_code === value).length
                                return count > 1 ? Promise.reject(new Error('同一平台不能重复')) : Promise.resolve()
                              },
                            }),
                          ]}
                        >
                          <Select
                            placeholder="选择平台"
                            options={platformOptions.map((item) => ({
                              ...buildOption(item),
                              disabled: selectedPlatformCodes.has(item.code),
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'channel_code']}
                          rules={[{ required: true, message: '请选择投放渠道' }]}
                        >
                          <Select placeholder="选择渠道" options={channelOptions.map(buildOption)} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'status_code']}
                          rules={[{ required: true, message: '请选择平台状态' }]}
                        >
                          <Select placeholder="选择状态" options={statusOptions.map(buildOption)} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={3} className="delivery-platform-form-remove">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          title="删除平台"
                          aria-label="删除平台"
                          onClick={() => remove(field.name)}
                        />
                      </Col>
                    </Row>
                  )
                })}
                {fields.length === 0 ? <Text type="secondary">尚未配置投放平台</Text> : null}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  disabled={fields.length >= platformOptions.length}
                  onClick={() => add({ platform_code: undefined, channel_code: undefined, status_code: undefined })}
                >
                  新增平台
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      ) : (
        <Table
          rowKey="platform_code"
          size="middle"
          loading={loading}
          columns={detailColumns}
          dataSource={detailRows}
          pagination={false}
          scroll={{ x: 700 }}
        />
      )}
    </Modal>
  )
}

export default DeliveryPlatformOverviewModal
