import { Card, Col, Progress, Row, Table, Tag } from 'antd'

const departmentRows = [
  { key: 1, department: 'Engineering', headcount: 28, output: 132, efficiency: 92 },
  { key: 2, department: 'Product', headcount: 12, output: 46, efficiency: 86 },
  { key: 3, department: 'Operations', headcount: 16, output: 58, efficiency: 79 },
  { key: 4, department: 'Design', headcount: 9, output: 31, efficiency: 83 },
]

function getEfficiencyColor(value) {
  if (value >= 90) return 'success'
  if (value >= 80) return 'processing'
  return 'warning'
}

function PerformanceDashboard() {
  const columns = [
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 160,
    },
    {
      title: 'Headcount',
      dataIndex: 'headcount',
      key: 'headcount',
      width: 120,
    },
    {
      title: 'Monthly Output',
      dataIndex: 'output',
      key: 'output',
      width: 140,
    },
    {
      title: 'Efficiency Index',
      dataIndex: 'efficiency',
      key: 'efficiency',
      render: (value) => <Tag color={getEfficiencyColor(value)}>{value}</Tag>,
    },
  ]

  return (
    <div style={{ padding: '12px' }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card title="Total Headcount">
            <div style={{ fontSize: 28, fontWeight: 700 }}>65</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Monthly Output">
            <div style={{ fontSize: 28, fontWeight: 700 }}>267</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Overall Efficiency">
            <div style={{ fontSize: 28, fontWeight: 700 }}>87</div>
            <Progress percent={87} showInfo={false} status="active" />
          </Card>
        </Col>
      </Row>

      <Card title="Department Efficiency">
        <Table
          rowKey="key"
          columns={columns}
          dataSource={departmentRows}
          pagination={false}
          size="middle"
        />
      </Card>
    </div>
  )
}

export default PerformanceDashboard
