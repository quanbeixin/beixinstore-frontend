import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { executeAgentApi, getAgentOptionsApi } from '../../api/agent'
import { getDictItemsApi } from '../../api/configDict'
import { getUsersApi } from '../../api/users'
import {
  assignDemandWorkflowNodeApi,
  createOwnerAssignedLogApi,
  createWorkDemandApi,
  deleteWorkDemandApi,
  getDemandWorkflowApi,
  getProjectTemplateByIdApi,
  getProjectTemplatesApi,
  getWorkflowAssigneesApi,
  getWorkDemandByIdApi,
  getWorkDemandsApi,
  getWorkLogsApi,
  initDemandWorkflowApi,
  replaceDemandWorkflowLatestApi,
  submitDemandWorkflowNodeApi,
  updateDemandWorkflowNodeHoursApi,
  updateDemandWorkflowTaskHoursApi,
  updateWorkDemandApi,
  updateWorkLogApi,
} from '../../api/work'
import {
  DemandNodeInspector,
  getDemandWorkflowNodeDisplayName,
  mapDemandWorkflowToGraphNodes,
} from '../../modules/demand-workflow'
import { DemandCommunicationPanel } from '../../modules/demand-communication'
import { DemandBugPanel } from '../../modules/bug'
import { WorkflowGraph } from '../../modules/workflow'
import { getAccessSnapshot, getCurrentUser, getUserPreferences, hasPermission, hasRole } from '../../utils/access'
import {
  formatBeijingDate,
  formatBeijingDateTime,
  getBeijingTodayDateString,
} from '../../utils/datetime'
import './WorkDemandsPage.css'

const { Search } = Input
const { Paragraph, Text } = Typography
const { RangePicker } = DatePicker
const DEMAND_POOL_AGENT_SCENE = 'DEMAND_POOL_ANALYSIS'
const WORKFLOW_ASSIGNEE_PAGE_SIZE = 500
const WORKFLOW_ASSIGNEE_MAX_PAGES = 50
const DEMAND_LIST_PAGE_SIZE = 1000

const STATUS_OPTIONS = [
  { label: '待开始', value: 'TODO' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
  { label: '已中止', value: 'CANCELLED' },
]

const NON_COMPLETED_STATUS_OPTIONS = STATUS_OPTIONS.filter((item) => item.value !== 'DONE')
const COMPLETED_TAB_STATUS_OPTIONS = STATUS_OPTIONS.filter((item) => item.value === 'DONE')
const CANCELLED_TAB_STATUS_OPTIONS = STATUS_OPTIONS.filter((item) => item.value === 'CANCELLED')

const PRIORITY_OPTIONS = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
]

const HEALTH_STATUS_OPTIONS = [
  { label: '健康', value: 'green' },
  { label: '预警', value: 'yellow' },
  { label: '风险', value: 'red' },
]

function formatDemandNodeSchedule(record) {
  const plannedStart = formatBeijingDate(record?.current_node_planned_start_date)
  const plannedEnd = formatBeijingDate(record?.current_node_planned_end_date)

  if (plannedStart && plannedEnd) return `${plannedStart} ~ ${plannedEnd}`
  if (plannedStart) return `${plannedStart} ~ -`
  if (plannedEnd) return `- ~ ${plannedEnd}`
  return '-'
}

const FALLBACK_PARTICIPANT_ROLE_OPTIONS = [
  { value: 'DEMAND_OWNER', label: '需求负责人' },
  { value: 'PRODUCT_MANAGER', label: '产品经理' },
  { value: 'DESIGNER', label: '设计' },
  { value: 'FRONTEND_DEV', label: '前端开发' },
  { value: 'BACKEND_DEV', label: '后端开发' },
  { value: 'DEVOPS_DEV', label: '运维开发' },
  { value: 'BIGDATA_DEV', label: '大数据开发' },
  { value: 'ALGORITHM_DEV', label: '算法开发' },
  { value: 'QA', label: '测试' },
  { value: 'OPERATIONS', label: '运营' },
  { value: 'MEDIA_BUYER', label: '投放' },
]

const DEFAULT_DEMAND_PARTICIPANT_ROLES = [
  'PRODUCT_MANAGER',
  'DESIGNER',
  'FRONTEND_DEV',
  'BACKEND_DEV',
  'QA',
]

const DETAIL_LOG_FILTER_OPTIONS = [
  { label: '全部', value: 'ALL' },
  { label: '未完成', value: 'PENDING' },
  { label: '已逾期', value: 'OVERDUE' },
]

function getStatusTagColor(status) {
  if (status === 'DONE') return 'success'
  if (status === 'IN_PROGRESS') return 'processing'
  if (status === 'CANCELLED') return 'default'
  return 'warning'
}

function getStatusLabel(status) {
  const target = STATUS_OPTIONS.find((item) => item.value === status)
  return target?.label || status || '-'
}

function getPriorityColor(priority) {
  if (priority === 'P0') return 'red'
  if (priority === 'P1') return 'orange'
  if (priority === 'P2') return 'blue'
  return 'default'
}

function getHealthTagColor(healthStatus) {
  if (healthStatus === 'red') return 'error'
  if (healthStatus === 'yellow') return 'warning'
  return 'success'
}

function getHealthLabel(healthStatus) {
  const target = HEALTH_STATUS_OPTIONS.find((item) => item.value === healthStatus)
  return target?.label || healthStatus || '健康'
}

function getDemandPhaseTagColor(phaseKey, phaseName) {
  const text = `${String(phaseKey || '').trim().toUpperCase()} ${String(phaseName || '').trim().toUpperCase()}`
  if (!text.trim()) return 'default'
  if (text.includes('BUG')) return 'volcano'
  if (text.includes('TEST') || text.includes('测试') || text.includes('QA')) return 'gold'
  if (
    text.includes('FRONTEND') ||
    text.includes('BACKEND') ||
    text.includes('DEV') ||
    text.includes('开发') ||
    text.includes('研发')
  ) {
    return 'geekblue'
  }
  if (text.includes('DESIGN') || text.includes('设计') || text.includes('UI')) return 'cyan'
  if (text.includes('PRODUCT') || text.includes('需求') || text.includes('产品') || text.includes('PRD')) return 'purple'
  if (text.includes('ACCEPT') || text.includes('验收') || text.includes('REVIEW') || text.includes('评审')) return 'lime'
  if (text.includes('RELEASE') || text.includes('上线') || text.includes('发布') || text.includes('LAUNCH')) return 'green'
  if (text.includes('OPERAT') || text.includes('运营') || text.includes('投放')) return 'magenta'
  return 'blue'
}

function toNullableDateTimeValue(value) {
  if (!value) return null
  const maybe = dayjs(value)
  return maybe.isValid() ? maybe : null
}

function extractTemplateNodes(template) {
  if (!template) return []
  const config = template.node_config
  let nodes = []

  if (Array.isArray(config)) {
    nodes = config
  } else if (config && typeof config === 'object') {
    if (Array.isArray(config.nodes)) {
      nodes = config.nodes
    } else {
      nodes = Object.entries(config).map(([nodeKey, nodeValue], index) => ({
        node_key: nodeKey,
        ...(nodeValue && typeof nodeValue === 'object' ? nodeValue : {}),
        sort_order:
          nodeValue && typeof nodeValue === 'object' && Number.isFinite(Number(nodeValue.sort_order))
            ? Number(nodeValue.sort_order)
            : index + 1,
      }))
    }
  }

  return nodes
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item : {}
      const nodeKey = String(row.node_key || row.key || '').trim()
      const nodeName = String(row.node_name || row.name || row.title || '').trim()
      const sortOrder = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index + 1
      return {
        node_key: nodeKey || `NODE_${index + 1}`,
        node_name: nodeName || nodeKey || `节点${index + 1}`,
        node_type: String(row.node_type || '').trim(),
        phase_key: String(row.phase_key || '').trim(),
        sort_order: sortOrder,
        participant_roles: Array.from(
          new Set(
            (Array.isArray(row.participant_roles) ? row.participant_roles : [])
              .map((role) =>
                String(role || '')
                  .trim()
                  .replace(/\s+/g, '_')
                  .toUpperCase(),
              )
              .filter(Boolean),
          ),
        ),
      }
    })
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
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

function filterTemplateNodesByParticipantRoles(nodes, participantRoles = []) {
  const normalizedDemandRoles = normalizeParticipantRoles(participantRoles)
  const demandRoleSet = new Set(normalizedDemandRoles)

  return (Array.isArray(nodes) ? nodes : []).filter((node) => {
    const nodeRoles = normalizeParticipantRoles(node?.participant_roles)
    if (nodeRoles.length === 0) return true
    return nodeRoles.some((role) => demandRoleSet.has(role))
  })
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function isOverdueLogItem(item) {
  if (!item) return false
  if (String(item.log_status || '').toUpperCase() === 'DONE') return false
  const expectedDate = formatBeijingDate(item.expected_completion_date, '')
  if (!expectedDate) return false
  return expectedDate < getBeijingTodayDateString()
}

function getNodeRelatedPhaseKeySet(node) {
  const set = new Set()
  const nodeKey = String(node?.node_key || '').trim().toUpperCase()
  const phaseKey = String(node?.phase_key || '').trim().toUpperCase()
  if (nodeKey) set.add(nodeKey)
  if (phaseKey) set.add(phaseKey)
  return set
}

function getDemandListPhaseGroup(record) {
  const phaseKey = String(record?.current_phase_key || '').trim().toUpperCase() || '__UNSTARTED__'
  const phaseName = String(record?.current_phase_name || '').trim() || '未开始'
  return { phaseKey, phaseName }
}

function WorkDemands({ pageMode = 'pool' } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: routeDemandId } = useParams()
  const isDetailPage = Boolean(routeDemandId)
  const isMyDemandsPage = pageMode === 'my'
  const listBasePath = isMyDemandsPage ? '/my-demands' : '/work-demands'
  const [myDemandTabKey, setMyDemandTabKey] = useState('owned')
  const access = useMemo(() => getAccessSnapshot(), [])
  const canUseDemandPoolAnalysis = Boolean(access?.is_super_admin)
  const canView = hasPermission('demand.view')
  const canViewUsers = hasPermission('user.view')
  const canCreate = hasPermission('demand.create')
  const canCreateInCurrentPage = canCreate && !isMyDemandsPage
  const canUseProjectTemplates =
    canCreate || hasPermission('project.template.view') || hasPermission('project.template.manage')
  const canTransferOwner = hasPermission('demand.transfer_owner') || hasRole('ADMIN')
  const canViewSelfLogs = hasPermission('worklog.view.self')
  const canViewTeamLogs = hasPermission('worklog.view.team')
  const canViewWorkflow = hasPermission('demand.workflow.view') || hasPermission('demand.view')
  const canManageWorkflow = hasPermission('demand.workflow.manage') || hasPermission('demand.manage')
  const canForceReplaceWorkflow = canManageWorkflow && hasRole('SUPER_ADMIN')
  const currentUser = getCurrentUser()

  const [form] = Form.useForm()
  const modalTemplateId = Form.useWatch('template_id', form)
  const modalParticipantRoles = Form.useWatch('participant_roles', form)
  const modalOwnerUserId = Form.useWatch('owner_user_id', form)
  const modalProjectManager = Form.useWatch('project_manager', form)

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDemand, setEditingDemand] = useState(null)

  const [demands, setDemands] = useState([])
  const [users, setUsers] = useState([])
  const [projectTemplates, setProjectTemplates] = useState([])
  const [templateFallbackMap, setTemplateFallbackMap] = useState({})
  const templateFallbackLoadingRef = useRef(new Set())
  const previousCreateOwnerIdRef = useRef(null)
  const [workflowAssignees, setWorkflowAssignees] = useState([])
  const [businessGroups, setBusinessGroups] = useState([])
  const [businessGroupCounts, setBusinessGroupCounts] = useState([])
  const [businessGroupAllCount, setBusinessGroupAllCount] = useState(0)
  const [completedDemandCount, setCompletedDemandCount] = useState(0)
  const [cancelledDemandCount, setCancelledDemandCount] = useState(0)
  const [participantRoleItems, setParticipantRoleItems] = useState([])

  const [page, setPage] = useState(1)
  const [pageSize] = useState(DEMAND_LIST_PAGE_SIZE)

  const [keyword, setKeyword] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [prioritySortOrder, setPrioritySortOrder] = useState()
  const [businessGroupFilter, setBusinessGroupFilter] = useState('')
  const [showCompletedTabOnly, setShowCompletedTabOnly] = useState(false)
  const [showCancelledTabOnly, setShowCancelledTabOnly] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState()
  const [updatedRange, setUpdatedRange] = useState([])
  const [scopeFilter, setScopeFilter] = useState('all')
  const [compactView, setCompactView] = useState(() => {
    const preferences = getUserPreferences()
    return Number(preferences?.demand_list_compact_default || 0) === 1
  })
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false)
  const [agentOptions, setAgentOptions] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [analysisExecuting, setAnalysisExecuting] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)

  const [detailPageLoading, setDetailPageLoading] = useState(false)
  const [detailDemand, setDetailDemand] = useState(null)
  const [detailLogs, setDetailLogs] = useState([])
  const [detailLogsLoading, setDetailLogsLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailLogFilter, setDetailLogFilter] = useState('ALL')
  const [detailName, setDetailName] = useState('')
  const [detailTemplateId, setDetailTemplateId] = useState()
  const [detailParticipantRoles, setDetailParticipantRoles] = useState(DEFAULT_DEMAND_PARTICIPANT_ROLES)
  const [detailProjectManager, setDetailProjectManager] = useState()
  const [detailBusinessGroupCode, setDetailBusinessGroupCode] = useState(undefined)
  const [detailHealthStatus, setDetailHealthStatus] = useState('green')
  const [detailActualStartTime, setDetailActualStartTime] = useState(null)
  const [detailActualEndTime, setDetailActualEndTime] = useState(null)
  const [detailExpectedReleaseDate, setDetailExpectedReleaseDate] = useState(null)
  const [detailDocLink, setDetailDocLink] = useState('')
  const [detailUiDesignLink, setDetailUiDesignLink] = useState('')
  const [detailTestCaseLink, setDetailTestCaseLink] = useState('')
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false)
  const [workflowReplacing, setWorkflowReplacing] = useState(false)
  const [workflowTaskUpdatingId, setWorkflowTaskUpdatingId] = useState(null)
  const [workflowData, setWorkflowData] = useState(null)
  const [workflowWarning, setWorkflowWarning] = useState('')
  const [selectedWorkflowNodeKey, setSelectedWorkflowNodeKey] = useState('')
  const [workflowParticipantUserIds, setWorkflowParticipantUserIds] = useState([])
  const [workflowDueAt, setWorkflowDueAt] = useState(null)
  const [workflowExpectedStartAt, setWorkflowExpectedStartAt] = useState(null)
  const [workflowQuickTaskSubmitting, setWorkflowQuickTaskSubmitting] = useState(false)
  const [detailStatus, setDetailStatus] = useState('')
  const [detailTabKey, setDetailTabKey] = useState('basic')
  const selectedWorkflowNodeKeyRef = useRef('')

  const detailLogStats = useMemo(() => {
    const total = detailLogs.length
    const pending = detailLogs.filter((item) => String(item?.log_status || '').toUpperCase() !== 'DONE').length
    const overdue = detailLogs.filter((item) => isOverdueLogItem(item)).length
    return { total, pending, overdue }
  }, [detailLogs])

  const filteredDetailLogs = useMemo(() => {
    if (detailLogFilter === 'PENDING') {
      return detailLogs.filter((item) => String(item?.log_status || '').toUpperCase() !== 'DONE')
    }
    if (detailLogFilter === 'OVERDUE') {
      return detailLogs.filter((item) => isOverdueLogItem(item))
    }
    return detailLogs
  }, [detailLogs, detailLogFilter])

  const selectedWorkflowNode = useMemo(() => {
    const nodes = Array.isArray(workflowData?.nodes) ? workflowData.nodes : []
    if (nodes.length === 0) return null
    const normalizedSelectedKey = String(selectedWorkflowNodeKey || '').toUpperCase()
    if (normalizedSelectedKey) {
      const matched = nodes.find((node) => String(node?.node_key || '').toUpperCase() === normalizedSelectedKey)
      if (matched) return matched
    }
    return workflowData?.current_node || nodes[0] || null
  }, [workflowData, selectedWorkflowNodeKey])

  const currentWorkflowNodeKeySet = useMemo(() => {
    const set = new Set(
      (Array.isArray(workflowData?.current_nodes) ? workflowData.current_nodes : [])
        .map((node) => String(node?.node_key || '').trim().toUpperCase())
        .filter(Boolean),
    )
    if (set.size === 0) {
      const fallbackKey = String(workflowData?.current_node?.node_key || '').trim().toUpperCase()
      if (fallbackKey) set.add(fallbackKey)
    }
    return set
  }, [workflowData])

  const isSelectedCurrentWorkflowNode = useMemo(() => {
    if (!selectedWorkflowNode) return false
    return currentWorkflowNodeKeySet.has(String(selectedWorkflowNode.node_key || '').trim().toUpperCase())
  }, [currentWorkflowNodeKeySet, selectedWorkflowNode])

  const currentWorkflowNodes = useMemo(() => {
    const rows = Array.isArray(workflowData?.current_nodes) ? workflowData.current_nodes : []
    if (rows.length > 0) return rows
    return workflowData?.current_node ? [workflowData.current_node] : []
  }, [workflowData])

  const requestedWorkflowNodeKey = useMemo(() => {
    const rawValue = new URLSearchParams(location.search).get('node')
    return String(rawValue || '').trim().toUpperCase()
  }, [location.search])

  const workflowGraphNodes = useMemo(
    () => mapDemandWorkflowToGraphNodes(workflowData),
    [workflowData],
  )

  const workflowCompletedCount = useMemo(
    () =>
      (workflowGraphNodes || []).filter((item) => String(item?.status || '').toUpperCase() === 'DONE').length,
    [workflowGraphNodes],
  )

  const workflowTotalEstimatedHours = useMemo(() => {
    const tasks = Array.isArray(workflowData?.tasks) ? workflowData.tasks : []
    const nodes = Array.isArray(workflowData?.nodes) ? workflowData.nodes : []
    const relatedPhaseKeySet = new Set()
    nodes.forEach((item) => {
      getNodeRelatedPhaseKeySet(item).forEach((key) => {
        if (key) relatedPhaseKeySet.add(key)
      })
    })

    let totalTaskHours = 0
    let hasTaskHours = false
    tasks.forEach((item) => {
      const status = String(item?.status || '').toUpperCase()
      if (status === 'CANCELLED') return
      const hours = Number(item?.personal_estimated_hours)
      if (!Number.isFinite(hours) || hours <= 0) return
      totalTaskHours += hours
      hasTaskHours = true
    })

    ;(detailLogs || []).forEach((item) => {
      const taskSource = String(item?.task_source || '').trim().toUpperCase()
      if (taskSource === 'WORKFLOW_AUTO') return
      const status = String(item?.log_status || '').toUpperCase()
      if (status === 'CANCELLED') return
      const phaseKey = String(item?.phase_key || '').trim().toUpperCase()
      if (!phaseKey || !relatedPhaseKeySet.has(phaseKey)) return
      const hours = Number(item?.personal_estimate_hours)
      if (!Number.isFinite(hours) || hours <= 0) return
      totalTaskHours += hours
      hasTaskHours = true
    })

    if (hasTaskHours) return Number(totalTaskHours.toFixed(1))

    let totalNodeHours = 0
    let hasNodeHours = false
    nodes.forEach((item) => {
      const fallbackValue =
        item?.personal_estimated_hours !== undefined && item?.personal_estimated_hours !== null
          ? item.personal_estimated_hours
          : item?.owner_estimated_hours
      const hours = Number(fallbackValue)
      if (!Number.isFinite(hours) || hours <= 0) return
      totalNodeHours += hours
      hasNodeHours = true
    })
    return hasNodeHours ? Number(totalNodeHours.toFixed(1)) : 0
  }, [detailLogs, workflowData])

  const currentWorkflowNodeLabel = useMemo(() => {
    if (currentWorkflowNodes.length > 1) {
      return currentWorkflowNodes.map((node) => getDemandWorkflowNodeDisplayName(node)).join(' / ')
    }
    return getDemandWorkflowNodeDisplayName(currentWorkflowNodes[0])
  }, [currentWorkflowNodes])

  const canAssignSelectedWorkflowNode = useMemo(() => {
    const status = String(selectedWorkflowNode?.status || '').toUpperCase()
    return status !== 'DONE' && status !== 'CANCELLED'
  }, [selectedWorkflowNode])

  const workflowActionBusy = workflowSubmitting || workflowReplacing

  const canEditDemandRecord = useCallback(
    (record) => {
      if (!record) return false
      if (canTransferOwner) return true
      return Number(record.owner_user_id) === Number(currentUser?.id)
    },
    [canTransferOwner, currentUser?.id],
  )

  const ownerOptions = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      const displayName = user.real_name || user.username
      if (!map.has(user.id)) {
        map.set(user.id, {
          value: user.id,
          label: displayName,
        })
      }
    })

    demands.forEach((item) => {
      const ownerId = Number(item.owner_user_id)
      if (!Number.isInteger(ownerId) || ownerId <= 0 || map.has(ownerId)) return
      map.set(ownerId, {
        value: ownerId,
        label: item.owner_name || `用户${ownerId}`,
      })
    })

    if (currentUser?.id && !map.has(currentUser.id)) {
      const displayName = currentUser.real_name || currentUser.username || '当前用户'
      map.set(currentUser.id, {
        value: currentUser.id,
        label: displayName,
      })
    }

    return Array.from(map.values()).sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-CN'))
  }, [users, demands, currentUser])

  const workflowAssigneeOptions = useMemo(() => {
    const map = new Map()
    ;(workflowAssignees || []).forEach((user) => {
      const userId = Number(user?.id)
      if (!Number.isInteger(userId) || userId <= 0) return
      const displayName = String(user?.real_name || user?.username || `用户${userId}`).trim()
      if (!map.has(userId)) {
        map.set(userId, {
          value: userId,
          label: displayName || `用户${userId}`,
        })
      }
    })

    ;(workflowData?.nodes || []).forEach((node) => {
      const userId = Number(node?.assignee_user_id)
      if (!Number.isInteger(userId) || userId <= 0 || map.has(userId)) return
      map.set(userId, {
        value: userId,
        label: String(node?.assignee_name || `用户${userId}`).trim() || `用户${userId}`,
      })
    })

    const currentUserId = Number(currentUser?.id)
    if (Number.isInteger(currentUserId) && currentUserId > 0 && !map.has(currentUserId)) {
      map.set(currentUserId, {
        value: currentUserId,
        label: String(currentUser?.real_name || currentUser?.username || '当前用户').trim() || `用户${currentUserId}`,
      })
    }

    return Array.from(map.values()).sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-CN'))
  }, [workflowAssignees, workflowData, currentUser])

  const businessGroupOptions = useMemo(
    () =>
      businessGroups.map((item) => ({
        value: item.item_code,
        label: item.item_name || item.item_code,
      })),
    [businessGroups],
  )

  const businessGroupCountMap = useMemo(() => {
    const map = new Map()
    ;(businessGroupCounts || []).forEach((item) => {
      map.set(String(item?.business_group_code || ''), Number(item?.total || 0))
    })
    return map
  }, [businessGroupCounts])

  const businessGroupTabItems = useMemo(
    () => [
      { key: '__ALL__', label: `全部 (${Number(businessGroupAllCount || 0)})` },
      ...businessGroupOptions.map((item) => {
        const key = String(item.value || '')
        const count = Number(businessGroupCountMap.get(key) || 0)
        return {
          key,
          label: `${item.label} (${count})`,
        }
      }),
      { key: '__DONE__', label: `已完成 (${Number(completedDemandCount || 0)})` },
      { key: '__CANCELLED__', label: `已中止 (${Number(cancelledDemandCount || 0)})` },
    ],
    [businessGroupAllCount, businessGroupCountMap, businessGroupOptions, completedDemandCount, cancelledDemandCount],
  )
  const myDemandTabItems = useMemo(
    () => [
      { key: 'owned', label: '我创建的' },
      { key: 'participated', label: '我参与的' },
    ],
    [],
  )

  const activeDemandTabKey = showCompletedTabOnly
    ? '__DONE__'
    : showCancelledTabOnly
      ? '__CANCELLED__'
      : businessGroupFilter || '__ALL__'
  const demandStatusOptions = showCompletedTabOnly
    ? COMPLETED_TAB_STATUS_OPTIONS
    : showCancelledTabOnly
      ? CANCELLED_TAB_STATUS_OPTIONS
      : NON_COMPLETED_STATUS_OPTIONS

  const participantRoleOptions = useMemo(() => {
    const rows = Array.isArray(participantRoleItems) ? participantRoleItems : []
    if (rows.length === 0) return FALLBACK_PARTICIPANT_ROLE_OPTIONS
    return rows.map((item) => ({
      value: String(item.item_code || '').trim().toUpperCase(),
      label: item.item_name || item.item_code,
    }))
  }, [participantRoleItems])

  const participantRoleLabelMap = useMemo(() => {
    const map = new Map()
    participantRoleOptions.forEach((item) => {
      map.set(String(item.value || '').trim().toUpperCase(), item.label)
    })
    return map
  }, [participantRoleOptions])

  const groupedDemands = useMemo(() => {
    const sortedRows = [...(demands || [])].sort((a, b) => {
      const createdAtA = dayjs(a?.created_at).valueOf()
      const createdAtB = dayjs(b?.created_at).valueOf()
      if (Number.isFinite(createdAtA) || Number.isFinite(createdAtB)) {
        return (Number.isFinite(createdAtB) ? createdAtB : 0) - (Number.isFinite(createdAtA) ? createdAtA : 0)
      }
      return Number(b?.id || 0) - Number(a?.id || 0)
    })

    const groupMap = new Map()
    sortedRows.forEach((item) => {
      const { phaseKey, phaseName } = getDemandListPhaseGroup(item)
      if (!groupMap.has(phaseKey)) {
        groupMap.set(phaseKey, {
          id: `phase-group-${phaseKey}`,
          __group: true,
          current_phase_key: phaseKey,
          current_phase_name: phaseName,
          name: phaseName,
          children: [],
          __sortTime: 0,
        })
      }
      const group = groupMap.get(phaseKey)
      group.children.push(item)
      const createdAt = dayjs(item?.created_at).valueOf()
      if (Number.isFinite(createdAt) && createdAt > group.__sortTime) {
        group.__sortTime = createdAt
      }
    })

    return Array.from(groupMap.values()).sort((a, b) => {
      const aIsFallbackGroup = String(a?.current_phase_name || '').trim() === '-'
      const bIsFallbackGroup = String(b?.current_phase_name || '').trim() === '-'
      if (aIsFallbackGroup !== bIsFallbackGroup) {
        return aIsFallbackGroup ? 1 : -1
      }
      if (a.__sortTime !== b.__sortTime) return b.__sortTime - a.__sortTime
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    })
  }, [demands])

  const templateByIdMap = useMemo(() => {
    const map = new Map()
    ;(projectTemplates || []).forEach((item) => {
      const id = Number(item?.id)
      if (!Number.isInteger(id) || id <= 0) return
      map.set(id, item)
    })
    Object.values(templateFallbackMap || {}).forEach((item) => {
      const id = Number(item?.id)
      if (!Number.isInteger(id) || id <= 0) return
      if (!map.has(id)) {
        map.set(id, item)
      }
    })
    return map
  }, [projectTemplates, templateFallbackMap])

  const projectTemplateOptions = useMemo(() => {
    const fromList = (projectTemplates || []).map((item) => ({
      value: Number(item.id),
      label: `${item.name || '未命名模板'} (#${item.id})`,
    }))

    const listIdSet = new Set(fromList.map((item) => Number(item.value)))
    const fallback = Object.values(templateFallbackMap || {})
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const id = Number(item.id)
        if (!Number.isInteger(id) || id <= 0 || listIdSet.has(id)) return null
        const statusText = Number(item.status) === 1 ? '启用' : '停用'
        return {
          value: id,
          label: `${item.name || '未命名模板'} (#${item.id}) · ${statusText}`,
        }
      })
      .filter(Boolean)

    return [...fromList, ...fallback]
  }, [projectTemplates, templateFallbackMap])

  const defaultProjectTemplateId = useMemo(() => {
    const normalizedList = Array.isArray(projectTemplates) ? projectTemplates : []
    const preferred =
      normalizedList.find((item) => String(item?.name || '').trim() === '通用产研流程' && Number(item?.status) === 1) ||
      normalizedList.find((item) => Number(item?.status) === 1) ||
      null
    const id = Number(preferred?.id)
    return Number.isInteger(id) && id > 0 ? id : undefined
  }, [projectTemplates])

  const loadTemplateByIdIfMissing = useCallback(async (rawTemplateId) => {
    if (!canUseProjectTemplates) return
    const id = Number(rawTemplateId)
    if (!Number.isInteger(id) || id <= 0) return
    if (templateByIdMap.has(id)) return
    if (Object.prototype.hasOwnProperty.call(templateFallbackMap, id)) return
    if (templateFallbackLoadingRef.current.has(id)) return

    templateFallbackLoadingRef.current.add(id)
    try {
      const result = await getProjectTemplateByIdApi(id)
      if (result?.success && result.data && typeof result.data === 'object') {
        setTemplateFallbackMap((prev) => ({ ...prev, [id]: result.data }))
      } else {
        setTemplateFallbackMap((prev) => ({ ...prev, [id]: null }))
      }
    } catch {
      setTemplateFallbackMap((prev) => ({ ...prev, [id]: null }))
    } finally {
      templateFallbackLoadingRef.current.delete(id)
    }
  }, [canUseProjectTemplates, templateByIdMap, templateFallbackMap])

  const selectedModalTemplate = useMemo(() => {
    const id = Number(modalTemplateId)
    if (!Number.isInteger(id) || id <= 0) return null
    return templateByIdMap.get(id) || null
  }, [modalTemplateId, templateByIdMap])

  const selectedModalTemplateNodes = useMemo(() => {
    const nodes = extractTemplateNodes(selectedModalTemplate)
    return filterTemplateNodesByParticipantRoles(nodes, modalParticipantRoles)
  }, [selectedModalTemplate, modalParticipantRoles])

  const selectedWorkflowNodeTasks = useMemo(() => {
    if (!selectedWorkflowNode?.id && !selectedWorkflowNode?.node_key) return []
    const relatedPhaseKeySet = getNodeRelatedPhaseKeySet(selectedWorkflowNode)
    const tasks = Array.isArray(workflowData?.tasks) ? workflowData.tasks : []
    const workflowTasks = tasks.filter((item) => {
      if (Number(item.instance_node_id) !== Number(selectedWorkflowNode.id)) return false
      const status = String(item?.status || '').toUpperCase()
      return status !== 'CANCELLED'
    })
    const manualLogs = (detailLogs || [])
      .filter((item) => {
        const taskSource = String(item?.task_source || '').trim().toUpperCase()
        if (taskSource === 'WORKFLOW_AUTO') return false
        const phaseKey = String(item?.phase_key || '').trim().toUpperCase()
        if (!phaseKey || !relatedPhaseKeySet.has(phaseKey)) return false
        const status = String(item?.log_status || '').toUpperCase()
        return status !== 'CANCELLED'
      })
      .map((item) => ({
        id: `manual-log-${item.id}`,
        source_type: 'MANUAL_LOG',
        source_id: item.id,
        task_title: item.description || `事项 #${item.id}`,
        assignee_user_id: item.user_id || null,
        assignee_name: item.username || '-',
        status: String(item?.log_status || 'TODO').toUpperCase(),
        personal_estimated_hours: item.personal_estimate_hours,
        actual_hours: item.actual_hours,
        expected_start_date: item.expected_start_date,
        expected_completion_date: item.expected_completion_date,
        due_at: item.expected_completion_date,
        phase_key: item.phase_key,
        phase_name: item.phase_name,
        task_source: item.task_source || 'SELF',
      }))
    return [...workflowTasks, ...manualLogs]
  }, [detailLogs, selectedWorkflowNode, workflowData])

  const selectedWorkflowNodeAssigneeIds = useMemo(() => {
    const nodeAssigneeUserId = Number(selectedWorkflowNode?.assignee_user_id)
    if (Number.isInteger(nodeAssigneeUserId) && nodeAssigneeUserId > 0) {
      return [nodeAssigneeUserId]
    }
    return []
  }, [selectedWorkflowNode])

  const loadUsers = useCallback(async () => {
    if (!canView || !canViewUsers) {
      setUsers([])
      return
    }

    try {
      const usersMap = new Map()
      let currentPage = 1
      let total = 0

      while (currentPage <= WORKFLOW_ASSIGNEE_MAX_PAGES) {
        const result = await getUsersApi({
          page: currentPage,
          pageSize: WORKFLOW_ASSIGNEE_PAGE_SIZE,
          sort_by: 'real_name',
          sort_order: 'asc',
        })
        if (!result?.success) break

        const list = Array.isArray(result.data?.list) ? result.data.list : []
        total = Number(result.data?.total || 0)
        list.forEach((item) => {
          const userId = Number(item?.id)
          if (!Number.isInteger(userId) || userId <= 0 || usersMap.has(userId)) return
          usersMap.set(userId, item)
        })

        if (list.length < WORKFLOW_ASSIGNEE_PAGE_SIZE) break
        if (total > 0 && usersMap.size >= total) break
        currentPage += 1
      }

      if (usersMap.size > 0) {
        setUsers(Array.from(usersMap.values()))
      }
    } catch {
      // fallback to current user only
    }
  }, [canView, canViewUsers])

  const loadWorkflowAssignees = useCallback(async () => {
    if (!canManageWorkflow) {
      setWorkflowAssignees([])
      return
    }

    try {
      const result = await getWorkflowAssigneesApi()
      if (!result?.success) {
        setWorkflowAssignees([])
        return
      }
      const list = Array.isArray(result.data) ? result.data : []
      setWorkflowAssignees(list)
    } catch {
      setWorkflowAssignees([])
    }
  }, [canManageWorkflow])

  const loadBusinessGroups = useCallback(async () => {
    try {
      const result = await getDictItemsApi('business_group', { enabledOnly: true })
      if (result?.success) {
        setBusinessGroups(result.data || [])
      }
    } catch {
      setBusinessGroups([])
    }
  }, [])

  const loadParticipantRoles = useCallback(async () => {
    try {
      const result = await getDictItemsApi('demand_participant_role', { enabledOnly: true })
      if (result?.success) {
        setParticipantRoleItems(Array.isArray(result.data) ? result.data : [])
        return
      }
      setParticipantRoleItems([])
    } catch {
      setParticipantRoleItems([])
    }
  }, [])

  const loadProjectTemplates = useCallback(async () => {
    if (!canUseProjectTemplates) {
      setProjectTemplates([])
      return
    }
    try {
      const result = await getProjectTemplatesApi({ page: 1, pageSize: 200, status: 1 })
      if (!result?.success) {
        setProjectTemplates([])
        return
      }
      setProjectTemplates(result.data?.list || [])
    } catch {
      setProjectTemplates([])
    }
  }, [canUseProjectTemplates])

  const loadDemands = useCallback(async () => {
    if (!canView) return

    setLoading(true)
    try {
      const params = {
        page,
        pageSize,
      }

      if (keyword.trim()) params.keyword = keyword.trim()
      if (statusFilter && !showCompletedTabOnly && !showCancelledTabOnly) {
        params.status = statusFilter
      }
      if (priorityFilter) params.priority = priorityFilter
      if (prioritySortOrder === 'ascend') params.priority_order = 'asc'
      if (prioritySortOrder === 'descend') params.priority_order = 'desc'
      if (businessGroupFilter) params.business_group_code = businessGroupFilter
      if (showCompletedTabOnly) {
        params.completed_only = true
      } else if (showCancelledTabOnly) {
        params.cancelled_only = true
      } else {
        params.exclude_completed = true
        params.exclude_cancelled = true
      }
      if (ownerFilter) params.owner_user_id = ownerFilter
      if (Array.isArray(updatedRange) && updatedRange.length === 2 && updatedRange[0] && updatedRange[1]) {
        params.updated_start_date = updatedRange[0].format('YYYY-MM-DD')
        params.updated_end_date = updatedRange[1].format('YYYY-MM-DD')
      }
      if (isMyDemandsPage) {
        params.relation_scope = myDemandTabKey === 'participated' ? 'participated' : 'owned'
      } else if (scopeFilter === 'mine') {
        params.mine = true
      }

      const result = await getWorkDemandsApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取需求列表失败')
        return
      }

      setDemands(result.data?.list || [])
      setBusinessGroupAllCount(Number(result.data?.all_total || 0))
      setCompletedDemandCount(Number(result.data?.completed_total || 0))
      setCancelledDemandCount(Number(result.data?.cancelled_total || 0))
      setBusinessGroupCounts(Array.isArray(result.data?.group_counts) ? result.data.group_counts : [])
    } catch (error) {
      message.error(error?.message || '获取需求列表失败')
    } finally {
      setLoading(false)
    }
  }, [
    canView,
    page,
    pageSize,
    keyword,
    statusFilter,
    priorityFilter,
    prioritySortOrder,
    businessGroupFilter,
    showCompletedTabOnly,
    showCancelledTabOnly,
    ownerFilter,
    updatedRange,
    isMyDemandsPage,
    myDemandTabKey,
    scopeFilter,
  ])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    loadWorkflowAssignees()
  }, [loadWorkflowAssignees])

  useEffect(() => {
    loadBusinessGroups()
  }, [loadBusinessGroups])

  useEffect(() => {
    loadParticipantRoles()
  }, [loadParticipantRoles])

  useEffect(() => {
    loadProjectTemplates()
  }, [loadProjectTemplates])

  useEffect(() => {
    if (!modalOpen || editingDemand) return
    if (!defaultProjectTemplateId) return
    const currentTemplateId = form.getFieldValue('template_id')
    if (currentTemplateId) return
    form.setFieldValue('template_id', defaultProjectTemplateId)
  }, [modalOpen, editingDemand, defaultProjectTemplateId, form])

  useEffect(() => {
    loadTemplateByIdIfMissing(modalTemplateId)
  }, [modalTemplateId, loadTemplateByIdIfMissing])

  useEffect(() => {
    loadTemplateByIdIfMissing(detailTemplateId)
  }, [detailTemplateId, loadTemplateByIdIfMissing])

  useEffect(() => {
    if (isDetailPage) return
    loadDemands()
  }, [isDetailPage, loadDemands])

  const loadDemandAgentOptions = useCallback(async () => {
    if (isDetailPage || isMyDemandsPage || !canUseDemandPoolAnalysis) {
      setAgentOptions([])
      setSelectedAgentId(null)
      setAnalysisResult(null)
      return
    }
    setAgentOptionsLoading(true)
    try {
      const result = await getAgentOptionsApi(DEMAND_POOL_AGENT_SCENE)
      if (!result?.success) {
        message.error(result?.message || '获取需求池分析 Agent 失败')
        return
      }
      const options = Array.isArray(result?.data?.options) ? result.data.options : []
      setAgentOptions(options)
      setSelectedAgentId((prev) => {
        if (options.some((item) => Number(item?.id) === Number(prev))) return prev
        const firstId = Number(options?.[0]?.id || 0)
        return firstId > 0 ? firstId : null
      })
    } catch (error) {
      message.error(error?.message || '获取需求池分析 Agent 失败')
    } finally {
      setAgentOptionsLoading(false)
    }
  }, [canUseDemandPoolAnalysis, isDetailPage, isMyDemandsPage])

  useEffect(() => {
    loadDemandAgentOptions()
  }, [loadDemandAgentOptions])

  const openCreateModal = () => {
    if (!canCreateInCurrentPage) return
    setEditingDemand(null)
    setModalOpen(true)
    form.resetFields()
    const defaultOwnerId = currentUser?.id || undefined
    previousCreateOwnerIdRef.current = defaultOwnerId ?? null
    form.setFieldsValue({
      owner_user_id: defaultOwnerId,
      template_id: defaultProjectTemplateId,
      participant_roles: DEFAULT_DEMAND_PARTICIPANT_ROLES,
      project_manager: defaultOwnerId,
      health_status: 'green',
      actual_start_time: dayjs(),
      actual_end_time: null,
      doc_link: '',
      ui_design_link: '',
      test_case_link: '',
      business_group_code: undefined,
      expected_release_date: null,
      status: 'TODO',
      priority: 'P1',
    })
  }

  const openEditModal = useCallback((record) => {
    if (!canEditDemandRecord(record)) {
      message.warning('仅需求负责人或管理员可编辑该需求')
      return
    }
    setEditingDemand(record)
    setModalOpen(true)
    previousCreateOwnerIdRef.current = null
    form.resetFields()
    form.setFieldsValue({
      name: record.name,
      owner_user_id: record.owner_user_id,
      template_id: record.template_id ? Number(record.template_id) : defaultProjectTemplateId,
      participant_roles:
        Array.isArray(record.participant_roles) && record.participant_roles.length > 0
          ? record.participant_roles
          : DEFAULT_DEMAND_PARTICIPANT_ROLES,
      project_manager: record.project_manager ? Number(record.project_manager) : undefined,
      health_status: record.health_status || 'green',
      actual_start_time: toNullableDateTimeValue(record.actual_start_time),
      actual_end_time: toNullableDateTimeValue(record.actual_end_time),
      doc_link: record.doc_link || '',
      ui_design_link: record.ui_design_link || '',
      test_case_link: record.test_case_link || '',
      business_group_code: record.business_group_code || undefined,
      expected_release_date: record.expected_release_date ? dayjs(record.expected_release_date) : null,
      status: record.status,
      priority: record.priority,
      description: record.description || '',
    })
  }, [canEditDemandRecord, defaultProjectTemplateId, form])

  const closeModal = () => {
    setModalOpen(false)
    setEditingDemand(null)
    previousCreateOwnerIdRef.current = null
    form.resetFields()
  }

  useEffect(() => {
    if (!modalOpen || editingDemand) return
    const nextOwnerId = Number(modalOwnerUserId)
    const currentProjectManagerId = Number(modalProjectManager)
    const previousOwnerId = Number(previousCreateOwnerIdRef.current)
    const hasNextOwner = Number.isInteger(nextOwnerId) && nextOwnerId > 0
    const hasCurrentProjectManager = Number.isInteger(currentProjectManagerId) && currentProjectManagerId > 0
    const shouldSyncProjectManager =
      !hasCurrentProjectManager ||
      (Number.isInteger(previousOwnerId) && previousOwnerId > 0 && currentProjectManagerId === previousOwnerId)

    previousCreateOwnerIdRef.current = hasNextOwner ? nextOwnerId : null

    if (!shouldSyncProjectManager) return

    form.setFieldValue('project_manager', hasNextOwner ? nextOwnerId : undefined)
  }, [modalOpen, editingDemand, modalOwnerUserId, modalProjectManager, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!editingDemand && !canCreateInCurrentPage) {
        message.warning('我的需求页面不支持新建需求，请前往需求池创建。')
        return
      }
      if (values.template_id && selectedModalTemplateNodes.length === 0) {
        message.warning('当前参与角色未命中模板节点，请调整参与角色或模板配置')
        return
      }
      setSubmitting(true)

      const payload = {
        name: values.name,
        management_mode: 'advanced',
        template_id: values.template_id,
        participant_roles: normalizeParticipantRoles(values.participant_roles),
        project_manager: values.project_manager ?? null,
        health_status: values.health_status || 'green',
        actual_start_time: values.actual_start_time ? values.actual_start_time.format('YYYY-MM-DD') : null,
        actual_end_time: values.actual_end_time ? values.actual_end_time.format('YYYY-MM-DD') : null,
        doc_link: values.doc_link || null,
        ui_design_link: values.ui_design_link || null,
        test_case_link: values.test_case_link || null,
        business_group_code: values.business_group_code ?? null,
        expected_release_date: values.expected_release_date ? values.expected_release_date.format('YYYY-MM-DD') : null,
        status: values.status,
        priority: values.priority,
        description: values.description || '',
      }
      if (!editingDemand || canTransferOwner) {
        payload.owner_user_id = values.owner_user_id
      }

      const result = editingDemand
        ? await updateWorkDemandApi(editingDemand.id, payload)
        : await createWorkDemandApi(payload)

      if (!result?.success) {
        message.error(result?.message || (editingDemand ? '更新失败' : '创建失败'))
        return
      }

      message.success(editingDemand ? '需求更新成功' : '需求创建成功')
      closeModal()
      loadDemands()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '提交失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const fetchDemandRelatedLogs = useCallback(
    async (demandId) => {
      if (!demandId || !canViewSelfLogs) {
        setDetailLogs([])
        return
      }

      setDetailLogsLoading(true)
      try {
        const params = {
          page: 1,
          pageSize: 200,
          demand_id: demandId,
        }
        if (canViewTeamLogs) {
          params.scope = 'team'
        }

        const result = await getWorkLogsApi(params)
        if (result?.success) {
          setDetailLogs(result.data?.list || [])
        } else {
          setDetailLogs([])
        }
      } catch {
        setDetailLogs([])
      } finally {
        setDetailLogsLoading(false)
      }
    },
    [canViewSelfLogs, canViewTeamLogs],
  )

  const loadDemandWorkflow = useCallback(
    async (demandId) => {
      if (!demandId || !canViewWorkflow) {
        setWorkflowData(null)
        setWorkflowWarning('')
        return
      }

      setWorkflowLoading(true)
      setWorkflowWarning('')
      try {
        let result = await getDemandWorkflowApi(demandId)
        if (!result?.success && canManageWorkflow) {
          const initResult = await initDemandWorkflowApi(demandId)
          if (initResult?.success) {
            result = await getDemandWorkflowApi(demandId)
          }
        }

        if (!result?.success) {
          setWorkflowData(null)
          setWorkflowWarning(result?.message || '流程加载失败')
          setSelectedWorkflowNodeKey('')
          return
        }

        const workflow = result.data || null
        setWorkflowData(workflow)
        const firstCurrentNode = Array.isArray(workflow?.current_nodes) ? workflow.current_nodes[0] : null
        const currentNode = firstCurrentNode || workflow?.current_node || null
        setSelectedWorkflowNodeKey(currentNode?.node_key || workflow?.nodes?.[0]?.node_key || '')
      } catch (error) {
        setWorkflowData(null)
        setWorkflowWarning(error?.message || '流程加载失败')
        setSelectedWorkflowNodeKey('')
      } finally {
        setWorkflowLoading(false)
      }
    },
    [canManageWorkflow, canViewWorkflow],
  )

  const openDetailDrawer = useCallback(
    (record) => {
      if (!record?.id) return
      navigate(`${listBasePath}/${record.id}`)
    },
    [listBasePath, navigate],
  )

  const closeDetailDrawer = useCallback(() => {
    setDetailDemand(null)
    setDetailLogs([])
    setDetailLogFilter('ALL')
    setDetailName('')
    setDetailTemplateId(undefined)
    setDetailParticipantRoles(DEFAULT_DEMAND_PARTICIPANT_ROLES)
    setDetailProjectManager(undefined)
    setDetailBusinessGroupCode(undefined)
    setDetailHealthStatus('green')
    setDetailActualStartTime(null)
    setDetailActualEndTime(null)
    setDetailExpectedReleaseDate(null)
    setDetailDocLink('')
    setDetailUiDesignLink('')
    setDetailTestCaseLink('')
    setDetailTabKey('basic')
    setWorkflowData(null)
    setWorkflowWarning('')
    setSelectedWorkflowNodeKey('')
    setWorkflowParticipantUserIds([])
    setWorkflowDueAt(null)
    setWorkflowExpectedStartAt(null)
    navigate(listBasePath)
  }, [listBasePath, navigate])

  useEffect(() => {
    if (!isDetailPage || !routeDemandId) return

    let active = true
    const loadDetailByRoute = async () => {
      setDetailPageLoading(true)
      setDetailLogFilter('ALL')
      try {
        const result = await getWorkDemandByIdApi(routeDemandId)
        if (!active) return
        if (!result?.success || !result?.data) {
          message.error(result?.message || '需求详情加载失败')
          navigate(listBasePath, { replace: true })
          return
        }

        const demand = result.data
        setDetailDemand(demand)
        fetchDemandRelatedLogs(demand.id)
        loadDemandWorkflow(demand.id)
      } catch (error) {
        if (!active) return
        message.error(error?.message || '需求详情加载失败')
        navigate(listBasePath, { replace: true })
      } finally {
        if (active) setDetailPageLoading(false)
      }
    }

    loadDetailByRoute()
    return () => {
      active = false
    }
  }, [
    isDetailPage,
    routeDemandId,
    canEditDemandRecord,
    fetchDemandRelatedLogs,
    listBasePath,
    loadDemandWorkflow,
    navigate,
  ])

  useEffect(() => {
    if (isDetailPage) return
    setDetailPageLoading(false)
    setDetailDemand(null)
    setDetailLogs([])
    setDetailLogFilter('ALL')
    setDetailName('')
    setDetailTemplateId(undefined)
    setDetailParticipantRoles(DEFAULT_DEMAND_PARTICIPANT_ROLES)
    setDetailProjectManager(undefined)
    setDetailBusinessGroupCode(undefined)
    setDetailHealthStatus('green')
    setDetailActualStartTime(null)
    setDetailActualEndTime(null)
    setDetailExpectedReleaseDate(null)
    setDetailDocLink('')
    setDetailUiDesignLink('')
    setDetailTestCaseLink('')
    setDetailTabKey('basic')
    setWorkflowData(null)
    setWorkflowWarning('')
    setSelectedWorkflowNodeKey('')
    setWorkflowParticipantUserIds([])
    setWorkflowDueAt(null)
    setWorkflowExpectedStartAt(null)
  }, [isDetailPage])

  useEffect(() => {
    if (!selectedWorkflowNode) {
      selectedWorkflowNodeKeyRef.current = ''
      setWorkflowParticipantUserIds([])
      setWorkflowDueAt(null)
      setWorkflowExpectedStartAt(null)
      return
    }
    const normalizedNodeKey = String(selectedWorkflowNode.node_key || '').trim().toUpperCase()
    const persistedExpectedStartAt = selectedWorkflowNode.planned_start_time || selectedWorkflowNode.expected_start_date || selectedWorkflowNode.expected_start_at
    if (selectedWorkflowNode.assignee_user_id) {
      setWorkflowParticipantUserIds([Number(selectedWorkflowNode.assignee_user_id)])
    } else {
      setWorkflowParticipantUserIds([])
    }
    setWorkflowDueAt(selectedWorkflowNode.planned_end_time ? dayjs(selectedWorkflowNode.planned_end_time) : null)
    setWorkflowExpectedStartAt((previousValue) => {
      if (persistedExpectedStartAt) {
        return dayjs(persistedExpectedStartAt)
      }
      return selectedWorkflowNodeKeyRef.current === normalizedNodeKey ? previousValue : null
    })
    selectedWorkflowNodeKeyRef.current = normalizedNodeKey
  }, [selectedWorkflowNode])

  useEffect(() => {
    if (!requestedWorkflowNodeKey) return
    const nodes = Array.isArray(workflowData?.nodes) ? workflowData.nodes : []
    const matched = nodes.find(
      (item) => String(item?.node_key || '').trim().toUpperCase() === requestedWorkflowNodeKey,
    )
    if (matched?.node_key) {
      setSelectedWorkflowNodeKey(matched.node_key)
    }
  }, [requestedWorkflowNodeKey, workflowData])

  useEffect(() => {
    if (!isDetailPage) return
    if (!detailDemand) {
      setDetailStatus('')
      setDetailName('')
      setDetailTemplateId(undefined)
      setDetailParticipantRoles(['DEMAND_OWNER'])
      setDetailProjectManager(undefined)
      setDetailBusinessGroupCode(undefined)
      setDetailHealthStatus('green')
      setDetailActualStartTime(null)
      setDetailActualEndTime(null)
      setDetailExpectedReleaseDate(null)
      setDetailDocLink('')
      setDetailUiDesignLink('')
      setDetailTestCaseLink('')
      return
    }
    setDetailName(detailDemand.name || '')
    setDetailTemplateId(detailDemand.template_id ? Number(detailDemand.template_id) : defaultProjectTemplateId)
    setDetailParticipantRoles(
      Array.isArray(detailDemand.participant_roles) && detailDemand.participant_roles.length > 0
        ? detailDemand.participant_roles
        : DEFAULT_DEMAND_PARTICIPANT_ROLES,
    )
    setDetailProjectManager(detailDemand.project_manager ? Number(detailDemand.project_manager) : undefined)
    setDetailBusinessGroupCode(detailDemand.business_group_code || undefined)
    setDetailHealthStatus(detailDemand.health_status || 'green')
    setDetailActualStartTime(toNullableDateTimeValue(detailDemand.actual_start_time))
    setDetailActualEndTime(toNullableDateTimeValue(detailDemand.actual_end_time))
    setDetailExpectedReleaseDate(detailDemand.expected_release_date ? dayjs(detailDemand.expected_release_date) : null)
    setDetailDocLink(detailDemand.doc_link || '')
    setDetailUiDesignLink(detailDemand.ui_design_link || '')
    setDetailTestCaseLink(detailDemand.test_case_link || '')

    if (!canEditDemandRecord(detailDemand)) {
      setDetailStatus('')
      return
    }
    setDetailStatus(detailDemand.status || 'TODO')
  }, [isDetailPage, detailDemand, canEditDemandRecord, defaultProjectTemplateId])

  const refreshListAndDetail = useCallback(async (nextDetail) => {
    if (!isDetailPage) {
      await loadDemands()
    }
    if (!nextDetail && !detailDemand) return
    const mergedDetail = {
      ...(detailDemand || {}),
      ...(nextDetail || {}),
    }
    setDetailDemand(mergedDetail)
    fetchDemandRelatedLogs(mergedDetail.id)
    loadDemandWorkflow(mergedDetail.id)
  }, [isDetailPage, loadDemands, detailDemand, fetchDemandRelatedLogs, loadDemandWorkflow])

  const handleQuickStatusUpdate = useCallback(async (record, nextStatus) => {
    if (!record?.id || !canEditDemandRecord(record)) return
    try {
      const result = await updateWorkDemandApi(record.id, {
        status: nextStatus,
      })
      if (!result?.success) {
        message.error(result?.message || '状态更新失败')
        return
      }
      message.success(nextStatus === 'DONE' ? '需求已完成' : '需求已重开')
      await refreshListAndDetail(result?.data || null)
    } catch (error) {
      message.error(error?.message || '状态更新失败')
    }
  }, [canEditDemandRecord, refreshListAndDetail])

  const handleSaveDetail = async () => {
    if (!detailDemand?.id || !canEditDemandRecord(detailDemand)) return
    const nextName = String(detailName || '').trim()
    if (!nextName) {
      message.warning('需求名称不能为空')
      return
    }
    if (!detailTemplateId) {
      message.warning('请选择需求模板')
      return
    }
    const nextStatus = String(detailStatus || detailDemand.status || '').trim()
    if (!nextStatus) {
      message.warning('请选择状态')
      return
    }
    const normalizedDetailParticipantRoles = normalizeParticipantRoles(detailParticipantRoles)
    if (normalizedDetailParticipantRoles.length === 0) {
      message.warning('请选择需求涉及角色')
      return
    }
    if (detailActualStartTime && detailActualEndTime && detailActualStartTime.isAfter(detailActualEndTime)) {
      message.warning('实际开始时间不能晚于实际结束时间')
      return
    }
    try {
      setDetailSaving(true)
      const result = await updateWorkDemandApi(detailDemand.id, {
        name: nextName,
        status: nextStatus,
        management_mode: 'advanced',
        template_id: detailTemplateId,
        participant_roles: normalizedDetailParticipantRoles,
        project_manager: detailProjectManager ?? null,
        business_group_code: detailBusinessGroupCode ?? null,
        health_status: detailHealthStatus || 'green',
        actual_start_time: detailActualStartTime ? detailActualStartTime.format('YYYY-MM-DD HH:mm:ss') : null,
        actual_end_time: detailActualEndTime ? detailActualEndTime.format('YYYY-MM-DD HH:mm:ss') : null,
        expected_release_date: detailExpectedReleaseDate ? detailExpectedReleaseDate.format('YYYY-MM-DD') : null,
        doc_link: detailDocLink || null,
        ui_design_link: detailUiDesignLink || null,
        test_case_link: detailTestCaseLink || null,
      })
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      if (result?.data?.workflow_auto_replaced) {
        message.success('需求信息已更新，流程已自动同步')
      } else if (result?.data?.workflow_sync_notice) {
        message.success('需求信息已更新')
        message.warning(result.data.workflow_sync_notice)
      } else {
        message.success('需求信息已更新')
      }
      await refreshListAndDetail(result?.data || null)
    } catch (error) {
      message.error(error?.message || '保存失败')
    } finally {
      setDetailSaving(false)
    }
  }

  const handleAssignWorkflowNode = async (overrides = {}, options = {}) => {
    if (!detailDemand?.id || !canManageWorkflow) return false
    if (!selectedWorkflowNode?.node_key) {
      if (!options.silent) {
        message.warning('请先选择流程节点')
      }
      return false
    }
    if (!canAssignSelectedWorkflowNode) {
      if (!options.silent) {
        message.warning('已完成或已取消的节点不支持指派')
      }
      return false
    }
    const requestedAssigneeUserIds = Array.isArray(overrides.assignee_user_ids)
      ? overrides.assignee_user_ids
      : workflowParticipantUserIds
    const nextAssigneeUserIds = Array.from(
      new Set(
        (requestedAssigneeUserIds.length > 0 ? requestedAssigneeUserIds : selectedWorkflowNodeAssigneeIds)
          .map((item) => Number(item))
          .filter((userId) => Number.isInteger(userId) && userId > 0),
      ),
    ).slice(0, 1)

    if (nextAssigneeUserIds.length === 0) {
      if (!options.skipMissingAssigneeWarning) {
        message.warning('请选择节点负责人')
      }
      return false
    }

    try {
      setWorkflowSubmitting(true)
      const result = await assignDemandWorkflowNodeApi(detailDemand.id, selectedWorkflowNode.node_key, {
        assignee_user_id: nextAssigneeUserIds[0],
      })
      if (!result?.success) {
        message.error(result?.message || '节点负责人保存失败')
        return false
      }
      setWorkflowData(result.data || null)
      setSelectedWorkflowNodeKey(selectedWorkflowNode.node_key)
      if (!options.silent) {
        message.success(result?.message || '节点负责人已更新')
      }
      return true
    } catch (error) {
      message.error(error?.message || '节点负责人保存失败')
      return false
    } finally {
      setWorkflowSubmitting(false)
    }
  }

  const handleSaveWorkflowNodeSchedule = async (payload = {}) => {
    if (!detailDemand?.id || !canManageWorkflow || !selectedWorkflowNode?.node_key) return false
    const nextPayload = {}
    if (payload.planned_start_time !== undefined) {
      nextPayload.planned_start_time = payload.planned_start_time
        ? payload.planned_start_time.format('YYYY-MM-DD')
        : null
    }
    if (payload.planned_end_time !== undefined) {
      nextPayload.planned_end_time = payload.planned_end_time
        ? payload.planned_end_time.format('YYYY-MM-DD')
        : null
    }
    if (Object.keys(nextPayload).length === 0) return false

    try {
      setWorkflowSubmitting(true)
      const result = await updateDemandWorkflowNodeHoursApi(
        detailDemand.id,
        selectedWorkflowNode.node_key,
        nextPayload,
      )
      if (!result?.success) {
        message.error(result?.message || '节点排期保存失败')
        return false
      }
      setWorkflowData(result.data || null)
      setSelectedWorkflowNodeKey(selectedWorkflowNode.node_key)
      return true
    } catch (error) {
      message.error(error?.message || '节点排期保存失败')
      return false
    } finally {
      setWorkflowSubmitting(false)
    }
  }

  const handleCreateWorkflowQuickTask = async (payload = {}) => {
    if (!detailDemand?.id || !canManageWorkflow) return false
    if (!selectedWorkflowNode?.node_key) {
      message.warning('请先选择流程节点')
      return false
    }
    if (!canAssignSelectedWorkflowNode) {
      message.warning('当前节点不支持新增任务')
      return false
    }

    const taskTitle = String(payload.task_title || '').trim()
    const assigneeUserId = Number(payload.assignee_user_id)
    const expectedStartDate = String(payload.expected_start_date || '').trim()
    const expectedCompletionDate = String(payload.expected_completion_date || '').trim()

    if (!taskTitle) {
      message.warning('请输入任务标题')
      return false
    }
    if (!Number.isInteger(assigneeUserId) || assigneeUserId <= 0) {
      message.warning('请选择执行人')
      return false
    }
    if (!expectedStartDate || !expectedCompletionDate) {
      message.warning('请选择预期开始和结束时间')
      return false
    }

    try {
      setWorkflowQuickTaskSubmitting(true)
      const result = await createOwnerAssignedLogApi({
        create_scene: 'DEMAND_NODE_QUICK_ADD',
        assignee_user_id: assigneeUserId,
        description: taskTitle,
        demand_id: detailDemand.id,
        phase_key: selectedWorkflowNode.node_key || selectedWorkflowNode.phase_key,
        expected_start_date: expectedStartDate,
        expected_completion_date: expectedCompletionDate,
        log_date: expectedStartDate,
      })
      if (!result?.success) {
        message.error(result?.message || '任务创建失败')
        return false
      }
      await fetchDemandRelatedLogs(detailDemand.id)
      message.success('任务已创建')
      return true
    } catch (error) {
      message.error(error?.message || '任务创建失败')
      return false
    } finally {
      setWorkflowQuickTaskSubmitting(false)
    }
  }

  const handleSubmitWorkflowNode = async () => {
    if (!detailDemand?.id || !canManageWorkflow) return
    if (!selectedWorkflowNode?.node_key) {
      message.warning('请先选择流程节点')
      return
    }
    if (!isSelectedCurrentWorkflowNode) {
      message.warning('当前仅激活中的节点支持提交')
      return
    }

    try {
      setWorkflowSubmitting(true)
      const result = await submitDemandWorkflowNodeApi(detailDemand.id, selectedWorkflowNode.node_key, {})
      if (!result?.success) {
        message.error(result?.message || '节点提交失败')
        return
      }
      message.success(result?.message || '节点已提交')
      setWorkflowData(result.data || null)
      await refreshListAndDetail()
    } catch (error) {
      message.error(error?.message || '节点提交失败')
    } finally {
      setWorkflowSubmitting(false)
    }
  }

  const handleUpdateWorkflowTask = async (taskId, payload = {}) => {
    if (!detailDemand?.id || !taskId) return false
    const selectedTask = (selectedWorkflowNodeTasks || []).find((item) => String(item?.id) === String(taskId))
    const isManualLogTask = String(selectedTask?.source_type || '').trim().toUpperCase() === 'MANUAL_LOG'
    const manualLogId = Number(selectedTask?.source_id)
    const canEditManualLogTask =
      isManualLogTask &&
      Number(selectedTask?.assignee_user_id) > 0 &&
      Number(selectedTask?.assignee_user_id) === Number(currentUser?.id)

    if (!isManualLogTask && !canManageWorkflow) return false
    if (isManualLogTask && !canEditManualLogTask) {
      message.warning('仅事项执行人可编辑该工作台事项')
      return false
    }

    if (!isManualLogTask && !isSelectedCurrentWorkflowNode) {
      message.warning('仅当前激活节点的子任务支持编辑')
      return false
    }

    const nextPayload = {}
    if (payload.personal_estimated_hours !== undefined) {
      nextPayload.personal_estimated_hours = payload.personal_estimated_hours
    }
    if (payload.expected_start_date !== undefined) {
      nextPayload.expected_start_date = payload.expected_start_date
    }
    if (payload.expected_completion_date !== undefined) {
      nextPayload.expected_completion_date = payload.expected_completion_date
    }
    if (payload.deadline !== undefined) {
      nextPayload.deadline = payload.deadline
    }

    if (Object.keys(nextPayload).length === 0) return false

    try {
      setWorkflowTaskUpdatingId(taskId)
      const result = isManualLogTask
        ? await updateWorkLogApi(manualLogId, nextPayload)
        : await updateDemandWorkflowTaskHoursApi(detailDemand.id, taskId, nextPayload)
      if (!result?.success) {
        message.error(result?.message || '子任务更新失败')
        return false
      }
      if (isManualLogTask) {
        await fetchDemandRelatedLogs(detailDemand.id)
      } else {
        setWorkflowData(result.data || null)
        if (selectedWorkflowNode?.node_key) {
          setSelectedWorkflowNodeKey(selectedWorkflowNode.node_key)
        }
      }
      message.success('子任务已更新')
      return true
    } catch (error) {
      message.error(error?.message || '子任务更新失败')
      return false
    } finally {
      setWorkflowTaskUpdatingId(null)
    }
  }

  const handleReplaceWorkflowLatest = async () => {
    if (!detailDemand?.id || !canForceReplaceWorkflow) return

    try {
      setWorkflowReplacing(true)
      const result = await replaceDemandWorkflowLatestApi(detailDemand.id, {})
      if (!result?.success) {
        message.error(result?.message || '强制替换流程失败')
        return
      }

      const migrationSummary = result?.data?.migration_summary || null
      if (migrationSummary) {
        const migratedCount = Number(migrationSummary?.migrated_done_node_count || 0)
        const unmatchedCount = Number(migrationSummary?.unmatched_done_node_count || 0)
        if (unmatchedCount > 0) {
          message.success(`${result?.message || '已替换为最新流程模板'}，已继承 ${migratedCount} 个已完成节点`)
          message.warning(`另有 ${unmatchedCount} 个历史已完成节点未能自动继承，个人事项与工作台数据不会删除`)
        } else {
          message.success(`${result?.message || '已替换为最新流程模板'}，已继承 ${migratedCount} 个已完成节点`)
        }
      } else {
        message.success(result?.message || '已替换为最新流程模板')
      }
      const workflow = result?.data?.workflow || null
      setWorkflowData(workflow)
      setSelectedWorkflowNodeKey(
        workflow?.current_nodes?.[0]?.node_key || workflow?.current_node?.node_key || workflow?.nodes?.[0]?.node_key || '',
      )
      await refreshListAndDetail()
    } catch (error) {
      message.error(error?.message || '强制替换流程失败')
    } finally {
      setWorkflowReplacing(false)
    }
  }

  const handleConfirmReplaceWorkflowLatest = () => {
    if (!detailDemand?.id || !canForceReplaceWorkflow) return

    Modal.confirm({
      title: '确认强制替换为最新流程？',
      content:
        '系统会按当前绑定的最新模板重建流程；可识别的已完成节点会尽量保留完成状态。历史个人事项、工作台记录与工时数据不会删除，但部分早期缺少 node_key 的节点可能无法完整继承。',
      okText: '确认替换',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
        loading: workflowReplacing,
      },
      onOk: handleReplaceWorkflowLatest,
    })
  }

  const handleDeleteDemand = useCallback(async (record) => {
    if (!record?.id || !canTransferOwner) return
    try {
      const result = await deleteWorkDemandApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除需求失败')
        return
      }
      message.success(result?.message || '需求已删除')
      if (detailDemand?.id === record.id) {
        closeDetailDrawer()
      }
      loadDemands()
    } catch (error) {
      message.error(error?.message || '删除需求失败')
    }
  }, [canTransferOwner, closeDetailDrawer, detailDemand?.id, loadDemands])

  const handleResetFilters = () => {
    setKeyword('')
    setKeywordInput('')
    setStatusFilter('')
    setPriorityFilter('')
    setPrioritySortOrder(undefined)
    setBusinessGroupFilter('')
    setBusinessGroupAllCount(0)
    setBusinessGroupCounts([])
    setOwnerFilter(undefined)
    setUpdatedRange([])
    setScopeFilter('all')
    setPage(1)
  }

  const selectedDemandAgentOption = useMemo(
    () => agentOptions.find((item) => Number(item?.id) === Number(selectedAgentId)) || null,
    [agentOptions, selectedAgentId],
  )

  const currentDemandPoolContextParams = useMemo(() => {
    const activeTabLabel =
      businessGroupTabItems.find((item) => item.key === activeDemandTabKey)?.label || '全部'
    const selectedBusinessGroupLabel =
      businessGroupOptions.find((item) => String(item.value || '') === String(businessGroupFilter || ''))?.label || ''
    const selectedOwnerLabel =
      ownerOptions.find((item) => Number(item.value) === Number(ownerFilter))?.label || ''

    return {
      keyword: keyword.trim(),
      status: showCompletedTabOnly ? 'DONE' : showCancelledTabOnly ? 'CANCELLED' : statusFilter,
      priority: priorityFilter,
      priority_order: prioritySortOrder === 'ascend' ? 'asc' : prioritySortOrder === 'descend' ? 'desc' : '',
      business_group_code: businessGroupFilter,
      business_group_label: selectedBusinessGroupLabel,
      owner_user_id: ownerFilter || null,
      owner_label: selectedOwnerLabel,
      updated_start_date:
        Array.isArray(updatedRange) && updatedRange[0] ? updatedRange[0].format('YYYY-MM-DD') : '',
      updated_end_date:
        Array.isArray(updatedRange) && updatedRange[1] ? updatedRange[1].format('YYYY-MM-DD') : '',
      updated_range_label:
        Array.isArray(updatedRange) && updatedRange[0] && updatedRange[1]
          ? `${updatedRange[0].format('YYYY-MM-DD')} ~ ${updatedRange[1].format('YYYY-MM-DD')}`
          : '',
      mine: scopeFilter === 'mine',
      scope_label: scopeFilter === 'mine' ? '我负责/参与' : '全部需求',
      completed_only: showCompletedTabOnly,
      cancelled_only: showCancelledTabOnly,
      exclude_completed: !showCompletedTabOnly && !showCancelledTabOnly,
      exclude_cancelled: !showCompletedTabOnly && !showCancelledTabOnly,
      active_tab_key: activeDemandTabKey,
      active_tab_label: activeTabLabel,
      compact_view: compactView,
    }
  }, [
    activeDemandTabKey,
    businessGroupFilter,
    businessGroupOptions,
    businessGroupTabItems,
    compactView,
    keyword,
    ownerFilter,
    ownerOptions,
    priorityFilter,
    prioritySortOrder,
    scopeFilter,
    showCancelledTabOnly,
    showCompletedTabOnly,
    statusFilter,
    updatedRange,
  ])

  const handleExecuteDemandAnalysis = useCallback(async () => {
    if (!selectedAgentId) {
      message.warning('请先选择一个 Agent')
      return
    }

    try {
      setAnalysisExecuting(true)
      const result = await executeAgentApi({
        scene_code: DEMAND_POOL_AGENT_SCENE,
        agent_id: selectedAgentId,
        context_params: currentDemandPoolContextParams,
      })
      if (!result?.success) {
        message.error(result?.message || '执行需求池分析失败')
        return
      }
      setAnalysisResult({
        ...(result?.data || {}),
        agent_label: selectedDemandAgentOption?.agent_name || result?.data?.agent_name || '',
        scope_label: currentDemandPoolContextParams.active_tab_label || '当前筛选范围',
      })
      message.success('需求池分析已生成')
    } catch (error) {
      message.error(error?.message || '执行需求池分析失败')
    } finally {
      setAnalysisExecuting(false)
    }
  }, [currentDemandPoolContextParams, selectedAgentId, selectedDemandAgentOption])

  const handleCopyDemandAnalysis = useCallback(async () => {
    const text = String(analysisResult?.response_text || '').trim()
    if (!text) {
      message.warning('当前没有可复制的分析结果')
      return
    }
    if (!navigator?.clipboard?.writeText) {
      message.error('当前浏览器不支持复制')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      message.success('分析结果已复制')
    } catch (error) {
      message.error(error?.message || '复制失败')
    }
  }, [analysisResult?.response_text])

  const demandColumns = useMemo(() => {
    const columns = [
      {
        title: '需求ID',
        dataIndex: 'id',
        key: 'id',
        width: 110,
        fixed: 'left',
        render: (value, record) => (record?.__group ? null : <Tag color="blue">{value}</Tag>),
      },
      {
        title: '需求名称',
        dataIndex: 'name',
        key: 'name',
        width: 260,
        fixed: 'left',
        ellipsis: true,
        render: (value, record) => (
          record?.__group ? (
            <Space size={8}>
              <Tag color={getDemandPhaseTagColor(record?.current_phase_key, record?.current_phase_name)}>
                {record?.current_phase_name || '未开始'}
              </Tag>
              <Text strong>{Number(record?.children?.length || 0)} 条需求</Text>
            </Space>
          ) : (
            <Button type="link" style={{ padding: 0 }} onClick={() => openDetailDrawer(record)}>
              <Text strong>{value}</Text>
            </Button>
          )
        ),
      },
      {
        title: '需求负责人',
        dataIndex: 'owner_name',
        key: 'owner_name',
        width: 120,
        render: (value, record) => (record?.__group ? null : value || '-'),
      },
      {
        title: '业务组',
        dataIndex: 'business_group_name',
        key: 'business_group_name',
        width: 150,
        render: (_, record) =>
          record?.__group ? null : record.business_group_name || record.business_group_code || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value, record) =>
          record?.__group ? null : <Tag color={getStatusTagColor(value)}>{getStatusLabel(value)}</Tag>,
      },
      {
        title: '需求阶段',
        dataIndex: 'current_phase_name',
        key: 'current_phase_name',
        width: 150,
        ellipsis: true,
        render: (value, record) =>
          record?.__group ? null : value ? (
            <Tag color={getDemandPhaseTagColor(record?.current_phase_key, value)} style={{ fontWeight: 600 }}>
              {value}
            </Tag>
          ) : (
            <Tag>未开始</Tag>
          ),
      },
      {
        title: '当前进行中节点',
        dataIndex: 'current_node_name',
        key: 'current_node_name',
        width: 190,
        ellipsis: true,
        render: (_, record) => (record?.__group ? null : record?.current_node_name || record?.current_phase_name || '未开始'),
      },
      {
        title: '节点排期',
        key: 'current_node_schedule',
        width: 190,
        ellipsis: true,
        render: (_, record) => (record?.__group ? null : formatDemandNodeSchedule(record)),
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        key: 'priority',
        width: 100,
        sorter: true,
        sortOrder: prioritySortOrder,
        sortDirections: ['ascend', 'descend'],
        render: (value, record) => (record?.__group ? null : <Tag color={getPriorityColor(value)}>{value}</Tag>),
      },
      {
        title: '预期上线时间',
        dataIndex: 'expected_release_date',
        key: 'expected_release_date',
        width: 130,
        render: (value, record) => (record?.__group ? null : formatBeijingDate(value)),
      },
    ]

    if (!compactView) {
      columns.push(
        {
          title: '成员数',
          dataIndex: 'member_count',
          key: 'member_count',
          width: 90,
          render: (value, record) => (record?.__group ? null : Number(value || 0)),
        },
        {
          title: '整体用时(h)',
          dataIndex: 'total_actual_hours',
          key: 'total_actual_hours',
          width: 120,
          render: (value, record) => (record?.__group ? null : toNumber(value, 0).toFixed(1)),
        },
        {
          title: '最近更新',
          dataIndex: 'updated_at',
          key: 'updated_at',
          width: 160,
          render: (value, record) => (record?.__group ? null : formatBeijingDateTime(value)),
        },
        {
          title: '实际完成日期',
          dataIndex: 'completed_at',
          key: 'completed_at',
          width: 120,
          render: (value, record) => (record?.__group ? null : formatBeijingDate(value)),
        },
      )
    }

    columns.push({
      title: '操作',
      key: 'action',
      width: canTransferOwner ? 280 : 180,
      fixed: 'right',
      render: (_, record) => (record?.__group ? null : (
        <Space size={2}>
          <Button type="link" onClick={() => openDetailDrawer(record)}>
            详情
          </Button>
          {canEditDemandRecord(record) ? (
            <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              编辑
            </Button>
          ) : null}
          {canEditDemandRecord(record) ? (
            record.status === 'DONE' || record.status === 'CANCELLED' ? (
              <Popconfirm
                title="确认重开该需求？"
                okText="重开"
                cancelText="取消"
                onConfirm={() => handleQuickStatusUpdate(record, 'IN_PROGRESS')}
              >
                <Button type="link">重开</Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="确认标记为已完成？"
                okText="完成"
                cancelText="取消"
                onConfirm={() => handleQuickStatusUpdate(record, 'DONE')}
              >
                <Button type="link">完成</Button>
              </Popconfirm>
            )
          ) : null}
          {canTransferOwner ? (
            <Popconfirm
              title="确认删除该需求？"
              description="若已有关联事项，将自动归档而不是物理删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDeleteDemand(record)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      )),
    })

    return columns
  }, [
    canTransferOwner,
    compactView,
    prioritySortOrder,
    openDetailDrawer,
    openEditModal,
    canEditDemandRecord,
    handleQuickStatusUpdate,
    handleDeleteDemand,
  ])

  return (
    <div style={{ padding: 12 }}>
      {!isDetailPage ? (
        <>
          <Card
            variant="borderless"
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadDemands} loading={loading}>
                  刷新
                </Button>
                {canCreateInCurrentPage ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    新建需求
                  </Button>
                ) : null}
              </Space>
            }
          >
            {isMyDemandsPage ? (
              <Tabs
                activeKey={myDemandTabKey}
                items={myDemandTabItems}
                onChange={(activeKey) => {
                  setMyDemandTabKey(activeKey === 'participated' ? 'participated' : 'owned')
                  setPage(1)
                }}
              />
            ) : null}
            <Tabs
              activeKey={activeDemandTabKey}
              items={businessGroupTabItems}
              onChange={(activeKey) => {
                if (activeKey === '__DONE__') {
                  setShowCompletedTabOnly(true)
                  setShowCancelledTabOnly(false)
                  setBusinessGroupFilter('')
                  setStatusFilter('')
                } else if (activeKey === '__CANCELLED__') {
                  setShowCompletedTabOnly(false)
                  setShowCancelledTabOnly(true)
                  setBusinessGroupFilter('')
                  setStatusFilter('')
                } else {
                  setShowCompletedTabOnly(false)
                  setShowCancelledTabOnly(false)
                  setBusinessGroupFilter(activeKey === '__ALL__' ? '' : activeKey)
                  if (statusFilter === 'DONE' || statusFilter === 'CANCELLED') {
                    setStatusFilter('')
                  }
                }
                setPage(1)
              }}
            />
            <Space wrap>
              <Search
                allowClear
                placeholder="搜索需求ID或名称"
                enterButton={<SearchOutlined />}
                value={keywordInput}
                onChange={(e) => {
                  const nextValue = e.target.value
                  setKeywordInput(nextValue)
                  if (!nextValue) {
                    setKeyword('')
                    setPage(1)
                  }
                }}
                onSearch={(value) => {
                  setKeyword(value)
                  setKeywordInput(value)
                  setPage(1)
                }}
                style={{ width: 280 }}
              />
              <Select
                allowClear
                style={{ width: 140 }}
                placeholder="状态"
                options={demandStatusOptions}
                value={showCompletedTabOnly ? 'DONE' : showCancelledTabOnly ? 'CANCELLED' : statusFilter || undefined}
                disabled={showCompletedTabOnly || showCancelledTabOnly}
                onChange={(value) => {
                  setStatusFilter(value || '')
                  setPage(1)
                }}
              />
              <Select
                allowClear
                style={{ width: 120 }}
                placeholder="优先级"
                options={PRIORITY_OPTIONS}
                value={priorityFilter || undefined}
                onChange={(value) => {
                  setPriorityFilter(value || '')
                  setPage(1)
                }}
              />
              {isMyDemandsPage ? null : (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 180 }}
                  placeholder="需求负责人"
                  options={ownerOptions}
                  value={ownerFilter}
                  onChange={(value) => {
                    setOwnerFilter(value)
                    setPage(1)
                  }}
                />
              )}
              <RangePicker
                style={{ width: 250 }}
                value={updatedRange?.length ? updatedRange : null}
                onChange={(values) => {
                  setUpdatedRange(values || [])
                  setPage(1)
                }}
                placeholder={['更新开始', '更新结束']}
              />
              {isMyDemandsPage ? null : (
                <Select
                  style={{ width: 140 }}
                  value={scopeFilter}
                  options={[
                    { label: '全部需求', value: 'all' },
                    { label: '我负责/参与', value: 'mine' },
                  ]}
                  onChange={(value) => {
                    setScopeFilter(value)
                    setPage(1)
                  }}
                />
              )}
              <Button onClick={handleResetFilters}>重置筛选</Button>
              <Space size={6}>
                <Text type="secondary">精简视图</Text>
                <Switch checked={compactView} onChange={setCompactView} />
              </Space>
            </Space>

            {!isMyDemandsPage && canUseDemandPoolAnalysis ? (
              <div className="work-demand-list__agent-panel">
                <div className="work-demand-list__agent-panel-header">
                  <div>
                    <Space size={8} wrap>
                      <Tag color="blue" icon={<RobotOutlined />}>
                        AI 需求池分析
                      </Tag>
                      <Text strong>分析当前筛选结果中的需求状态、风险与重点项</Text>
                    </Space>
                    <div className="work-demand-list__agent-panel-hint">
                      当前分析范围会跟随上方筛选条件、业务分组页签和“我负责/参与”视图一起变化。
                    </div>
                  </div>
                  <Space wrap>
                    <Select
                      className="work-demand-list__agent-select"
                      placeholder="请选择 Agent"
                      loading={agentOptionsLoading}
                      value={selectedAgentId || undefined}
                      options={agentOptions.map((item) => ({
                        value: item.id,
                        label: `${item.agent_name} (${item.agent_code})`,
                      }))}
                      onChange={setSelectedAgentId}
                    />
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={analysisExecuting}
                      disabled={agentOptionsLoading || agentOptions.length === 0}
                      onClick={handleExecuteDemandAnalysis}
                    >
                      执行分析
                    </Button>
                    <Button
                      icon={<CopyOutlined />}
                      disabled={!analysisResult?.response_text}
                      onClick={handleCopyDemandAnalysis}
                    >
                      复制结果
                    </Button>
                    <Button
                      icon={<DeleteOutlined />}
                      disabled={!analysisResult}
                      onClick={() => setAnalysisResult(null)}
                    >
                      清空
                    </Button>
                  </Space>
                </div>

                {selectedDemandAgentOption?.business_purpose ? (
                  <div className="work-demand-list__agent-purpose">
                    <Text type="secondary">{`业务定位：${selectedDemandAgentOption.business_purpose}`}</Text>
                  </div>
                ) : null}

                {agentOptions.length === 0 && !agentOptionsLoading ? (
                  <div className="work-demand-list__agent-empty">
                    暂无可用 Agent，请先前往系统设置中的 Agent 配置页面创建并启用“需求池分析”场景 Agent。
                  </div>
                ) : null}

                {analysisResult ? (
                  <div className="work-demand-list__agent-result">
                    <div className="work-demand-list__agent-result-meta">
                      <Space size={[8, 8]} wrap>
                        <Tag color="blue">{analysisResult.agent_label || '已执行 Agent'}</Tag>
                        <Tag>{analysisResult.scope_label || '当前筛选范围'}</Tag>
                      </Space>
                    </div>
                    <Paragraph className="work-demand-list__agent-result-text">
                      {analysisResult.response_text || '本次未返回分析内容。'}
                    </Paragraph>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card variant="borderless">
            <Table
              rowKey="id"
              loading={loading}
              columns={demandColumns}
              dataSource={groupedDemands}
              defaultExpandAllRows
              indentSize={18}
              scroll={{ x: compactView ? 1820 : 2380 }}
              pagination={false}
              onChange={(_pagination, _filters, sorter) => {
                const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter
                if (nextSorter?.columnKey === 'priority') {
                  setPrioritySortOrder(nextSorter.order || undefined)
                }
              }}
            />
          </Card>
        </>
      ) : null}

      <Drawer
        title={editingDemand ? '编辑需求' : '新建需求'}
        open={modalOpen}
        onClose={closeModal}
        placement="right"
        size={640}
        destroyOnHidden={false}
        maskClosable
        extra={
          <Space size={8}>
            <Button onClick={closeModal}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {editingDemand ? '保存' : '创建'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="需求名称" name="name" rules={[{ required: true, message: '请输入需求名称' }]}>
            <Input maxLength={200} placeholder="请输入需求名称" />
          </Form.Item>

          <Form.Item
            label="需求负责人"
            name="owner_user_id"
            rules={[{ required: true, message: '请选择需求负责人' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="请选择需求负责人"
              disabled={Boolean(editingDemand) && !canTransferOwner}
            />
          </Form.Item>

          <Form.Item label="需求模板" name="template_id" rules={[{ required: true, message: '请选择需求模板' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={projectTemplateOptions}
              placeholder="请选择需求模板"
            />
          </Form.Item>

          <Form.Item
            label="需求涉及角色"
            name="participant_roles"
            rules={[{ required: true, message: '请选择需求涉及角色' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={participantRoleOptions}
              placeholder="请选择本需求会参与的业务角色"
            />
          </Form.Item>

          {selectedModalTemplate ? (
            <Card size="small" variant="borderless" style={{ marginBottom: 12 }}>
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <Text strong>
                  模板预览：{selectedModalTemplate.name || '-'}（当前命中 {selectedModalTemplateNodes.length} 个节点）
                </Text>
                {selectedModalTemplateNodes.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedModalTemplateNodes.map((node) => (
                      <Tag key={`${selectedModalTemplate.id}-${node.node_key}`} color="processing">
                        {node.sort_order}. {node.node_name}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary">当前参与角色下未命中任何模板节点</Text>
                )}
              </Space>
            </Card>
          ) : null}

          <Form.Item label="项目负责人" name="project_manager">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={ownerOptions}
              placeholder="选择项目负责人（可选）"
            />
          </Form.Item>

          <Form.Item label="业务组" name="business_group_code">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={businessGroupOptions}
              placeholder="请选择业务组（可选）"
            />
          </Form.Item>

          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item label="优先级" name="priority" rules={[{ required: true, message: '请选择优先级' }]}>
            <Select options={PRIORITY_OPTIONS} />
          </Form.Item>

          <Form.Item label="健康度" name="health_status" rules={[{ required: true, message: '请选择健康度' }]}>
            <Select options={HEALTH_STATUS_OPTIONS} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="实际开始时间" name="actual_start_time" style={{ flex: 1 }}>
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                placeholder="请选择实际开始日期"
              />
            </Form.Item>

            <Form.Item label="实际结束时间" name="actual_end_time" style={{ flex: 1 }}>
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                placeholder="请选择实际结束日期（可选）"
              />
            </Form.Item>
          </div>

          <Form.Item label="PRD链接" name="doc_link">
            <Input maxLength={500} placeholder="例如 PRD链接（可选）" />
          </Form.Item>

          <Form.Item label="UI设计稿地址" name="ui_design_link">
            <Input maxLength={500} placeholder="例如 Figma/蓝湖 链接（可选）" />
          </Form.Item>

          <Form.Item label="测试用例CASE地址" name="test_case_link">
            <Input maxLength={500} placeholder="例如 测试用例平台链接（可选）" />
          </Form.Item>

          <Form.Item label="预期上线日期" name="expected_release_date">
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              placeholder="请选择预期上线日期（可选）"
            />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={4} maxLength={2000} placeholder="补充需求背景、目标和注意事项" />
          </Form.Item>
        </Form>
      </Drawer>

      {isDetailPage ? (
        <Card
          className="work-demand-detail__page"
          variant="borderless"
          loading={detailPageLoading && !detailDemand}
        >
          {detailDemand ? (
            <>
              <div className="work-demand-detail__hero">
                <div className="work-demand-detail__hero-main">
                  <div className="work-demand-detail__hero-heading">
                    <div className="work-demand-detail__hero-heading-main">
                      <span className="work-demand-detail__hero-name">{detailDemand.name || '-'}</span>
                      <Space wrap size={[8, 8]} className="work-demand-detail__hero-tags">
                        <Tag color="blue">{`需求 #${detailDemand.id}`}</Tag>
                        <Tag color={getStatusTagColor(detailDemand.status)}>{getStatusLabel(detailDemand.status)}</Tag>
                        <Tag color={getPriorityColor(detailDemand.priority)}>{detailDemand.priority}</Tag>
                        <Tag color={getHealthTagColor(detailDemand.health_status)}>
                          {getHealthLabel(detailDemand.health_status)}
                        </Tag>
                      </Space>
                    </div>
                    <div className="work-demand-detail__hero-actions">
                      <Button icon={<LeftOutlined />} onClick={closeDetailDrawer}>
                        {isMyDemandsPage ? '返回我的需求' : '返回需求池'}
                      </Button>
                      {canEditDemandRecord(detailDemand) ? (
                        <>
                          {detailDemand.status === 'DONE' || detailDemand.status === 'CANCELLED' ? (
                            <Button onClick={() => handleQuickStatusUpdate(detailDemand, 'IN_PROGRESS')}>重开需求</Button>
                          ) : (
                            <Button onClick={() => handleQuickStatusUpdate(detailDemand, 'DONE')}>标记完成</Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Text type="secondary" className="work-demand-detail__hero-desc">
                    {detailDemand.description || '当前需求暂无补充描述，可在下方基本信息中完善背景、目标和PRD链接。'}
                  </Text>
                </div>

              </div>

            {!canViewWorkflow ? (
              <Alert type="info" showIcon title="当前账号无流程查看权限" />
            ) : (
              <Card loading={workflowLoading} size="small" variant="borderless" className="work-demand-detail__workflow-card">
                {workflowWarning ? (
                  <Alert
                    className="work-demand-detail__workflow-warning"
                    type="warning"
                    showIcon
                    title={workflowWarning}
                  />
                ) : null}

                {workflowData?.instance ? (
                  <div className="work-demand-detail__workflow-shell">
                    <div className="work-demand-detail__workflow-overview-bar">
                      <div className="work-demand-detail__workflow-overview">
                        <div className="work-demand-detail__workflow-pill work-demand-detail__workflow-pill--current">
                          <span>当前</span>
                          <strong>{currentWorkflowNodeLabel || '-'}</strong>
                        </div>
                        <div className="work-demand-detail__workflow-pill">
                          <span>已完成</span>
                          <strong>{workflowCompletedCount}</strong>
                        </div>
                        <div className="work-demand-detail__workflow-pill">
                          <span>总节点</span>
                          <strong>{workflowGraphNodes.length}</strong>
                        </div>
                        <div className="work-demand-detail__workflow-pill">
                          <span>整体预估用时</span>
                          <strong>{workflowTotalEstimatedHours.toFixed(1)} h</strong>
                        </div>
                      </div>
                      {canForceReplaceWorkflow ? (
                        <Button
                          danger
                          size="small"
                          className="work-demand-detail__workflow-upgrade-btn"
                          loading={workflowReplacing}
                          disabled={workflowActionBusy}
                          onClick={handleConfirmReplaceWorkflowLatest}
                        >
                          强制替换为最新流程
                        </Button>
                      ) : null}
                    </div>

                    <Card size="small" variant="borderless" className="work-demand-detail__workflow-graph-card">
                      <WorkflowGraph
                        nodes={workflowGraphNodes}
                        selectedNodeId={String(selectedWorkflowNode?.node_key || '')}
                        editable={false}
                        layoutMode="dag"
                        showToolbar={false}
                        onSelectNode={(nodeId) => setSelectedWorkflowNodeKey(nodeId)}
                      />
                    </Card>

                    <div className="work-demand-detail__workflow-current">
                      <DemandNodeInspector
                        node={selectedWorkflowNode}
                        canManageWorkflow={canManageWorkflow}
                        isCurrentNode={isSelectedCurrentWorkflowNode}
                        workflowActionBusy={workflowActionBusy}
                        workflowSubmitting={workflowSubmitting}
                        workflowParticipantUserIds={workflowParticipantUserIds}
                        workflowAssigneeOptions={workflowAssigneeOptions}
                        workflowDueAt={workflowDueAt}
                        workflowExpectedStartAt={workflowExpectedStartAt}
                        onWorkflowParticipantsChange={setWorkflowParticipantUserIds}
                        onWorkflowDueAtChange={setWorkflowDueAt}
                        onWorkflowExpectedStartAtChange={setWorkflowExpectedStartAt}
                        onSaveWorkflowOwner={(payload) =>
                          handleAssignWorkflowNode(payload, { silent: true, skipMissingAssigneeWarning: true })
                        }
                        onSaveWorkflowSchedule={handleSaveWorkflowNodeSchedule}
                        canAssignSelectedWorkflowNode={canAssignSelectedWorkflowNode}
                        onSubmitNode={handleSubmitWorkflowNode}
                        selectedWorkflowNodeTasks={selectedWorkflowNodeTasks}
                        workflowTaskUpdatingId={workflowTaskUpdatingId}
                        onUpdateWorkflowTask={handleUpdateWorkflowTask}
                        onQuickCreateTask={handleCreateWorkflowQuickTask}
                        quickCreateTaskSubmitting={workflowQuickTaskSubmitting}
                      />
                    </div>
                  </div>
                ) : (
                  <Empty description="暂无流程实例" />
                )}
              </Card>
            )}

            <Tabs
              className="work-demand-detail__tabs"
              activeKey={detailTabKey}
              onChange={setDetailTabKey}
              tabBarExtraContent={
                canEditDemandRecord(detailDemand) && (detailTabKey === 'basic' || detailTabKey === 'roles') ? (
                  <Button type="primary" onClick={handleSaveDetail} loading={detailSaving}>
                    保存变更
                  </Button>
                ) : null
              }
              items={[
                {
                  key: 'basic',
                  label: '基本信息',
                  children: (
                    <div className="work-demand-detail__tab-section work-demand-detail__tab-section--basic">
                      {canEditDemandRecord(detailDemand) ? (
                        <div className="work-demand-detail__form-grid">
                          <div className="work-demand-detail__field work-demand-detail__field--full">
                            <Text type="secondary">需求名称</Text>
                            <Input
                              value={detailName}
                              maxLength={200}
                              placeholder="请输入需求名称"
                              onChange={(event) => setDetailName(event.target.value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">状态</Text>
                            <Select
                              value={detailStatus || undefined}
                              options={STATUS_OPTIONS}
                              placeholder="请选择状态"
                              onChange={(value) => setDetailStatus(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">需求模板</Text>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              value={detailTemplateId}
                              options={projectTemplateOptions}
                              placeholder="请选择需求模板"
                              onChange={(value) => setDetailTemplateId(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">项目负责人</Text>
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              value={detailProjectManager}
                              options={ownerOptions}
                              placeholder="选择项目负责人（可选）"
                              onChange={(value) => setDetailProjectManager(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">业务组</Text>
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              value={detailBusinessGroupCode}
                              options={businessGroupOptions}
                              placeholder="请选择业务组"
                              onChange={(value) => setDetailBusinessGroupCode(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">健康度</Text>
                            <Select
                              value={detailHealthStatus}
                              options={HEALTH_STATUS_OPTIONS}
                              onChange={(value) => setDetailHealthStatus(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field">
                            <Text type="secondary">预期上线</Text>
                            <DatePicker
                              value={detailExpectedReleaseDate}
                              format="YYYY-MM-DD"
                              placeholder="选择预期上线日期"
                              onChange={(value) => setDetailExpectedReleaseDate(value)}
                            />
                          </div>
                          <div className="work-demand-detail__field work-demand-detail__field--full">
                            <Text type="secondary">PRD链接</Text>
                            <Input
                              value={detailDocLink}
                              placeholder="填写 PRD链接"
                              onChange={(event) => setDetailDocLink(event.target.value)}
                            />
                          </div>
                          <div className="work-demand-detail__field work-demand-detail__field--full">
                            <Text type="secondary">UI设计稿地址</Text>
                            <Input
                              value={detailUiDesignLink}
                              placeholder="填写 UI设计稿地址"
                              onChange={(event) => setDetailUiDesignLink(event.target.value)}
                            />
                          </div>
                          <div className="work-demand-detail__field work-demand-detail__field--full">
                            <Text type="secondary">测试用例CASE地址</Text>
                            <Input
                              value={detailTestCaseLink}
                              placeholder="填写 测试用例CASE地址"
                              onChange={(event) => setDetailTestCaseLink(event.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: 'roles',
                  label: '涉及角色',
                  children: (
                    <div className="work-demand-detail__tab-section">
                      <div className="work-demand-detail__form-grid">
                        <div className="work-demand-detail__field work-demand-detail__field--full">
                          <Text type="secondary">需求涉及角色</Text>
                          <Select
                            mode="multiple"
                            showSearch
                            optionFilterProp="label"
                            value={detailParticipantRoles}
                            options={participantRoleOptions}
                            placeholder="请选择需求涉及角色"
                            disabled={!canEditDemandRecord(detailDemand)}
                            onChange={(value) => setDetailParticipantRoles(value)}
                          />
                        </div>
                      </div>
                      <div className="work-demand-detail__table-shell">
                        <div className="work-demand-detail__role-panel">
                          {(detailParticipantRoles || []).length > 0 ? (
                            <Space size={[8, 8]} wrap>
                              {detailParticipantRoles.map((role) => (
                                <Tag key={role} color="blue">
                                  {participantRoleLabelMap.get(String(role || '').trim().toUpperCase()) || role}
                                </Tag>
                              ))}
                            </Space>
                          ) : (
                            <Text type="secondary">当前未配置需求涉及角色</Text>
                          )}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'communications',
                  label: '沟通记录',
                  children: (
                    <DemandCommunicationPanel
                      demandId={detailDemand?.id || ''}
                      canManage={canEditDemandRecord(detailDemand)}
                    />
                  ),
                },
                {
                  key: 'bugs',
                  label: 'Bug',
                  children: (
                    <DemandBugPanel demandId={detailDemand?.id || ''} />
                  ),
                },
                {
                  key: 'logs',
                  label: '事项',
                  children: (
                    <div className="work-demand-detail__tab-section">
                      <div className="work-demand-detail__log-toolbar">
                        <Space size={8} wrap>
                          <Text type="secondary">筛选</Text>
                          <Select
                            size="small"
                            className="work-demand-detail__log-filter"
                            value={detailLogFilter}
                            options={DETAIL_LOG_FILTER_OPTIONS}
                            onChange={(value) => setDetailLogFilter(value || 'ALL')}
                          />
                        </Space>
                        <Text type="secondary" className="work-demand-detail__toolbar-summary">
                          全部 {detailLogStats.total} · 未完成 {detailLogStats.pending} · 逾期 {detailLogStats.overdue}
                        </Text>
                      </div>
                      <div className="work-demand-detail__table-shell">
                      <Table
                        rowKey="id"
                        size="small"
                        loading={detailLogsLoading}
                        dataSource={filteredDetailLogs}
                        pagination={false}
                        locale={{
                          emptyText: canViewSelfLogs ? '当前筛选下暂无关联事项' : '当前账号无工作记录查看权限',
                        }}
                        scroll={{ x: 980 }}
                        columns={[
                          {
                            title: '日期',
                            dataIndex: 'log_date',
                            key: 'log_date',
                            width: 110,
                            render: (value) => formatBeijingDate(value),
                          },
                          {
                            title: '执行人',
                            dataIndex: 'username',
                            key: 'username',
                            width: 120,
                            render: (value) => value || '-',
                          },
                          {
                            title: '阶段',
                            dataIndex: 'phase_name',
                            key: 'phase_name',
                            width: 140,
                            render: (_, row) => row.phase_name || row.phase_key || '-',
                          },
                          {
                            title: '预计开始',
                            dataIndex: 'expected_start_date',
                            key: 'expected_start_date',
                            width: 120,
                            render: (value) => formatBeijingDate(value),
                          },
                          {
                            title: '预计完成',
                            dataIndex: 'expected_completion_date',
                            key: 'expected_completion_date',
                            width: 120,
                            render: (value, row) => (
                              <Space size={4}>
                                <span>{formatBeijingDate(value)}</span>
                                {isOverdueLogItem(row) ? <Tag color="error">逾期</Tag> : null}
                              </Space>
                            ),
                          },
                          {
                            title: '个人预估(h)',
                            dataIndex: 'personal_estimate_hours',
                            key: 'personal_estimate_hours',
                            width: 120,
                            render: (value) => toNumber(value, 0).toFixed(1),
                          },
                          {
                            title: '实际用时(h)',
                            dataIndex: 'actual_hours',
                            key: 'actual_hours',
                            width: 120,
                            render: (value) => toNumber(value, 0).toFixed(1),
                          },
                          {
                            title: '描述',
                            dataIndex: 'description',
                            key: 'description',
                            ellipsis: true,
                            render: (value) => value || '-',
                          },
                        ]}
                      />
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </>
          ) : (
            <Empty description="需求不存在或无权限查看" />
          )}
        </Card>
      ) : null}

      {!isMyDemandsPage && !canCreate ? (
        <div style={{ marginTop: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UnorderedListOutlined />
          <span>当前账号无创建权限，只有管理员、超级管理员或产品角色可以新建需求。</span>
        </div>
      ) : null}
    </div>
  )
}

export default WorkDemands
