import { Modal, Table, Tag, Typography } from 'antd'

const { Text } = Typography

const columns = [
  {
    title: '投放平台',
    dataIndex: 'platform_code',
    width: 180,
    render: (value, record) => (
      <Tag color={record.platform_color || 'default'}>
        {record.platform_name || value || '-'}
      </Tag>
    ),
  },
  {
    title: '在投数量',
    dataIndex: 'active_count',
    align: 'center',
    width: 140,
    render: (value) => <Text className="delivery-platform-summary-count is-active">{Number(value || 0)}</Text>,
  },
  {
    title: '可投数量',
    dataIndex: 'available_count',
    align: 'center',
    width: 140,
    render: (value) => <Text className="delivery-platform-summary-count is-available">{Number(value || 0)}</Text>,
  },
  {
    title: '封禁数量',
    dataIndex: 'banned_count',
    align: 'center',
    width: 140,
    render: (value) => <Text className="delivery-platform-summary-count is-banned">{Number(value || 0)}</Text>,
  },
]

function DeliveryPlatformSummaryModal({ open, loading = false, rows = [], onCancel }) {
  return (
    <Modal
      title="平台投放总览"
      open={open}
      width={680}
      footer={null}
      destroyOnHidden
      onCancel={onCancel}
    >
      <Table
        rowKey="platform_code"
        className="delivery-platform-summary-table"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
      />
    </Modal>
  )
}

export default DeliveryPlatformSummaryModal
