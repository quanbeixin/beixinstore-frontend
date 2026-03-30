import { Button, DatePicker, InputNumber, Select, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
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

function getTaskSourceText(item) {
  const sourceType = String(item?.source_type || '').trim().toUpperCase()
  const taskSource = String(item?.task_source || '').trim().toUpperCase()
  if (sourceType === 'MANUAL_LOG') {
    if (taskSource === 'OWNER_ASSIGN') return '工作台指派事项'
    return '工作台事项'
  }
  return '流程子任务'
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

function calcStageTotalEstimatedHours(tasks = []) {
  const total = (tasks || []).reduce((sum, item) => {
    const hours = Number(item?.personal_estimated_hours)
    if (!Number.isFinite(hours) || hours < 0) return sum
    return sum + hours
  }, 0)
  return Number(total.toFixed(2))
}

function createTaskDraft(item) {
  return {
    expected_start_date: formatCompactDate(item?.expected_start_date || item?.planned_start_time, ''),
    expected_completion_date: formatCompactDate(item?.expected_completion_date || item?.due_at || item?.deadline, ''),
    personal_estimated_hours:
      item?.personal_estimated_hours === null || item?.personal_estimated_hours === undefined
        ? null
        : Number(item.personal_estimated_hours),
  }
}

function normalizeDraftValue(draft) {
  const expectedStartDate = String(draft?.expected_start_date || '').trim()
  const expectedCompletionDate = String(draft?.expected_completion_date || '').trim()
  const rawHours = draft?.personal_estimated_hours
  let estimatedHours = null
  if (rawHours !== null && rawHours !== undefined && rawHours !== '') {
    const num = Number(rawHours)
    estimatedHours = Number.isFinite(num) ? Number(num.toFixed(2)) : null
  }
  return {
    expected_start_date: expectedStartDate,
    expected_completion_date: expectedCompletionDate,
    personal_estimated_hours: estimatedHours,
  }
}

function isTaskDraftDirty(baseDraft, currentDraft) {
  const base = normalizeDraftValue(baseDraft)
  const current = normalizeDraftValue(currentDraft)
  return (
    base.expected_start_date !== current.expected_start_date ||
    base.expected_completion_date !== current.expected_completion_date ||
    base.personal_estimated_hours !== current.personal_estimated_hours
  )
}

function DemandNodeInspector({
  node,
  canManageWorkflow = false,
  isCurrentNode = false,
  workflowActionBusy = false,
  workflowSubmitting = false,
  workflowParticipantUserIds = [],
  workflowAssigneeOptions = [],
  workflowDueAt,
  workflowExpectedStartAt,
  onWorkflowParticipantsChange,
  onWorkflowDueAtChange,
  onWorkflowExpectedStartAtChange,
  onCommitWorkflowArrangement,
  canAssignSelectedWorkflowNode = false,
  onSubmitNode,
  selectedWorkflowNodeTasks = [],
  workflowTaskUpdatingId = null,
  onUpdateWorkflowTask,
}) {
  const summaryTitle = getDemandWorkflowNodeDisplayName(node)
  const normalizedNodeStatus = String(node?.status || '').toUpperCase()
  const stageTotalEstimatedHours = calcStageTotalEstimatedHours(selectedWorkflowNodeTasks)
  const participantNames = Array.from(
    new Set(
      (selectedWorkflowNodeTasks || [])
        .map((item) => item?.assignee_name || item?.assignee_username || '')
        .filter(Boolean),
    ),
  )
  const scheduleValue =
    workflowExpectedStartAt || workflowDueAt ? [workflowExpectedStartAt || null, workflowDueAt || null] : null
  const canEditArrangement = canManageWorkflow && canAssignSelectedWorkflowNode && !workflowSubmitting
  const canEditNodeSchedule = canManageWorkflow && !workflowSubmitting
  const canEditTaskDetails =
    canManageWorkflow && isCurrentNode && canAssignSelectedWorkflowNode && !workflowActionBusy && !workflowSubmitting
  const hasTasks = selectedWorkflowNodeTasks.length > 0
  const [taskDrafts, setTaskDrafts] = useState({})

  const handleParticipantsChange = (value) => {
    const nextUserIds = Array.isArray(value) ? value : []
    onWorkflowParticipantsChange?.(nextUserIds)
    onCommitWorkflowArrangement?.({
      assignee_user_ids: nextUserIds,
    })
  }

  const handleScheduleChange = (dates) => {
    const previousStartAt = workflowExpectedStartAt
    const previousEndAt = workflowDueAt
    const [nextStartAt, nextEndAt] = Array.isArray(dates) ? dates : [null, null]
    onWorkflowExpectedStartAtChange?.(nextStartAt)
    onWorkflowDueAtChange?.(nextEndAt)
    Promise.resolve(
      onCommitWorkflowArrangement?.({
        planned_start_time: nextStartAt,
        planned_end_time: nextEndAt,
      }),
    ).then((saved) => {
      if (saved === false) {
        onWorkflowExpectedStartAtChange?.(previousStartAt)
        onWorkflowDueAtChange?.(previousEndAt)
      }
    })
  }

  const updateTaskDraft = (taskId, patch) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev?.[taskId] || {}),
        ...patch,
      },
    }))
  }

  const clearTaskDraft = (taskId) => {
    setTaskDrafts((prev) => {
      if (!prev || prev[taskId] === undefined) return prev
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }

  const handleSaveTask = async (task) => {
    const taskId = Number(task?.id)
    if (!Number.isInteger(taskId) || taskId <= 0) return
    const baseDraft = createTaskDraft(task)
    const draft = taskDrafts?.[taskId] || baseDraft
    if (!isTaskDraftDirty(baseDraft, draft)) return
    const payload = {
      personal_estimated_hours:
        draft.personal_estimated_hours === null || draft.personal_estimated_hours === undefined
          ? undefined
          : Number(draft.personal_estimated_hours),
      expected_start_date: draft.expected_start_date || undefined,
      expected_completion_date: draft.expected_completion_date || undefined,
      deadline: draft.expected_completion_date || undefined,
    }
    const saved = await onUpdateWorkflowTask?.(taskId, payload)
    if (saved) {
      clearTaskDraft(taskId)
    }
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
                <span className="demand-node-inspector__label">参与人</span>
                {canManageWorkflow ? (
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    value={workflowParticipantUserIds}
                    options={workflowAssigneeOptions}
                    placeholder="选择参与人"
                    disabled={!canEditArrangement}
                    onChange={handleParticipantsChange}
                  />
                ) : (
                  <Text className="demand-node-inspector__value-text">
                    {participantNames.length ? participantNames.join('、') : node.assignee_name || '-'}
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
                    disabled={!canEditNodeSchedule}
                    onChange={handleScheduleChange}
                  />
                ) : (
                  <Text className="demand-node-inspector__value-text">
                    {`${formatCompactDate(workflowExpectedStartAt || node?.planned_start_time)} - ${formatCompactDate(
                      workflowDueAt || node?.planned_end_time,
                    )}`}
                  </Text>
                )}
              </div>

              <div className="demand-node-inspector__info-cell">
                <span className="demand-node-inspector__label">阶段整体用时</span>
                <Text className="demand-node-inspector__value-text">{formatHours(stageTotalEstimatedHours)}</Text>
              </div>
            </div>

            {hasTasks ? (
              <div className="demand-node-inspector__task-section">
                <div className="demand-node-inspector__task-title">{`子任务 (${selectedWorkflowNodeTasks.length})`}</div>
                <div className="demand-node-inspector__task-list">
                  {selectedWorkflowNodeTasks.map((item) => {
                    const normalizedStatus = String(item?.status || '').toUpperCase()
                    const metaText = [item.assignee_name || '-', getTaskSourceText(item)].filter(Boolean).join(' · ')
                    const taskId = Number(item?.id)
                    const baseTaskDraft = createTaskDraft(item)
                    const taskDraft = taskDrafts?.[taskId] || baseTaskDraft
                    const taskRangeValue = [
                      taskDraft.expected_start_date ? dayjs(taskDraft.expected_start_date) : null,
                      taskDraft.expected_completion_date ? dayjs(taskDraft.expected_completion_date) : null,
                    ]
                    const taskStartDate = formatCompactDate(
                      taskDraft.expected_start_date ||
                        item?.expected_start_date ||
                        item?.planned_start_time ||
                        workflowExpectedStartAt ||
                        node?.expected_start_date,
                      '-',
                    )
                    const taskEndDate = formatCompactDate(
                      taskDraft.expected_completion_date ||
                        item?.expected_completion_date ||
                        item?.due_at ||
                        item?.deadline ||
                        workflowDueAt ||
                        node?.due_at,
                      '-',
                    )
                    const taskEstimatedHours = formatHours(taskDraft.personal_estimated_hours)
                    const isTaskUpdating = Number(workflowTaskUpdatingId) === taskId
                    const isTaskClosed = normalizedStatus === 'DONE' || normalizedStatus === 'CANCELLED'
                    const isTaskDirty = isTaskDraftDirty(baseTaskDraft, taskDraft)
                    const isManualLogTask = String(item?.source_type || '').trim().toUpperCase() === 'MANUAL_LOG'
                    const canEditCurrentTask = canEditTaskDetails && !isTaskUpdating && !isTaskClosed && !isManualLogTask
                    const canSaveCurrentTask = canEditCurrentTask && isTaskDirty

                    return (
                      <div key={String(item.id)} className="demand-node-inspector__task-item">
                        <div className="demand-node-inspector__task-main">
                          <div className="demand-node-inspector__task-name">{item.task_title || `任务 #${item.id}`}</div>
                          <div className="demand-node-inspector__task-meta">{metaText || '-'}</div>
                          <div
                            className={`demand-node-inspector__task-aux${canManageWorkflow ? ' demand-node-inspector__task-aux--editable' : ''}`}
                          >
                            <span className="demand-node-inspector__task-aux-text">{`排期 ${taskStartDate} ~ ${taskEndDate}`}</span>
                            <span className="demand-node-inspector__task-aux-text">{`预估 ${taskEstimatedHours}`}</span>
                            {canManageWorkflow ? (
                              <>
                                <span className="demand-node-inspector__task-aux-divider">|</span>
                                <RangePicker
                                  size="small"
                                  value={taskRangeValue}
                                  format="YYYY-MM-DD"
                                  allowEmpty={[true, true]}
                                  disabled={!canEditCurrentTask}
                                  onChange={(dates) => {
                                    const [nextStartAt, nextEndAt] = Array.isArray(dates) ? dates : [null, null]
                                    updateTaskDraft(taskId, {
                                      expected_start_date: nextStartAt ? nextStartAt.format('YYYY-MM-DD') : '',
                                      expected_completion_date: nextEndAt ? nextEndAt.format('YYYY-MM-DD') : '',
                                    })
                                  }}
                                />
                                <InputNumber
                                  size="small"
                                  min={0}
                                  step={0.5}
                                  precision={2}
                                  value={taskDraft.personal_estimated_hours}
                                  placeholder="预估h"
                                  disabled={!canEditCurrentTask}
                                  onChange={(value) =>
                                    updateTaskDraft(taskId, {
                                      personal_estimated_hours:
                                        value === null || value === undefined || value === '' ? null : Number(value),
                                    })
                                  }
                                />
                                <Button
                                  size="small"
                                  type="text"
                                  className={`demand-node-inspector__task-save-btn${canSaveCurrentTask ? ' demand-node-inspector__task-save-btn--dirty' : ''}`}
                                  disabled={!canSaveCurrentTask}
                                  loading={isTaskUpdating}
                                  onClick={() => handleSaveTask(item)}
                                >
                                  保存
                                </Button>
                              </>
                            ) : null}
                          </div>
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
