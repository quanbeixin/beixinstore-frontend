import { Card, Empty, Typography } from 'antd'

const { Text } = Typography

function WorkflowInspector({ title, subtitle, empty = false, emptyDescription, children, extra }) {
  return (
    <Card
      className="workflow-inspector-card"
      title={title}
      extra={extra}
      styles={{ body: { padding: 18 } }}
    >
      {subtitle ? (
        <Text type="secondary" className="workflow-inspector-subtitle">
          {subtitle}
        </Text>
      ) : null}
      {empty ? (
        <div className="workflow-inspector-empty">
          <Empty description={emptyDescription || '请选择节点查看详情'} />
        </div>
      ) : (
        children
      )}
    </Card>
  )
}

export default WorkflowInspector
