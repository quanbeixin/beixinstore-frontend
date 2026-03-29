import { Empty } from 'antd'

function WorkflowEmptyState({ title = '暂无流程节点', description = '请先新增流程节点后再进行配置。' }) {
  return (
    <div className="workflow-empty-state">
      <Empty description={description}>
        <div className="workflow-empty-state-title">{title}</div>
      </Empty>
    </div>
  )
}

export default WorkflowEmptyState
