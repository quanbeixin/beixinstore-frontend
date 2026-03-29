import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Typography } from 'antd'

const { Text } = Typography

function WorkflowToolbar({
  editable = false,
  nodeCount = 0,
  modeLabel = '顺序流程',
  helperText = '以顺序流程为主，后续可扩展分支显示能力。',
  metaTags = [],
  onAddNode,
  onAutoSort,
}) {
  return (
    <div className="workflow-toolbar">
      <div className="workflow-toolbar-copy">
        <Text strong>流程画布</Text>
        <Text type="secondary">{helperText}</Text>
      </div>
      <Space wrap>
        <Tag color="processing">节点数 {nodeCount}</Tag>
        <Tag>{modeLabel}</Tag>
        {metaTags.map((item) => (
          <Tag key={`${item.color || 'default'}-${item.label}`} color={item.color}>
            {item.label}
          </Tag>
        ))}
        {editable ? (
          <>
            <Button icon={<ReloadOutlined />} onClick={onAutoSort}>
              自动排序
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddNode}>
              新增节点
            </Button>
          </>
        ) : null}
      </Space>
    </div>
  )
}

export default WorkflowToolbar
