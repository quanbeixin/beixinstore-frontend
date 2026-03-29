import { CheckCircleOutlined, ClockCircleOutlined, TeamOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { WorkflowInspector } from '../../workflow'
import './demand-node-inspector.css'

const { Text } = Typography

function getNodeStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'REJECTED') return 'error'
  return 'default'
}

function DemandNodeInspector({
  node,
  canManageWorkflow = false,
  isCurrentNode = false,
  workflowActionBusy = false,
  workflowSubmitting = false,
  workflowRejecting = false,
  workflowForceCompleting = false,
  workflowReplacing = false,
  workflowHoursSubmitting = false,
  taskCollaboratorSubmitting = false,
  workflowAssignee,
  workflowAssigneeOptions = [],
  workflowDueAt,
  workflowExpectedStartAt,
  onWorkflowAssigneeChange,
  onWorkflowDueAtChange,
  onWorkflowExpectedStartAtChange,
  onAssignNode,
  canAssignSelectedWorkflowNode = false,
  onSubmitNode,
  onRejectNode,
  onForceCompleteNode,
  canForceReplaceWorkflow = false,
  onReplaceWorkflowLatest,
  nodeHoursOwnerEstimate,
  nodeHoursPersonalEstimate,
  nodeHoursActual,
  nodePlannedStartTime,
  nodePlannedEndTime,
  nodeActualStartTime,
  nodeActualEndTime,
  nodeRejectReason,
  onNodeHoursOwnerEstimateChange,
  onNodeHoursPersonalEstimateChange,
  onNodeHoursActualChange,
  onNodePlannedStartTimeChange,
  onNodePlannedEndTimeChange,
  onNodeActualStartTimeChange,
  onNodeActualEndTimeChange,
  onNodeRejectReasonChange,
  onSaveNodeHours,
  selectedWorkflowTask,
  selectedWorkflowNodeTasks = [],
  selectedWorkflowTaskCollaborators = [],
  selectedWorkflowTaskId,
  onSelectedWorkflowTaskIdChange,
  taskHoursPersonalEstimate,
  taskHoursActual,
  taskDeadline,
  onTaskHoursPersonalEstimateChange,
  onTaskHoursActualChange,
  onTaskDeadlineChange,
  onSaveTaskHours,
  taskCollaboratorUserId,
  taskCollaboratorOptions = [],
  onTaskCollaboratorUserIdChange,
  onAddTaskCollaborator,
  onRemoveTaskCollaborator,
}) {
  return (
    <WorkflowInspector
      title="节点运行面板"
      subtitle="点击流程节点后，在右侧查看当前负责人、排期、任务和执行动作。"
      empty={!node}
      emptyDescription="请选择一个流程节点，查看负责人、排期和节点动作。"
      extra={
        node ? (
          <Space size={6}>
            {isCurrentNode ? <Tag color="processing">当前节点</Tag> : null}
            <Tag color={node?.status === 'DONE' ? 'success' : node?.status === 'IN_PROGRESS' ? 'processing' : 'default'}>
              {node?.status || 'PENDING'}
            </Tag>
          </Space>
        ) : null
      }
    >
      {node ? (
        <div className="demand-node-inspector">
          <div className="demand-node-inspector__summary-card">
            <div className="demand-node-inspector__summary-head">
              <div>
                <div className="demand-node-inspector__summary-title">
                  {node.node_name_snapshot || node.phase_name || node.node_key || '-'}
                </div>
                <div className="demand-node-inspector__summary-key">{node.node_key || '-'}</div>
              </div>
              <div className="demand-node-inspector__summary-tags">
                <Tag color={getNodeStatusColor(node?.status)}>{node?.status || 'PENDING'}</Tag>
                {isCurrentNode ? <Tag color="processing">当前处理节点</Tag> : <Tag>非当前节点</Tag>}
              </div>
            </div>
            <div className="demand-node-inspector__summary-grid">
              <div className="demand-node-inspector__summary-item">
                <span>负责人</span>
                <strong>{node.assignee_name || '-'}</strong>
              </div>
              <div className="demand-node-inspector__summary-item">
                <span>截止日</span>
                <strong>{node.due_at || '-'}</strong>
              </div>
              <div className="demand-node-inspector__summary-item">
                <span>关联任务</span>
                <strong>{selectedWorkflowNodeTasks.length} 个</strong>
              </div>
              <div className="demand-node-inspector__summary-item">
                <span>协作人数</span>
                <strong>{selectedWorkflowTaskCollaborators.length} 人</strong>
              </div>
            </div>
          </div>

          <Descriptions column={1} size="small" bordered className="demand-node-inspector__descriptions">
            <Descriptions.Item label="节点名称">{node.node_name_snapshot || node.phase_name || node.node_key || '-'}</Descriptions.Item>
            <Descriptions.Item label="节点编码">{node.node_key || '-'}</Descriptions.Item>
            <Descriptions.Item label="负责人">{node.assignee_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="截止日">{node.due_at || '-'}</Descriptions.Item>
          </Descriptions>

          <section className="demand-node-inspector__section">
            <Divider orientation="left">负责人指派</Divider>
            {canManageWorkflow ? (
              <Space direction="vertical" className="demand-node-inspector__stack" size={10}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  value={workflowAssignee}
                  options={workflowAssigneeOptions}
                  placeholder="选择节点负责人"
                  disabled={!canAssignSelectedWorkflowNode}
                  onChange={onWorkflowAssigneeChange}
                />
                <div className="demand-node-inspector__date-grid">
                  <DatePicker
                    value={workflowDueAt}
                    format="YYYY-MM-DD"
                    placeholder="节点截止日（可选）"
                    disabled={!canAssignSelectedWorkflowNode}
                    onChange={onWorkflowDueAtChange}
                    className="demand-node-inspector__control"
                  />
                  <DatePicker
                    value={workflowExpectedStartAt}
                    format="YYYY-MM-DD"
                    placeholder="预计开始日"
                    disabled={!canAssignSelectedWorkflowNode}
                    onChange={onWorkflowExpectedStartAtChange}
                    className="demand-node-inspector__control"
                  />
                </div>
                <Button
                  type="primary"
                  icon={<TeamOutlined />}
                  loading={workflowSubmitting}
                  disabled={!canAssignSelectedWorkflowNode || workflowActionBusy}
                  onClick={onAssignNode}
                  block
                >
                  {isCurrentNode ? '指派当前节点' : '预指派节点'}
                </Button>
              </Space>
            ) : (
              <Alert type="info" showIcon title="当前账号无流程管理权限" />
            )}
          </section>

          <section className="demand-node-inspector__section">
            <Divider orientation="left">节点排期与工时</Divider>
            {canManageWorkflow ? (
              <Space direction="vertical" className="demand-node-inspector__stack" size={10}>
                <InputNumber
                  min={0}
                  step={0.5}
                  precision={2}
                  className="demand-node-inspector__control"
                  value={nodeHoursOwnerEstimate}
                  onChange={onNodeHoursOwnerEstimateChange}
                  addonBefore="Owner预估(h)"
                />
                <InputNumber
                  min={0}
                  step={0.5}
                  precision={2}
                  className="demand-node-inspector__control"
                  value={nodeHoursPersonalEstimate}
                  onChange={onNodeHoursPersonalEstimateChange}
                  addonBefore="个人预估(h)"
                />
                <InputNumber
                  min={0}
                  step={0.5}
                  precision={2}
                  className="demand-node-inspector__control"
                  value={nodeHoursActual}
                  onChange={onNodeHoursActualChange}
                  addonBefore="实际工时(h)"
                />
                <div className="demand-node-inspector__date-grid">
                  <DatePicker
                    showTime
                    className="demand-node-inspector__control"
                    format="YYYY-MM-DD HH:mm:ss"
                    value={nodePlannedStartTime}
                    placeholder="计划开始"
                    onChange={onNodePlannedStartTimeChange}
                  />
                  <DatePicker
                    showTime
                    className="demand-node-inspector__control"
                    format="YYYY-MM-DD HH:mm:ss"
                    value={nodePlannedEndTime}
                    placeholder="计划结束"
                    onChange={onNodePlannedEndTimeChange}
                  />
                  <DatePicker
                    showTime
                    className="demand-node-inspector__control"
                    format="YYYY-MM-DD HH:mm:ss"
                    value={nodeActualStartTime}
                    placeholder="实际开始"
                    onChange={onNodeActualStartTimeChange}
                  />
                  <DatePicker
                    showTime
                    className="demand-node-inspector__control"
                    format="YYYY-MM-DD HH:mm:ss"
                    value={nodeActualEndTime}
                    placeholder="实际结束"
                    onChange={onNodeActualEndTimeChange}
                  />
                </div>
                <Input.TextArea
                  rows={3}
                  maxLength={2000}
                  value={nodeRejectReason}
                  onChange={(event) => onNodeRejectReasonChange?.(event.target.value)}
                  placeholder="驳回原因（驳回当前节点时必填）"
                />
                <Button
                  loading={workflowHoursSubmitting}
                  type="primary"
                  ghost
                  icon={<ClockCircleOutlined />}
                  onClick={onSaveNodeHours}
                  block
                >
                  保存节点排期与工时
                </Button>
              </Space>
            ) : (
              <Alert type="info" showIcon title="当前账号无节点工时维护权限" />
            )}
          </section>

          <section className="demand-node-inspector__section">
            <Divider orientation="left">任务与协作</Divider>
            {selectedWorkflowNodeTasks.length > 0 ? (
              <Space direction="vertical" className="demand-node-inspector__stack" size={10}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={selectedWorkflowTask ? Number(selectedWorkflowTaskId) : undefined}
                  options={selectedWorkflowNodeTasks.map((item) => ({
                    value: Number(item.id),
                    label: `${item.task_title || `任务#${item.id}`} (${item.assignee_name || '-'})`,
                  }))}
                  placeholder="选择任务"
                  onChange={onSelectedWorkflowTaskIdChange}
                />
                {selectedWorkflowTask ? (
                  <>
                    <div className="demand-node-inspector__task-card">
                      <Text strong>{selectedWorkflowTask.task_title || `任务 #${selectedWorkflowTask.id}`}</Text>
                      <Text type="secondary">
                        执行人：{selectedWorkflowTask.assignee_name || '-'}
                      </Text>
                    </div>
                    <InputNumber
                      min={0}
                      step={0.5}
                      precision={2}
                      className="demand-node-inspector__control"
                      value={taskHoursPersonalEstimate}
                      onChange={onTaskHoursPersonalEstimateChange}
                      addonBefore="个人预估(h)"
                    />
                    <InputNumber
                      min={0}
                      step={0.5}
                      precision={2}
                      className="demand-node-inspector__control"
                      value={taskHoursActual}
                      onChange={onTaskHoursActualChange}
                      addonBefore="实际工时(h)"
                    />
                    <DatePicker
                      showTime
                      className="demand-node-inspector__control"
                      format="YYYY-MM-DD HH:mm:ss"
                      value={taskDeadline}
                      placeholder="任务截止时间"
                      onChange={onTaskDeadlineChange}
                    />
                    <Space.Compact className="demand-node-inspector__compact">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        className="demand-node-inspector__control"
                        value={taskCollaboratorUserId}
                        options={taskCollaboratorOptions}
                        placeholder="添加协作人"
                        disabled={taskCollaboratorSubmitting}
                        onChange={onTaskCollaboratorUserIdChange}
                      />
                      <Button
                        loading={taskCollaboratorSubmitting}
                        disabled={taskCollaboratorSubmitting}
                        onClick={onAddTaskCollaborator}
                      >
                        添加
                      </Button>
                    </Space.Compact>
                    {selectedWorkflowTaskCollaborators.length > 0 ? (
                      <div className="demand-node-inspector__collaborators">
                        {selectedWorkflowTaskCollaborators.map((item) => (
                          <Tag key={item.user_id} className="demand-node-inspector__collaborator-tag">
                            <Space size={4}>
                              <span>{item.user_name || item.username || `用户${item.user_id}`}</span>
                              {canManageWorkflow ? (
                                <Popconfirm
                                  title="确认移除协作人？"
                                  okText="移除"
                                  cancelText="取消"
                                  onConfirm={() => onRemoveTaskCollaborator?.(item.user_id)}
                                >
                                  <Button type="link" danger size="small" className="demand-node-inspector__remove-link">
                                    移除
                                  </Button>
                                </Popconfirm>
                              ) : null}
                            </Space>
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协作人" />
                    )}
                    <Button
                      loading={workflowHoursSubmitting}
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={onSaveTaskHours}
                      block
                    >
                      保存任务信息
                    </Button>
                  </>
                ) : null}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点暂无任务" />
            )}
          </section>

          <section className="demand-node-inspector__section">
            <Divider orientation="left">节点动作</Divider>
            {canManageWorkflow ? (
              <Space direction="vertical" className="demand-node-inspector__stack" size={10}>
                <Button
                  type="primary"
                  loading={workflowSubmitting}
                  disabled={!isCurrentNode || workflowActionBusy}
                  onClick={onSubmitNode}
                  block
                >
                  提交当前节点
                </Button>
                <Popconfirm
                  title="驳回当前节点"
                  description="驳回后流程将回退到上一节点，并要求重新推进。"
                  okText="确认驳回"
                  cancelText="取消"
                  onConfirm={onRejectNode}
                  okButtonProps={{ danger: true, loading: workflowRejecting }}
                  disabled={!isCurrentNode || workflowActionBusy}
                >
                  <Button danger loading={workflowRejecting} disabled={!isCurrentNode || workflowActionBusy} block>
                    驳回当前节点
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="强制完成当前节点"
                  description="将跳过负责人校验，直接推进到下一节点。"
                  okText="确认强制完成"
                  cancelText="取消"
                  onConfirm={onForceCompleteNode}
                  okButtonProps={{ loading: workflowForceCompleting }}
                  disabled={!isCurrentNode || workflowActionBusy}
                >
                  <Button loading={workflowForceCompleting} disabled={!isCurrentNode || workflowActionBusy} block>
                    强制完成当前节点
                  </Button>
                </Popconfirm>
                {canForceReplaceWorkflow ? (
                  <Popconfirm
                    title="强制替换为最新流程模板"
                    description="将终止当前流程并重建为最新模板，请谨慎操作。"
                    okText="确认替换"
                    cancelText="取消"
                    onConfirm={onReplaceWorkflowLatest}
                    okButtonProps={{ danger: true, loading: workflowReplacing }}
                    disabled={workflowActionBusy}
                  >
                    <Button danger loading={workflowReplacing} disabled={workflowActionBusy} block>
                      强制替换最新流程
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ) : (
              <Alert type="info" showIcon title="当前账号无流程动作权限" />
            )}
          </section>
        </div>
      ) : null}
    </WorkflowInspector>
  )
}

export default DemandNodeInspector
