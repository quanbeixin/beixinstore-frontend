import WorkflowEmptyState from './WorkflowEmptyState'
import WorkflowNodeCard from './WorkflowNodeCard'
import WorkflowToolbar from './WorkflowToolbar'
import { buildWorkflowDagLayout } from '../utils/workflowLayout'
import '../styles/workflow-graph.css'

function buildWorkflowSegments(nodes) {
  const list = Array.isArray(nodes) ? nodes : []
  const segments = []
  const consumed = new Set()
  const nodeMap = new Map(list.map((node) => [String(node?.key || node?.id || '').trim(), node]))

  const followBranchPath = (startKey) => {
    const path = []
    let current = nodeMap.get(String(startKey || '').trim())
    const visited = new Set()

    while (current && !visited.has(current.id)) {
      visited.add(current.id)

      const incomingKeys = Array.isArray(current?.meta?.incomingKeys) ? current.meta.incomingKeys : []
      if (path.length > 0 && incomingKeys.length > 1) {
        return {
          path,
          joinNode: current,
        }
      }

      path.push(current)

      const outgoingKeys = Array.isArray(current?.meta?.outgoingKeys) ? current.meta.outgoingKeys : []
      if (outgoingKeys.length !== 1) {
        return {
          path,
          joinNode: null,
        }
      }

      const nextNode = nodeMap.get(String(outgoingKeys[0] || '').trim())
      if (!nextNode) {
        return {
          path,
          joinNode: null,
        }
      }

      const nextIncomingKeys = Array.isArray(nextNode?.meta?.incomingKeys) ? nextNode.meta.incomingKeys : []
      if (nextIncomingKeys.length > 1) {
        return {
          path,
          joinNode: nextNode,
        }
      }

      current = nextNode
    }

    return {
      path,
      joinNode: null,
    }
  }

  for (let index = 0; index < list.length; index += 1) {
    const node = list[index]
    if (!node || consumed.has(node.id)) continue

    const outgoingKeys = Array.isArray(node?.meta?.outgoingKeys) ? node.meta.outgoingKeys : []
    if (outgoingKeys.length > 1) {
      const branchResults = outgoingKeys.map((outgoingKey) => followBranchPath(outgoingKey))
      const joinNode = branchResults[0]?.joinNode || null
      const canRenderParallel =
        branchResults.length > 1 &&
        joinNode &&
        branchResults.every(
          (branch) => branch.joinNode && String(branch.joinNode.id || '') === String(joinNode.id || '') && branch.path.length > 0,
        )

      if (canRenderParallel && !consumed.has(joinNode.id)) {
        const branches = branchResults.map((branch, branchIndex) => ({
          branchKey: String.fromCharCode(65 + branchIndex),
          nodes: branch.path,
        }))

        consumed.add(node.id)
        consumed.add(joinNode.id)
        branches.forEach((branch) => {
          branch.nodes.forEach((branchNode) => consumed.add(branchNode.id))
        })

        segments.push({
          type: 'parallel',
          id: `parallel-${String(node.key || node.id || index)}`,
          splitNode: node,
          joinNode,
          branches,
        })
        continue
      }
    }

    consumed.add(node.id)
    segments.push({
      type: 'node',
      id: node.id,
      node,
    })
  }

  return segments
}

function segmentHasCurrentNode(segment) {
  if (!segment) return false
  if (segment.type === 'node') return Boolean(segment.node?.meta?.isCurrent)
  return [segment.splitNode, segment.joinNode, ...(segment.branches || []).flatMap((branch) => branch.nodes || [])].some(
    (node) => Boolean(node?.meta?.isCurrent),
  )
}

function segmentIsComplete(segment) {
  if (!segment) return false
  if (segment.type === 'node') return String(segment.node?.status || '').toUpperCase() === 'DONE'
  return [segment.splitNode, segment.joinNode, ...(segment.branches || []).flatMap((branch) => branch.nodes || [])].every(
    (node) => String(node?.status || '').toUpperCase() === 'DONE',
  )
}

function WorkflowGraph({
  nodes = [],
  selectedNodeId,
  highlightedNodeIds = [],
  editable = false,
  layoutMode = 'sequence',
  showToolbar = true,
  modeLabel,
  helperText,
  metaTags,
  onSelectNode,
  onAddNode,
  onAddAfterNode,
  onMovePrevNode,
  onMoveNextNode,
  onDuplicateNode,
  onRemoveNode,
  onAutoSort,
}) {
  const list = Array.isArray(nodes) ? nodes : []
  const indexMap = new Map(list.map((node, index) => [node.id, index]))
  const highlightedNodeIdSet = new Set(Array.isArray(highlightedNodeIds) ? highlightedNodeIds : [])
  const nodeIdToKeyMap = new Map(list.map((node) => [String(node?.id || ''), String(node?.key || node?.id || '')]))
  const keyToNodeIdMap = new Map(list.map((node) => [String(node?.key || node?.id || ''), String(node?.id || '')]))
  const selectedNodeKey = nodeIdToKeyMap.get(String(selectedNodeId || '')) || ''
  const segments = buildWorkflowSegments(list)
  const dagLayout = layoutMode === 'dag' ? buildWorkflowDagLayout(list) : null

  const renderNodeCard = (node) => (
    <WorkflowNodeCard
      node={node}
      index={indexMap.get(node.id) || 0}
      total={list.length}
      editable={editable}
      compact={layoutMode === 'dag'}
      selected={selectedNodeId === node.id}
      related={highlightedNodeIdSet.has(node.id)}
      onSelect={onSelectNode}
      onAddAfter={onAddAfterNode}
      onMovePrev={onMovePrevNode}
      onMoveNext={onMoveNextNode}
      onDuplicate={onDuplicateNode}
      onRemove={onRemoveNode}
    />
  )

  return (
    <div className="workflow-graph-shell">
      {showToolbar ? (
        <WorkflowToolbar
          editable={editable}
          nodeCount={list.length}
          modeLabel={modeLabel}
          helperText={helperText}
          metaTags={metaTags}
          onAddNode={onAddNode}
          onAutoSort={onAutoSort}
        />
      ) : null}
      {list.length === 0 ? (
        <WorkflowEmptyState />
      ) : layoutMode === 'dag' && dagLayout ? (
        <div className="workflow-graph-canvas is-dag">
          <div className="workflow-graph-auto">
            <div
              className="workflow-graph-auto__scene"
              style={{
                width: `${dagLayout.width}px`,
                height: `${dagLayout.height}px`,
              }}
            >
              <svg
                className="workflow-graph-auto__edges"
                width={dagLayout.width}
                height={dagLayout.height}
                viewBox={`0 0 ${dagLayout.width} ${dagLayout.height}`}
                aria-hidden="true"
              >
                {dagLayout.edges.map((edge) => {
                  const sourceNodeId = keyToNodeIdMap.get(edge.from) || ''
                  const targetNodeId = keyToNodeIdMap.get(edge.to) || ''
                  const isSelectedEdge = edge.to === selectedNodeKey
                  const isRelatedEdge = highlightedNodeIdSet.has(sourceNodeId) || highlightedNodeIdSet.has(targetNodeId)

                  return (
                    <path
                      key={edge.id}
                      d={edge.path}
                      className={`workflow-graph-auto__edge${isSelectedEdge ? ' is-selected' : ''}${
                        isRelatedEdge ? ' is-related' : ''
                      }`}
                    />
                  )
                })}
              </svg>
              {dagLayout.nodes.map((layoutNode) => (
                <div
                  key={layoutNode.id}
                  className="workflow-graph-auto__node"
                  style={{
                    left: `${layoutNode.x}px`,
                    top: `${layoutNode.y}px`,
                    width: `${layoutNode.width}px`,
                    height: `${layoutNode.height}px`,
                  }}
                >
                  {renderNodeCard(layoutNode.node)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="workflow-graph-canvas">
          <div className="workflow-graph-sequence">
            {segments.map((segment, index) => (
              <div className="workflow-graph-step" key={segment.id}>
                {segment.type === 'parallel' ? (
                  <div
                    className={`workflow-parallel-block${segmentHasCurrentNode(segment) ? ' is-current' : ''}${
                      segmentIsComplete(segment) ? ' is-complete' : ''
                    }`}
                  >
                    <div className="workflow-parallel-block__header">
                      <div className="workflow-parallel-block__title">并行执行区</div>
                      <div className="workflow-parallel-block__summary">
                        {segment.branches.length} 个分支同时推进
                      </div>
                    </div>
                    <div className="workflow-parallel-block__split">
                      {renderNodeCard(segment.splitNode)}
                    </div>
                    <div className="workflow-parallel-block__bus workflow-parallel-block__bus--top">
                      <span className="workflow-parallel-block__bus-label">并发分发</span>
                    </div>
                    <div className="workflow-parallel-block__branches">
                      {segment.branches.map((branch) => (
                        <div className="workflow-parallel-block__branch" key={`${segment.id}-${branch.branchKey}`}>
                          <div className="workflow-parallel-block__branch-label">分支 {branch.branchKey}</div>
                          <div className="workflow-parallel-block__branch-entry">
                            <span className="workflow-parallel-block__branch-dot" />
                          </div>
                          <div className="workflow-parallel-block__branch-stack">
                            {branch.nodes.map((branchNode) => (
                              <div key={branchNode.id} className="workflow-parallel-block__branch-node">
                                {renderNodeCard(branchNode)}
                              </div>
                            ))}
                          </div>
                          <div className="workflow-parallel-block__branch-exit">
                            <span className="workflow-parallel-block__branch-dot" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="workflow-parallel-block__bus workflow-parallel-block__bus--bottom">
                      <span className="workflow-parallel-block__bus-label">汇合等待</span>
                    </div>
                    <div className="workflow-parallel-block__join">
                      {renderNodeCard(segment.joinNode)}
                    </div>
                  </div>
                ) : (
                  renderNodeCard(segment.node)
                )}
                {index < segments.length - 1 ? (
                  <div
                    className={`workflow-graph-connector${segmentHasCurrentNode(segment) ? ' is-current' : ''}${
                      segmentIsComplete(segment) ? ' is-complete' : ''
                    }`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkflowGraph
