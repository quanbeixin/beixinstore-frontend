import { Button, DatePicker, InputNumber, Select, Tag, Typography } from 'antd'
import { WorkflowInspector } from '../../workflow'
import { getDemandWorkflowNodeDisplayName } from '../utils/demandWorkflow.mapper'
import './demand-node-inspector.css'

const { Text } = Typography
const { RangePicker } = DatePicker

function getNodeStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'REJECTED') return 'error'
  return 'default'
}

function getNodeStatusLabel(status) {
  if (status === 'DONE') return '已完成'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'REJECTED') return '已驳回'
  if (status === 'PENDING') return '待开始'
  return status || '待开始'
}

function getTaskStatusLabel(status) {
  if (status === 'DONE') return '已完成'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'CANCELLED') return '已取消'
  return '待开始'
}

function formatCompactDate(value, fallback = '-') {
  if (!value) return fallback
  if (typeof value?.format === 'function') {
    return value.format('YYYY-MM-DD')
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const normalized = String(value).trim().replace('T', ' ')
  return normalized ? normalized.slice(0, 10) : fallback
}

function formatHours(value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${num.toFixed(1)} h`
}

function DemandNodeInspector({
  node,
  canManageWorkflow = false,
  isCurrentNode = false,
  workflowActionBusy = false,
  workflowSubmitting = false,
  workflowHoursSubmitting = false,
  workflowAssignee,
  workflowAssigneeOptions = [],
  workflowDueAt,
  workflowExpectedStartAt,
  onWorkflowAssigneeChange,
  onWorkflowDueAtChange,
  onWorkflowExpectedStartAtChange,
  onCommitWorkflowArrangement,
  canAssignSelectedWorkflowNode = false,
  onSubmitNode,
  nodeHoursPersonalEstimate,
  onNodeHoursPersonalEstimateChange,
  onSaveNodePersonalEstimate,
  selectedWorkflowNodeTasks = [],
}) {
  const summaryTitle = getDemandWorkflowNodeDisplayName(node)
  const normalizedNodeStatus = String(node?.status || '').toUpperCase()
  const scheduleValue =
    workflowExpectedStartAt || workflowDueAt ? [workflowExpectedStartAt || null, workflowDueAt || null] : null
  const canEditArrangement = canManageWorkflow && canAssignSelectedWorkflowNode && !workflowSubmitting
  const canEditEstimate = canManageWorkflow && !workflowHoursSubmitting
  const hasTasks = selectedWorkflowNodeTasks.length > 0

  const handleAssigneeChange = (value) => {
    onWorkflowAssigneeChange?.(value)
    onCommitWorkflowArrangement?.({
      assignee_user_id: value,
      expected_start_date: workflowExpectedStartAt,
      due_at: workflowDueAt,
    })
  }

  const handleScheduleChange = (dates) => {
    const [nextStartAt, nextEndAt] = Array.isArray(dates) ? dates : [null, null]
    onWorkflowExpectedStartAtChange?.(nextStartAt)
    onWorkflowDueAtChange?.(nextEndAt)
    onCommitWorkflowArrangement?.({
      assignee_user_id: workflowAssignee,
      expected_start_date: nextStartAt,
      due_at: nextEndAt,
    })
  }

  return (
    <WorkflowInspector
      title={null}
      empty={!node}
      emptyDescription="请选择一个流程节点，查看执行信息。"
    >
      {node ? (
        <div className="demand-node-inspector">
          <div className="demand-node-inspector__panel">
            <div className="demand-node-inspector__panel-head">
              <div className="demand-node-inspector__panel-title-group">
                <div className="demand-node-inspector__panel-title">{summaryTitle}</div>
                <Tag color={getNodeStatusColor(normalizedNodeStatus)} variant="filled" className="demand-node-inspector__status-tag">
                  {getNodeStatusLabel(normalizedNodeStatus)}
                </Tag>
              </div>

              <Button
                type="primary"
                className="demand-node-inspector__complete-btn"
                loading={workflowSubmitting}
                disabled={!canManageWorkflow || !isCurrentNode || workflowActionBusy}
                onClick={onSubmitNode}
              >
                完成
              </Button>
            </div>

            <div className="demand-node-inspector__info-grid">
              <div className="demand-node-inspector__info-cell">
                <span className="demand-node-inspector__label">负责人</span>
                {canManageWorkflow ? (
                  <Select
                    showSearch
                    optionFilterProp="label"
                    value={workflowAssignee}
                    options={workflowAssigneeOptions}
                    placeholder="选择负责人"
                    disabled={!canEditArrangement}
                    onChange={handleAssigneeChange}
                  />
                ) : (
                  <Text className="demand-node-inspector__value-text">{node.assignee_name || '-'}</Text>
                )}
              </div>

              <div className="demand-node-inspector__info-cell">
                <span className="demand-node-inspector__label">个人预估用时</span>
                {canManageWorkflow ? (
                  <InputNumber
                    min={0}
                    step={0.5}
                    precision={2}
                    value={nodeHoursPersonalEstimate}
                    placeholder="填写工时"
                    disabled={!canEditEstimate}
                    onChange={onNodeHoursPersonalEstimateChange}
                    onBlur={() => onSaveNodePersonalEstimate?.()}
                  />
                ) : (
                  <Text className="demand-node-inspector__value-text">
                    {formatHours(nodeHoursPersonalEstimate ?? node?.personal_estimated_hours)}
                  </Text>
                )}
              </div>

              <div className="demand-node-inspector__info-cell demand-node-inspector__info-cell--schedule">
                <span className="demand-node-inspector__label">排期</span>
                {canManageWorkflow ? (
                  <RangePicker
                    value={scheduleValue}
                    format="YYYY-MM-DD"
                    allowEmpty={[true, true]}
                    disabled={!canEditArrangement}
                    onChange={handleScheduleChange}
                  />
                ) : (
                  <Text className="demand-node-inspector__value-text">
                    {`${formatCompactDate(workflowExpectedStartAt || node?.expected_start_date)} - ${formatCompactDate(
                      workflowDueAt || node?.due_at,
                    )}`}
                  </Text>
                )}
              </div>
            </div>

            {hasTasks ? (
              <div className="demand-node-inspector__task-section">
                <div className="demand-node-inspector__task-title">{`子任务 (${selectedWorkflowNodeTasks.length})`}</div>
                <div className="demand-node-inspector__task-list">
                  {selectedWorkflowNodeTasks.map((item) => {
                    const normalizedStatus = String(item?.status || '').toUpperCase()
                    const metaText = [item.assignee_name || '-', formatCompactDate(item.deadline || item.due_at, '')]
                      .filter(Boolean)
                      .join(' · ')

                    return (
                      <div key={item.id} className="demand-node-inspector__task-item">
                        <div className="demand-node-inspector__task-main">
                          <div className="demand-node-inspector__task-name">{item.task_title || `任务 #${item.id}`}</div>
                          <div className="demand-node-inspector__task-meta">{metaText || '-'}</div>
                        </div>
                        <Tag
                          color={getNodeStatusColor(normalizedStatus)}
                          variant="outlined"
                          className="demand-node-inspector__task-tag"
                        >
                          {getTaskStatusLabel(normalizedStatus)}
                        </Tag>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </WorkflowInspector>
  )
}

export default DemandNodeInspector
