import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Space, Tag, Tooltip } from 'antd'

function getStatusColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'REJECTED') return 'error'
  return 'default'
}

function WorkflowNodeCard({
  node,
  index,
  total,
  selected = false,
  related = false,
  compact = false,
  editable = false,
  onSelect,
  onAddAfter,
  onMovePrev,
  onMoveNext,
  onDuplicate,
  onRemove,
}) {
  const runtimeMeta = node?.meta || {}
  const isRuntime = runtimeMeta?.source === 'runtime'
  const isTemplatePreview = !isRuntime
  const parallelGroupKey = String(runtimeMeta?.parallelGroupKey || '').trim()
  const branchKey = String(runtimeMeta?.branchKey || '').trim()
  const joinRule = String(runtimeMeta?.joinRule || '').trim()
  const cardClassName = [
    'workflow-node-card',
    selected ? 'is-selected' : '',
    related ? 'is-related' : '',
    runtimeMeta?.isCurrent ? 'is-current' : '',
    String(node?.status || '').toUpperCase() === 'DONE' ? 'is-done' : '',
    parallelGroupKey ? 'is-parallel' : '',
    compact ? 'is-compact' : '',
    isTemplatePreview ? 'is-template' : 'is-runtime',
  ]
    .filter(Boolean)
    .join(' ')

  if (compact || isTemplatePreview) {
    const incomingCount = Array.isArray(runtimeMeta?.incomingKeys) ? runtimeMeta.incomingKeys.length : 0
    const compactDotClassName = [
      'workflow-node-card__compact-dot',
      selected ? 'is-selected' : '',
      runtimeMeta?.isCurrent || String(node?.status || '').toUpperCase() === 'IN_PROGRESS' ? 'is-active' : '',
      String(node?.status || '').toUpperCase() === 'DONE' || (!isRuntime && incomingCount === 0) ? 'is-done' : '',
      related ? 'is-related' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        role="button"
        tabIndex={0}
        className={cardClassName}
        onClick={() => onSelect?.(node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect?.(node.id)
          }
        }}
      >
        <span className={compactDotClassName} />
        <div className="workflow-node-card__template-title">{node.title || '未命名节点'}</div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cardClassName}
      onClick={() => onSelect?.(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.(node.id)
        }
      }}
    >
      <div className="workflow-node-card__header">
        <span className="workflow-node-card__index">{index + 1}</span>
        <div className="workflow-node-card__meta">
          {isRuntime && runtimeMeta?.isCurrent ? (
            <Tag color="cyan" variant="filled">
              当前
            </Tag>
          ) : null}
          {isRuntime ? (
            <Tag color={getStatusColor(node.status)} variant="filled">
              {node.status || 'PENDING'}
            </Tag>
          ) : null}
          <Tag color="processing" variant="filled">
            {node.type || 'EXECUTE'}
          </Tag>
          <Tag variant="filled">{node.phaseKey || 'develop'}</Tag>
          {parallelGroupKey ? (
            <Tag color="gold" variant="filled">
              并行组
            </Tag>
          ) : null}
        </div>
      </div>
      <div className="workflow-node-card__body">
        <div className="workflow-node-card__title-row">
          <span className="workflow-node-card__dot" />
          <div className="workflow-node-card__title-block">
            <div className="workflow-node-card__title">{node.title || '未命名节点'}</div>
            <div className="workflow-node-card__key">{node.key || '-'}</div>
          </div>
        </div>
        <div className="workflow-node-card__summary">
          <span>{runtimeMeta?.assigneeName || '未指派负责人'}</span>
          <span>{runtimeMeta?.taskCount ? `${runtimeMeta.taskCount} 个任务` : '暂无任务'}</span>
          <span>{runtimeMeta?.dueAt ? `截止 ${runtimeMeta.dueAt}` : '未设置截止日'}</span>
          {parallelGroupKey ? <span>并行组：{parallelGroupKey}</span> : null}
          {branchKey ? <span>分支：{branchKey}</span> : null}
          {joinRule ? <span>汇合规则：{joinRule}</span> : null}
        </div>
      </div>
      <div className="workflow-node-card__footer">
        <span>{editable ? '点击编辑节点属性' : '只读预览'}</span>
        {Array.isArray(node.children) && node.children.length > 0 ? (
          <Tag color="gold" variant="filled">
            分支 {node.children.length}
          </Tag>
        ) : null}
      </div>
      {editable ? (
        <div
          className="workflow-node-card__actions"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <Space size={4} wrap>
            <Tooltip title="前移">
              <Button
                size="small"
                icon={<ArrowLeftOutlined />}
                disabled={index === 0}
                onClick={() => onMovePrev?.(node.id)}
              />
            </Tooltip>
            <Tooltip title="后移">
              <Button
                size="small"
                icon={<ArrowRightOutlined />}
                disabled={index === total - 1}
                onClick={() => onMoveNext?.(node.id)}
              />
            </Tooltip>
            <Tooltip title="复制节点">
              <Button size="small" icon={<CopyOutlined />} onClick={() => onDuplicate?.(node.id)} />
            </Tooltip>
            <Tooltip title="新增后续节点">
              <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => onAddAfter?.(node.id)} />
            </Tooltip>
            <Tooltip title="删除节点">
              <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onRemove?.(node.id)} />
            </Tooltip>
          </Space>
        </div>
      ) : null}
    </div>
  )
}

export default WorkflowNodeCard
