export function getDemandWorkflowNodeDisplayName(node) {
  const snapshotName = String(node?.node_name_snapshot || '').trim()
  if (snapshotName) return snapshotName

  const explicitNodeName = String(node?.node_name || node?.name || node?.title || '').trim()
  if (explicitNodeName) return explicitNodeName

  const nodeKey = String(node?.node_key || '').trim()
  return nodeKey || '-'
}

export function mapDemandWorkflowToGraphNodes(workflowData) {
  const nodes = Array.isArray(workflowData?.nodes) ? workflowData.nodes : []
  const tasks = Array.isArray(workflowData?.tasks) ? workflowData.tasks : []
  const currentNodeKeys = new Set(
    (Array.isArray(workflowData?.current_nodes) ? workflowData.current_nodes : [])
      .map((node) => String(node?.node_key || '').trim().toUpperCase())
      .filter(Boolean),
  )

  if (currentNodeKeys.size === 0) {
    const fallbackCurrentNodeKey = String(workflowData?.current_node?.node_key || '').trim().toUpperCase()
    if (fallbackCurrentNodeKey) currentNodeKeys.add(fallbackCurrentNodeKey)
  }

  return nodes
    .map((node, index) => {
      const nodeKey = String(node?.node_key || `NODE_${index + 1}`).trim()
      const normalizedNodeKey = nodeKey.toUpperCase()
      const taskCount = tasks.filter(
        (task) => Number(task?.instance_node_id) === Number(node?.id),
      ).length

      return {
        id: nodeKey,
        key: nodeKey,
        title: getDemandWorkflowNodeDisplayName(node),
        type: String(node?.node_type || node?.phase_key || 'EXECUTE').trim().toUpperCase(),
        phaseKey: String(node?.phase_key || 'develop').trim(),
        order: Number.isFinite(Number(node?.sort_order)) ? Number(node.sort_order) : index + 1,
        status: String(node?.status || 'PENDING').trim().toUpperCase(),
        children: [],
        meta: {
          source: 'runtime',
          isCurrent: currentNodeKeys.has(normalizedNodeKey),
          assigneeName: String(node?.assignee_name || '').trim(),
          assigneeUserId: Number(node?.assignee_user_id) || null,
          dueAt: node?.due_at || null,
          branchKey: String(node?.branch_key || '').trim() || null,
          parallelGroupKey: String(node?.parallel_group_key || '').trim() || null,
          joinRule: String(node?.join_rule || '').trim().toUpperCase() || null,
          outgoingKeys: Array.isArray(node?.outgoing_keys) ? node.outgoing_keys : [],
          incomingKeys: Array.isArray(node?.incoming_keys) ? node.incoming_keys : [],
          schedule: {
            plannedStart: node?.planned_start_time || null,
            plannedEnd: node?.planned_end_time || null,
            actualStart: node?.actual_start_time || null,
            actualEnd: node?.actual_end_time || null,
          },
          hours: {
            ownerEstimated: node?.owner_estimated_hours ?? null,
            personalEstimated: node?.personal_estimated_hours ?? null,
            actual: node?.actual_hours ?? null,
          },
          taskCount,
          raw: node,
        },
      }
    })
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
}
