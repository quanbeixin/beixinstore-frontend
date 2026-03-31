import { TEMPLATE_GRAPH_STATUS } from './projectTemplate.constants'

let NODE_COUNTER = 0
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

function nextNodeId(prefix = 'node') {
  NODE_COUNTER += 1
  return `${prefix}-${Date.now()}-${NODE_COUNTER}`
}

function normalizeNodeKey(value, fallback = '') {
  return String(value || fallback || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function normalizeParticipantRoles(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  return Array.from(
    new Set(
      list
        .map((item) =>
          String(item || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  )
}

function normalizeOwnerEstimateRequired(value, fallback = true) {
  if (value === undefined || value === null || value === '') return Boolean(fallback)
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (TRUE_LIKE_VALUES.has(normalized)) return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return Boolean(fallback)
}

function normalizeNodeConfig(nodeConfig) {
  if (Array.isArray(nodeConfig)) {
    return {
      nodes: nodeConfig,
      edges: [],
    }
  }

  if (nodeConfig && typeof nodeConfig === 'object') {
    if (Array.isArray(nodeConfig.nodes) || Array.isArray(nodeConfig.edges)) {
      return {
        nodes: Array.isArray(nodeConfig.nodes) ? nodeConfig.nodes : [],
        edges: Array.isArray(nodeConfig.edges) ? nodeConfig.edges : [],
      }
    }

    return {
      nodes: Object.entries(nodeConfig).map(([nodeKey, row], index) => ({
        node_key: nodeKey,
        ...(row && typeof row === 'object' ? row : {}),
        sort_order:
          row && typeof row === 'object' && Number.isFinite(Number(row.sort_order))
            ? Number(row.sort_order)
            : index + 1,
      })),
      edges: [],
    }
  }

  return {
    nodes: [],
    edges: [],
  }
}

function resequence(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((node, index) => ({
      ...node,
      order: index + 1,
    }))
}

function buildRelationMaps(nodes, explicitEdges = null) {
  const list = resequence(nodes)
  const nodeKeySet = new Set(list.map((node) => normalizeNodeKey(node?.key)))
  const incomingMap = new Map()
  const outgoingMap = new Map()

  if (Array.isArray(explicitEdges)) {
    explicitEdges.forEach((edge) => {
      const from = normalizeNodeKey(edge?.from)
      const to = normalizeNodeKey(edge?.to)
      if (!from || !to || !nodeKeySet.has(from) || !nodeKeySet.has(to) || from === to) return
      if (!incomingMap.has(to)) incomingMap.set(to, [])
      if (!outgoingMap.has(from)) outgoingMap.set(from, [])
      incomingMap.get(to).push(from)
      outgoingMap.get(from).push(to)
    })
  } else {
    list.forEach((node) => {
      const targetKey = normalizeNodeKey(node?.key)
      const incomingKeys = Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []
      incomingKeys.forEach((incomingKeyRaw) => {
        const incomingKey = normalizeNodeKey(incomingKeyRaw)
        if (!incomingKey || incomingKey === targetKey || !nodeKeySet.has(incomingKey)) return
        if (!incomingMap.has(targetKey)) incomingMap.set(targetKey, [])
        if (!outgoingMap.has(incomingKey)) outgoingMap.set(incomingKey, [])
        if (!incomingMap.get(targetKey).includes(incomingKey)) incomingMap.get(targetKey).push(incomingKey)
        if (!outgoingMap.get(incomingKey).includes(targetKey)) outgoingMap.get(incomingKey).push(targetKey)
      })
    })
  }

  return { incomingMap, outgoingMap }
}

function hydrateGraphNodes(nodes, explicitEdges = null) {
  const list = resequence(nodes)
  const { incomingMap, outgoingMap } = buildRelationMaps(list, explicitEdges)

  return list.map((node, index) => {
    const key = normalizeNodeKey(node?.key, `NODE_${index + 1}`)
    return {
      ...node,
      id: String(node?.id || nextNodeId('template-node')),
      key,
      title: normalizeText(node?.title, `新节点${index + 1}`),
      type: normalizeText(node?.type, 'EXECUTE').toUpperCase(),
      phaseKey: normalizeText(node?.phaseKey, 'develop'),
      order: Number(index + 1),
      status: String(node?.status || TEMPLATE_GRAPH_STATUS.DRAFT),
      children: Array.isArray(node?.children) ? node.children : [],
      meta: {
        description: normalizeText(node?.meta?.description, ''),
        incomingKeys: incomingMap.get(key) || [],
        outgoingKeys: outgoingMap.get(key) || [],
        participantRoles: normalizeParticipantRoles(node?.meta?.participantRoles),
        ownerEstimateRequired: normalizeOwnerEstimateRequired(
          node?.meta?.ownerEstimateRequired ?? node?.meta?.owner_estimate_required,
          true,
        ),
      },
    }
  })
}

function buildEdgesFromNodes(nodes) {
  const list = hydrateGraphNodes(nodes)
  return list.flatMap((node) =>
    (Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []).map((incomingKey) => ({
      from: normalizeNodeKey(incomingKey),
      to: normalizeNodeKey(node.key),
    })),
  )
}

function detectCycle(nodes) {
  const list = hydrateGraphNodes(nodes)
  const state = new Map()
  const nodeMap = new Map(list.map((node) => [node.key, node]))

  const dfs = (nodeKey) => {
    const currentState = state.get(nodeKey)
    if (currentState === 1) return true
    if (currentState === 2) return false

    state.set(nodeKey, 1)
    const node = nodeMap.get(nodeKey)
    const outgoingKeys = Array.isArray(node?.meta?.outgoingKeys) ? node.meta.outgoingKeys : []
    for (const nextKey of outgoingKeys) {
      if (dfs(nextKey)) return true
    }
    state.set(nodeKey, 2)
    return false
  }

  for (const node of list) {
    if (dfs(node.key)) return true
  }
  return false
}

export function createEmptyGraphNode(partial = {}) {
  const order = Number.isFinite(Number(partial.order)) ? Number(partial.order) : 1
  const fallbackKey = partial.title ? normalizeNodeKey(partial.title) : `NODE_${order}`

  return {
    id: String(partial.id || nextNodeId('template-node')),
    key: normalizeNodeKey(partial.key, fallbackKey),
    title: normalizeText(partial.title, `新节点${order}`),
    type: normalizeText(partial.type, 'EXECUTE').toUpperCase(),
    phaseKey: normalizeText(partial.phaseKey, 'develop'),
    order,
    status: String(partial.status || TEMPLATE_GRAPH_STATUS.DRAFT),
    children: Array.isArray(partial.children) ? partial.children : [],
      meta: {
        description: normalizeText(partial?.meta?.description, ''),
        incomingKeys: Array.isArray(partial?.meta?.incomingKeys) ? partial.meta.incomingKeys : [],
        outgoingKeys: Array.isArray(partial?.meta?.outgoingKeys) ? partial.meta.outgoingKeys : [],
        participantRoles: normalizeParticipantRoles(
          partial?.meta?.participantRoles || partial?.meta?.participant_roles,
        ),
        ownerEstimateRequired: normalizeOwnerEstimateRequired(
          partial?.meta?.ownerEstimateRequired ?? partial?.meta?.owner_estimate_required,
          true,
        ),
      },
    }
}

export function mapTemplateNodeConfigToGraphNodes(nodeConfig) {
  const { nodes: rawNodes, edges } = normalizeNodeConfig(nodeConfig)

  const mappedNodes = (Array.isArray(rawNodes) ? rawNodes : []).map((row, index) =>
    createEmptyGraphNode({
      id: nextNodeId(normalizeNodeKey(row?.node_key || `NODE_${index + 1}`).toLowerCase()),
      key: row?.node_key || row?.key || `NODE_${index + 1}`,
      title: row?.node_name || row?.name || row?.title || `节点${index + 1}`,
      type: row?.node_type || 'EXECUTE',
      phaseKey: row?.phase_key || 'develop',
      order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : index + 1,
      meta: {
        description: row?.description,
        participantRoles: row?.participant_roles || row?.participantRoles,
        ownerEstimateRequired: row?.owner_estimate_required ?? row?.ownerEstimateRequired,
      },
    }),
  )

  return hydrateGraphNodes(mappedNodes, edges)
}

export function mapGraphNodesToTemplateNodeConfig(nodes) {
  const list = hydrateGraphNodes(nodes)
  return {
    schema_version: 2,
    entry_node_key: normalizeNodeKey(list.find((node) => (node?.meta?.incomingKeys || []).length === 0)?.key || list[0]?.key || ''),
    nodes: list.map((node, index) => ({
      node_key: normalizeNodeKey(node?.key, `NODE_${index + 1}`),
      node_name: normalizeText(node?.title, `节点${index + 1}`),
      node_type: normalizeText(node?.type, 'EXECUTE').toUpperCase(),
      phase_key: normalizeText(node?.phaseKey, 'develop'),
      sort_order: index + 1,
      participant_roles: normalizeParticipantRoles(node?.meta?.participantRoles),
      owner_estimate_required: normalizeOwnerEstimateRequired(node?.meta?.ownerEstimateRequired, true),
      ...(normalizeText(node?.meta?.description, '') ? { description: normalizeText(node.meta.description, '') } : {}),
    })),
    edges: buildEdgesFromNodes(list),
  }
}

export function moveGraphNode(nodes, nodeId, nextOrder) {
  const currentIndex = nodes.findIndex((item) => item.id === nodeId)
  if (currentIndex < 0) return hydrateGraphNodes(nodes)
  const targetIndex = Math.max(0, Math.min(nodes.length - 1, Number(nextOrder || 1) - 1))
  const next = [...resequence(nodes)]
  const [moved] = next.splice(currentIndex, 1)
  next.splice(targetIndex, 0, moved)
  return hydrateGraphNodes(next)
}

export function upsertGraphNode(nodes, nodeId, patch) {
  return hydrateGraphNodes(
    nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            ...patch,
            meta: {
              ...(node.meta || {}),
              ...(patch?.meta || {}),
            },
          }
        : node,
    ),
  )
}

export function duplicateGraphNode(nodes, nodeId) {
  const next = resequence(nodes)
  const index = next.findIndex((item) => item.id === nodeId)
  if (index < 0) return hydrateGraphNodes(next)
  const source = next[index]
  const copy = createEmptyGraphNode({
    key: `${normalizeNodeKey(source.key || 'NODE')}_COPY`,
    title: `${source.title || '节点'}复制`,
    type: source.type,
    phaseKey: source.phaseKey,
    order: index + 2,
    meta: {
      description: source?.meta?.description,
      incomingKeys: source?.meta?.incomingKeys || [],
      participantRoles: source?.meta?.participantRoles || [],
      ownerEstimateRequired: source?.meta?.ownerEstimateRequired,
    },
  })
  next.splice(index + 1, 0, copy)
  return hydrateGraphNodes(next)
}

export function insertGraphNode(nodes, { afterId = null, beforeId = null, partial = {} } = {}) {
  const next = resequence(nodes)
  let insertIndex = next.length
  let defaultIncomingKeys = []

  if (afterId) {
    const index = next.findIndex((item) => item.id === afterId)
    insertIndex = index >= 0 ? index + 1 : next.length
    const afterNode = index >= 0 ? next[index] : null
    defaultIncomingKeys = afterNode?.key ? [afterNode.key] : []
  }

  if (beforeId) {
    const index = next.findIndex((item) => item.id === beforeId)
    insertIndex = index >= 0 ? index : next.length
  }

  const node = createEmptyGraphNode({
    order: insertIndex + 1,
    meta: {
      incomingKeys: defaultIncomingKeys,
      ...(partial?.meta || {}),
    },
    ...partial,
  })

  next.splice(insertIndex, 0, node)
  return {
    nodes: hydrateGraphNodes(next),
    insertedNodeId: node.id,
  }
}

export function insertParallelGroup(nodes, { afterId = null, beforeId = null } = {}) {
  const next = resequence(nodes)
  const sourceNode =
    next.find((item) => item.id === afterId) ||
    next.find((item) => item.id === beforeId) ||
    next[next.length - 1] ||
    null
  const sourceKey = sourceNode?.key ? normalizeNodeKey(sourceNode.key) : ''

  const firstBranch = createEmptyGraphNode({
    title: '并行分支 A',
    phaseKey: 'develop',
    meta: {
      incomingKeys: sourceKey ? [sourceKey] : [],
    },
  })

  const secondBranch = createEmptyGraphNode({
    title: '并行分支 B',
    phaseKey: 'develop',
    meta: {
      incomingKeys: sourceKey ? [sourceKey] : [],
    },
  })

  const { nodes: withFirst, insertedNodeId } = insertGraphNode(next, { afterId, beforeId, partial: firstBranch })
  const { nodes: withSecond } = insertGraphNode(withFirst, { afterId: insertedNodeId, partial: secondBranch })

  return {
    nodes: hydrateGraphNodes(withSecond),
    insertedNodeId,
  }
}

export function removeGraphNode(nodes, nodeId) {
  const removedNode = nodes.find((node) => node.id === nodeId)
  const removedKey = normalizeNodeKey(removedNode?.key)

  return hydrateGraphNodes(
    nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => ({
        ...node,
        meta: {
          ...(node.meta || {}),
          incomingKeys: (Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []).filter(
            (incomingKey) => normalizeNodeKey(incomingKey) !== removedKey,
          ),
        },
      })),
  )
}

export function validateGraphNodes(nodes) {
  const list = hydrateGraphNodes(nodes)
  if (list.length === 0) {
    return '至少需要保留 1 个流程节点'
  }

  const usedKeys = new Set()
  const keySet = new Set(list.map((node) => normalizeNodeKey(node?.key)))

  for (const node of list) {
    const key = normalizeNodeKey(node?.key)
    const title = normalizeText(node?.title, '')
    const incomingKeys = Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []

    if (!title) return '节点名称不能为空'
    if (!key) return '节点编码不能为空'
    if (usedKeys.has(key)) return `节点编码重复：${key}`
    usedKeys.add(key)

    for (const incomingKeyRaw of incomingKeys) {
      const incomingKey = normalizeNodeKey(incomingKeyRaw)
      if (!incomingKey) continue
      if (incomingKey === key) return `节点 ${title} 的前置节点不能是自己`
      if (!keySet.has(incomingKey)) return `节点 ${title} 的前置节点不存在：${incomingKey}`
    }
  }

  if (!list.some((node) => (node?.meta?.incomingKeys || []).length === 0)) {
    return '至少需要一个开始节点，请保留一个无前置节点的节点'
  }

  if (!list.some((node) => (node?.meta?.outgoingKeys || []).length === 0)) {
    return '至少需要一个结束节点，请保留一个无后置节点的节点'
  }

  if (detectCycle(list)) {
    return '节点流转存在循环依赖，请调整前置节点关系'
  }

  return ''
}
