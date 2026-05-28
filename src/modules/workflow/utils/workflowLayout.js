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
  return clamp(48 + count * 13, 112, 248)
}

function getNodeLayoutSemanticBias(node) {
  const title = String(node?.title || '').trim()
  const key = String(node?.key || node?.id || '').trim().toUpperCase()
  const phaseKey = String(node?.phaseKey || '').trim().toUpperCase()

  const isTestCase = title.includes('测试用例') || phaseKey.includes('TEST_CASE') || key === 'NODE_5'
  if (isTestCase) return -2.2

  const isCaseReview = title.includes('用例评审') || phaseKey.includes('CASE_REVIEW') || key === 'NODE_6'
  if (isCaseReview) return -1.8

  const isFrontendDev = title.includes('前端开发') || phaseKey.includes('FRONTEND_DEV')
  if (isFrontendDev) return 0.6

  const isJointDebug = title.includes('联调阶段') || phaseKey.includes('JOINT_DEBUG')
  if (isJointDebug) return 1

  return 0
}

function isJointDebugNode(node) {
  const title = String(node?.title || '').trim()
  const key = String(node?.key || node?.id || '').trim().toUpperCase()
  const phaseKey = String(node?.phaseKey || '').trim().toUpperCase()
  return title.includes('联调阶段') || key.includes('JOINT_DEBUG') || phaseKey.includes('JOINT_DEBUG')
}

function isCodeReviewNode(node) {
  const title = String(node?.title || '').trim().toLowerCase()
  const key = String(node?.key || node?.id || '').trim().toUpperCase()
  const phaseKey = String(node?.phaseKey || '').trim().toUpperCase()
  return title.includes('code review') || key.includes('CODE_REVIEW') || phaseKey.includes('CODE_REVIEW')
}

function computeAverage(values) {
  const list = Array.isArray(values) ? values.filter((value) => Number.isFinite(Number(value))) : []
  if (list.length === 0) return null
  return list.reduce((sum, value) => sum + Number(value), 0) / list.length
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

  // Normalize sparse / fractional lanes into dense integer rows so columns with different
  // node counts keep readable spacing without globally stretching the canvas.
  const normalizedLaneMap = new Map()
  const sortedLaneValues = [...new Set([...laneMap.values()])].sort((a, b) => Number(a) - Number(b))
  sortedLaneValues.forEach((laneValue, index) => {
    normalizedLaneMap.set(Number(laneValue), index)
  })

  return topologicalOrder.map((nodeKey) => {
    const node = nodeMap.get(nodeKey)
    const width = estimateNodeWidth(node?.title)
    const rawLane = Number(laneMap.get(nodeKey) || 0)
    const normalizedLane = Number(normalizedLaneMap.get(rawLane) || 0)
    return {
      key: nodeKey,
      id: node?.id,
      node,
      level: Number(levelMap.get(nodeKey) || 0),
      lane: normalizedLane,
      width,
      height: 40,
    }
  })
}

export function buildWorkflowDagLayout(nodes, options = {}) {
  const horizontalGap = Number(options.horizontalGap || options.columnGap || 78)
  const verticalGap = Number(options.verticalGap || options.rowGap || 30)
  const config = {
    horizontalGap,
    verticalGap,
    paddingX: Number(options.paddingX || 72),
    paddingY: Number(options.paddingY || 20),
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

  const levelGroups = new Map()
  positions.forEach((item) => {
    const level = Number(item.level || 0)
    if (!levelGroups.has(level)) {
      levelGroups.set(level, [])
    }
    levelGroups.get(level).push(item)
  })

  const adaptiveNodeYMap = new Map()
  levelGroups.forEach((group) => {
    const sortedGroup = [...group].sort((a, b) => {
      const aScore = Number(a.lane || 0) + getNodeLayoutSemanticBias(a.node)
      const bScore = Number(b.lane || 0) + getNodeLayoutSemanticBias(b.node)
      const laneDiff = aScore - bScore
      if (laneDiff !== 0) return laneDiff
      return Number(a.node?.order || 0) - Number(b.node?.order || 0)
    })

    const count = sortedGroup.length
    const compactOffset = count >= 4 ? Math.min(10, (count - 3) * 2) : 0
    const levelVerticalGap = Math.max(18, config.verticalGap - compactOffset)
    const step = Number(sortedGroup[0]?.height || 40) + levelVerticalGap

    const originalCenterY =
      sortedGroup.reduce(
        (sum, item) => sum + (config.paddingY + Number(item.lane || 0) * (Number(item.height || 40) + config.verticalGap)),
        0,
      ) / Math.max(count, 1)

    const startY = originalCenterY - ((count - 1) * step) / 2
    sortedGroup.forEach((item, index) => {
      adaptiveNodeYMap.set(item.key, startY + index * step)
    })
  })

  // Keep each level close to upstream centerline to reduce total graph height.
  const orderedLevels = [...levelGroups.keys()].map((level) => Number(level)).sort((a, b) => a - b)
  orderedLevels.forEach((level) => {
    if (!Number.isFinite(level) || level <= 0) return
    const group = levelGroups.get(level) || []
    if (group.length === 0) return

    const currentCenter = computeAverage(group.map((item) => adaptiveNodeYMap.get(item.key)))
    if (!Number.isFinite(currentCenter)) return

    const predecessorYs = []
    group.forEach((item) => {
      const predecessors = sortKeysByOrder(incomingMap.get(item.key) || [], nodeMap)
      predecessors.forEach((preKey) => {
        const y = adaptiveNodeYMap.get(preKey)
        if (Number.isFinite(Number(y))) predecessorYs.push(Number(y))
      })
    })

    const previousLevelGroup = levelGroups.get(level - 1) || []
    const previousLevelCenter = computeAverage(previousLevelGroup.map((item) => adaptiveNodeYMap.get(item.key)))
    const targetCenter = computeAverage(predecessorYs) ?? previousLevelCenter
    if (!Number.isFinite(targetCenter)) return

    let shift = clamp(targetCenter - currentCenter, -42, 42)
    const hasCodeReviewNode = group.some((item) => isCodeReviewNode(item?.node))
    // Keep code-review column from drifting upward; allow keep/downward only.
    if (hasCodeReviewNode && shift < 0) shift = 0
    if (Math.abs(shift) < 0.5) return
    group.forEach((item) => {
      adaptiveNodeYMap.set(item.key, Number(adaptiveNodeYMap.get(item.key) || 0) + shift)
    })
  })

  // Keep integration stage and downstream columns visually centered.
  // This avoids an upper-drift after elevating testcase/case-review nodes.
  const jointDebugLevels = positions
    .filter((item) => isJointDebugNode(item?.node))
    .map((item) => Number(item.level || 0))
  const firstJointDebugLevel = jointDebugLevels.length > 0 ? Math.min(...jointDebugLevels) : null
  if (Number.isFinite(firstJointDebugLevel)) {
    const baselineNodes = positions.filter((item) => Number(item.level || 0) <= firstJointDebugLevel)
    const baselineCenterY =
      baselineNodes.reduce((sum, item) => sum + Number(adaptiveNodeYMap.get(item.key) || 0), 0) / Math.max(baselineNodes.length, 1)

    const downstreamLevels = [...levelGroups.keys()]
      .map((level) => Number(level))
      .filter((level) => level >= firstJointDebugLevel)
      .sort((a, b) => a - b)

    downstreamLevels.forEach((level) => {
      const group = levelGroups.get(level) || []
      if (group.length === 0) return
      const currentCenterY =
        group.reduce((sum, item) => sum + Number(adaptiveNodeYMap.get(item.key) || 0), 0) / Math.max(group.length, 1)
      let shift = clamp((baselineCenterY - currentCenterY) * 0.72, -84, 84)
      const hasCodeReviewNode = group.some((item) => isCodeReviewNode(item?.node))
      if (hasCodeReviewNode && shift < 0) shift = 0
      if (Math.abs(shift) < 0.5) return
      group.forEach((item) => {
        adaptiveNodeYMap.set(item.key, Number(adaptiveNodeYMap.get(item.key) || 0) + shift)
      })
    })
  }

  let minAdaptiveY = Number.POSITIVE_INFINITY
  adaptiveNodeYMap.forEach((value) => {
    minAdaptiveY = Math.min(minAdaptiveY, Number(value || 0))
  })
  const topShift = Number.isFinite(minAdaptiveY) ? config.paddingY - minAdaptiveY : 0

  positions.forEach((item) => {
    positionMap.set(item.key, {
      ...item,
      x: Number(levelOffsetMap.get(Number(item.level || 0)) || config.paddingX),
      y: Number(adaptiveNodeYMap.get(item.key) || config.paddingY) + topShift,
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
  const renderedNodes = positions.map((item) => ({
    ...item,
    x: Number(levelOffsetMap.get(Number(item.level || 0)) || config.paddingX),
    y: Number(adaptiveNodeYMap.get(item.key) || config.paddingY) + topShift,
  }))
  const height =
    renderedNodes.length > 0
      ? Math.max(...renderedNodes.map((item) => Number(item.y || 0) + Number(item.height || 40))) + config.paddingY
      : config.paddingY * 2

  return {
    nodes: renderedNodes,
    edges,
    width,
    height,
  }
}
