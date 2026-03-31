function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeKey(value) {
  return String(value || '').trim()
}

function toOrderedList(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
}

function buildGraphMaps(nodes) {
  const ordered = toOrderedList(nodes)
  const nodeMap = new Map()
  const incomingMap = new Map()
  const outgoingMap = new Map()

  ordered.forEach((node) => {
    const key = normalizeKey(node?.key || node?.id)
    if (!key) return
    nodeMap.set(key, node)
    incomingMap.set(key, new Set())
    outgoingMap.set(key, new Set())
  })

  ordered.forEach((node) => {
    const targetKey = normalizeKey(node?.key || node?.id)
    if (!targetKey || !nodeMap.has(targetKey)) return

    const outgoingKeys = Array.isArray(node?.meta?.outgoingKeys) ? node.meta.outgoingKeys : []
    outgoingKeys.forEach((nextKeyRaw) => {
      const nextKey = normalizeKey(nextKeyRaw)
      if (!nextKey || nextKey === targetKey || !nodeMap.has(nextKey)) return
      outgoingMap.get(targetKey)?.add(nextKey)
      incomingMap.get(nextKey)?.add(targetKey)
    })

    const incomingKeys = Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []
    incomingKeys.forEach((prevKeyRaw) => {
      const prevKey = normalizeKey(prevKeyRaw)
      if (!prevKey || prevKey === targetKey || !nodeMap.has(prevKey)) return
      incomingMap.get(targetKey)?.add(prevKey)
      outgoingMap.get(prevKey)?.add(targetKey)
    })
  })

  return { ordered, nodeMap, incomingMap, outgoingMap }
}

function sortKeysByOrder(keys, nodeMap) {
  return [...keys].sort((a, b) => {
    const nodeA = nodeMap.get(a)
    const nodeB = nodeMap.get(b)
    return Number(nodeA?.order || 0) - Number(nodeB?.order || 0)
  })
}

function buildTopologicalOrder(ordered, nodeMap, incomingMap, outgoingMap) {
  const indegreeMap = new Map()
  nodeMap.forEach((_, key) => {
    indegreeMap.set(key, incomingMap.get(key)?.size || 0)
  })

  const queue = ordered
    .map((node) => normalizeKey(node?.key || node?.id))
    .filter((key) => key && indegreeMap.get(key) === 0)

  const result = []
  const visited = new Set()

  while (queue.length > 0) {
    queue.sort((a, b) => {
      const nodeA = nodeMap.get(a)
      const nodeB = nodeMap.get(b)
      return Number(nodeA?.order || 0) - Number(nodeB?.order || 0)
    })

    const currentKey = queue.shift()
    if (!currentKey || visited.has(currentKey)) continue

    visited.add(currentKey)
    result.push(currentKey)

    sortKeysByOrder(outgoingMap.get(currentKey) || [], nodeMap).forEach((nextKey) => {
      indegreeMap.set(nextKey, Math.max(0, Number(indegreeMap.get(nextKey) || 0) - 1))
      if (indegreeMap.get(nextKey) === 0) {
        queue.push(nextKey)
      }
    })
  }

  ordered.forEach((node) => {
    const key = normalizeKey(node?.key || node?.id)
    if (key && !visited.has(key)) {
      result.push(key)
    }
  })

  return result
}

function findClosestAvailableLane(preferredLane, occupiedLanes) {
  const normalizedPreferred = Number.isFinite(Number(preferredLane)) ? Number(preferredLane) : 0
  const occupied = occupiedLanes || new Set()
  if (!occupied.has(normalizedPreferred)) return normalizedPreferred

  let offset = 1
  while (offset < 1000) {
    const lower = normalizedPreferred - offset
    if (!occupied.has(lower)) return lower
    const upper = normalizedPreferred + offset
    if (!occupied.has(upper)) return upper
    offset += 1
  }

  return normalizedPreferred
}

function estimateNodeWidth(title) {
  const text = String(title || '').trim()
  const count = Math.max(text.length, 2)
  return clamp(34 + count * 14, 82, 208)
}

function buildNodePositions(topologicalOrder, nodeMap, incomingMap, outgoingMap) {
  const levelMap = new Map()
  const laneMap = new Map()
  const occupiedByLevel = new Map()
  const branchLaneMemory = new Map()
  let nextStartLane = 0

  const ensureLevelOccupancy = (level) => {
    if (!occupiedByLevel.has(level)) {
      occupiedByLevel.set(level, new Set())
    }
    return occupiedByLevel.get(level)
  }

  topologicalOrder.forEach((nodeKey) => {
    const predecessors = sortKeysByOrder(incomingMap.get(nodeKey) || [], nodeMap)
    const level = predecessors.length > 0 ? Math.max(...predecessors.map((key) => Number(levelMap.get(key) || 0))) + 1 : 0
    levelMap.set(nodeKey, level)

    let preferredLane = nextStartLane

    if (predecessors.length === 0) {
      preferredLane = nextStartLane
      nextStartLane += 1
    } else if (predecessors.length === 1) {
      const parentKey = predecessors[0]
      const parentLane = Number(laneMap.get(parentKey) || 0)
      const siblings = sortKeysByOrder(outgoingMap.get(parentKey) || [], nodeMap)

      if (siblings.length <= 1) {
        preferredLane = parentLane
      } else {
        if (!branchLaneMemory.has(parentKey)) {
          branchLaneMemory.set(parentKey, new Map())
        }

        const branchMemory = branchLaneMemory.get(parentKey)
        const siblingIndex = Math.max(0, siblings.indexOf(nodeKey))
        const offsetBase = siblingIndex - (siblings.length - 1) / 2
        const computedLane = parentLane + offsetBase
        preferredLane = branchMemory.has(nodeKey) ? branchMemory.get(nodeKey) : computedLane
        branchMemory.set(nodeKey, preferredLane)
      }
    } else {
      const averageLane =
        predecessors.reduce((sum, key) => sum + Number(laneMap.get(key) || 0), 0) / Math.max(predecessors.length, 1)
      preferredLane = Math.round(averageLane)
    }

    const occupiedLanes = ensureLevelOccupancy(level)
    const assignedLane = findClosestAvailableLane(preferredLane, occupiedLanes)
    occupiedLanes.add(assignedLane)
    laneMap.set(nodeKey, assignedLane)
  })

  const laneValues = [...laneMap.values()]
  const minLane = laneValues.length > 0 ? Math.min(...laneValues) : 0

  return topologicalOrder.map((nodeKey) => {
    const node = nodeMap.get(nodeKey)
    const width = estimateNodeWidth(node?.title)
    return {
      key: nodeKey,
      id: node?.id,
      node,
      level: Number(levelMap.get(nodeKey) || 0),
      lane: Number(laneMap.get(nodeKey) || 0) - minLane,
      width,
      height: 40,
    }
  })
}

export function buildWorkflowDagLayout(nodes, options = {}) {
  const horizontalGap = Number(options.horizontalGap || options.columnGap || 38)
  const verticalGap = Number(options.verticalGap || options.rowGap || 18)
  const config = {
    horizontalGap,
    verticalGap,
    paddingX: Number(options.paddingX || 52),
    paddingY: Number(options.paddingY || 24),
  }

  const { ordered, nodeMap, incomingMap, outgoingMap } = buildGraphMaps(nodes)
  const topologicalOrder = buildTopologicalOrder(ordered, nodeMap, incomingMap, outgoingMap)
  const positions = buildNodePositions(topologicalOrder, nodeMap, incomingMap, outgoingMap)
  const positionMap = new Map()
  const levelWidthMap = new Map()

  positions.forEach((item) => {
    const level = Number(item.level || 0)
    const currentWidth = Number(levelWidthMap.get(level) || 0)
    levelWidthMap.set(level, Math.max(currentWidth, Number(item.width || 0)))
  })

  const levelOffsetMap = new Map()
  const maxLevel = positions.length > 0 ? Math.max(...positions.map((item) => Number(item.level || 0))) : 0
  let runningX = config.paddingX
  for (let level = 0; level <= maxLevel; level += 1) {
    levelOffsetMap.set(level, runningX)
    runningX += Number(levelWidthMap.get(level) || 0) + config.horizontalGap
  }

  positions.forEach((item) => {
    positionMap.set(item.key, {
      ...item,
      x: Number(levelOffsetMap.get(Number(item.level || 0)) || config.paddingX),
      y: config.paddingY + item.lane * (item.height + config.verticalGap),
    })
  })

  const edges = []
  positionMap.forEach((target) => {
    sortKeysByOrder(incomingMap.get(target.key) || [], nodeMap).forEach((sourceKey) => {
      const source = positionMap.get(sourceKey)
      if (!source) return
      edges.push({
        id: `${source.key}->${target.key}`,
        from: source.key,
        to: target.key,
        path: [
          `M ${source.x + source.width} ${source.y + source.height / 2}`,
          `C ${source.x + source.width + Math.max(12, config.horizontalGap * 0.45)} ${source.y + source.height / 2},`,
          `${target.x - Math.max(12, config.horizontalGap * 0.45)} ${target.y + target.height / 2},`,
          `${target.x} ${target.y + target.height / 2}`,
        ].join(' '),
      })
    })
  })

  const width =
    positions.length > 0
      ? Math.max(...positions.map((item) => (levelOffsetMap.get(Number(item.level || 0)) || config.paddingX) + item.width)) +
        config.paddingX
      : config.paddingX * 2
  const height =
    positions.length > 0
      ? Math.max(...positions.map((item) => config.paddingY + item.lane * (item.height + config.verticalGap) + item.height)) +
        config.paddingY
      : config.paddingY * 2

  return {
    nodes: positions.map((item) => ({
      ...item,
      x: Number(levelOffsetMap.get(Number(item.level || 0)) || config.paddingX),
      y: config.paddingY + item.lane * (item.height + config.verticalGap),
    })),
    edges,
    width,
    height,
  }
}
