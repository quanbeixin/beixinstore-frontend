import { Alert, Button, Result, Spin, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProjectTemplateByIdApi, getProjectTemplatePhaseTypesApi, updateProjectTemplateApi } from '../../api/work'
import {
  duplicateGraphNode,
  insertGraphNode,
  mapGraphNodesToTemplateNodeConfig,
  mapTemplateNodeConfigToGraphNodes,
  moveGraphNode,
  removeGraphNode,
  upsertGraphNode,
  validateGraphNodes,
} from '../../modules/project-template'
import { TEMPLATE_PHASE_OPTIONS } from '../../modules/project-template'
import TemplateFlowEditor from '../../modules/project-template/components/TemplateFlowEditor'
import TemplateNodeInspector from '../../modules/project-template/components/TemplateNodeInspector'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import './ProjectTemplateDetailPage.css'

const FALLBACK_PHASE_TYPES = TEMPLATE_PHASE_OPTIONS.map((item, index) => ({
  phase_key: item.value,
  phase_name: item.label,
  sort_order: index + 1,
  enabled: 1,
}))

function mapPhaseRowsToOptions(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((item) => String(item?.phase_key || '').trim())
    .map((item) => ({
      label: String(item.phase_name || item.phase_key).trim(),
      value: String(item.phase_key || '').trim(),
    }))
}

function ProjectTemplateDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const templateId = Number(id)
  const canManage = hasPermission('project.template.manage')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState(null)
  const [nodes, setNodes] = useState([])
  const [phaseTypes, setPhaseTypes] = useState(FALLBACK_PHASE_TYPES)
  const [selectedNodeId, setSelectedNodeId] = useState('')

  const loadTemplate = useCallback(async () => {
    if (!Number.isInteger(templateId) || templateId <= 0) return
    setLoading(true)
    try {
      const [templateResult, phaseResult] = await Promise.all([
        getProjectTemplateByIdApi(templateId),
        getProjectTemplatePhaseTypesApi({ enabled_only: 1 }).catch(() => null),
      ])

      if (!templateResult?.success) {
        message.error(templateResult?.message || '获取模板详情失败')
        return
      }

      const currentTemplate = templateResult.data || null
      const mappedNodes = mapTemplateNodeConfigToGraphNodes(currentTemplate?.node_config || [])

      const remotePhaseTypes = Array.isArray(phaseResult?.data) ? phaseResult.data : []
      setPhaseTypes(remotePhaseTypes.length > 0 ? remotePhaseTypes : FALLBACK_PHASE_TYPES)
      setTemplate(currentTemplate)
      setNodes(mappedNodes)
      setSelectedNodeId((prev) => prev || mappedNodes[0]?.id || '')
    } catch (error) {
      message.error(error?.message || '获取模板详情失败')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  const selectedNode = useMemo(
    () => nodes.find((item) => item.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  )

  const highlightedPredecessorNodeIds = useMemo(() => {
    const incomingKeys = Array.isArray(selectedNode?.meta?.incomingKeys) ? selectedNode.meta.incomingKeys : []
    if (incomingKeys.length === 0) return []
    const incomingKeySet = new Set(incomingKeys.map((item) => String(item || '').trim()))
    return nodes
      .filter((item) => incomingKeySet.has(String(item?.key || '').trim()))
      .map((item) => item.id)
  }, [nodes, selectedNode])

  const nodeOptions = useMemo(
    () =>
      nodes.map((item) => ({
        value: item.key,
        label: `${item.title || item.key} (${item.key})`,
      })),
    [nodes],
  )

  const phaseOptions = useMemo(() => {
    const optionMap = new Map()

    mapPhaseRowsToOptions(phaseTypes).forEach((item) => {
      optionMap.set(String(item.value), item)
    })

    nodes.forEach((item) => {
      const value = String(item?.phaseKey || '').trim()
      if (!value || optionMap.has(value)) return
      optionMap.set(value, {
        value,
        label: value,
      })
    })

    return Array.from(optionMap.values())
  }, [nodes, phaseTypes])

  const defaultPhaseKey = useMemo(() => String(phaseOptions[0]?.value || 'develop').trim(), [phaseOptions])

  const templateMeta = useMemo(
    () => ({
      name: String(template?.name || '').trim(),
      description: String(template?.description || '').trim(),
      status: Number(template?.status) === 1 ? 1 : 0,
      statusLabel: Number(template?.status) === 1 ? '启用' : '停用',
      updatedAtLabel: formatBeijingDateTime(template?.updated_at) || '-',
    }),
    [template],
  )

  const updateNode = useCallback((nodeId, patch) => {
    setNodes((prev) => upsertGraphNode(prev, nodeId, patch))
  }, [])

  const handleTemplateNameChange = useCallback((nextName) => {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        name: String(nextName || ''),
      }
    })
  }, [])

  const handleTemplateDescriptionChange = useCallback((nextDescription) => {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        description: String(nextDescription || ''),
      }
    })
  }, [])

  const handleTemplateStatusChange = useCallback((nextStatus) => {
    setTemplate((prev) => {
      if (!prev) return prev
      const normalizedStatus = Number(nextStatus) === 1 ? 1 : 0
      return {
        ...prev,
        status: normalizedStatus,
      }
    })
  }, [])

  const addNode = useCallback(() => {
    setNodes((prev) => {
      const { nodes: nextNodes, insertedNodeId } = insertGraphNode(prev, {
        partial: { phaseKey: defaultPhaseKey },
      })
      setSelectedNodeId(insertedNodeId)
      return nextNodes
    })
  }, [defaultPhaseKey])

  const addNodeAfter = useCallback((nodeId) => {
    setNodes((prev) => {
      const { nodes: nextNodes, insertedNodeId } = insertGraphNode(prev, {
        afterId: nodeId,
        partial: { phaseKey: defaultPhaseKey },
      })
      setSelectedNodeId(insertedNodeId)
      return nextNodes
    })
  }, [defaultPhaseKey])

  const handleMoveNode = useCallback((nodeId, nextOrder) => {
    setNodes((prev) => moveGraphNode(prev, nodeId, nextOrder))
  }, [])

  const handleDuplicateNode = useCallback((nodeId) => {
    setNodes((prev) => duplicateGraphNode(prev, nodeId))
  }, [])

  const handleRemoveNode = useCallback((nodeId) => {
    setNodes((prev) => {
      const nextNodes = removeGraphNode(prev, nodeId)
      if (nodeId === selectedNodeId) {
        setSelectedNodeId(nextNodes[0]?.id || '')
      }
      return nextNodes
    })
  }, [selectedNodeId])

  const handleSave = async () => {
    if (!canManage) return

    try {
      const templateName = String(template?.name || '').trim()
      if (!templateName) {
        message.warning('请输入模板名称')
        return
      }

      const validationError = validateGraphNodes(nodes)
      if (validationError) {
        message.warning(validationError)
        return
      }

      setSaving(true)
      const payload = {
        name: templateName,
        description: String(template?.description || '').trim(),
        status: Number(template?.status) === 1 ? 1 : 0,
        node_config: mapGraphNodesToTemplateNodeConfig(nodes),
      }

      const result = await updateProjectTemplateApi(templateId, payload)
      if (!result?.success) {
        message.error(result?.message || '模板保存失败')
        return
      }

      message.success('模板保存成功')
      await loadTemplate()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '模板保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return (
      <Result
        status="error"
        title="模板 ID 无效"
        subTitle="请返回模板列表重新选择。"
        extra={<Button onClick={() => navigate('/project-templates')}>返回模板列表</Button>}
      />
    )
  }

  if (loading && !template) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!template && !loading) {
    return (
      <Result
        status="404"
        title="模板不存在"
        subTitle="该模板可能已被删除或当前账号无权限查看。"
        extra={<Button onClick={() => navigate('/project-templates')}>返回模板列表</Button>}
      />
    )
  }

  return (
    <div className="project-template-detail-page">
      {nodes.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          title="当前模板暂无节点"
          description="请先在流程画布中新增至少 1 个节点，再保存模板。"
        />
      ) : null}

      <div className="project-template-detail__content">
        <div>
          <TemplateFlowEditor
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedPredecessorNodeIds}
            templateMeta={templateMeta}
            canManage={canManage}
            saving={saving}
            onSelectNode={setSelectedNodeId}
            onTemplateNameChange={handleTemplateNameChange}
            onTemplateDescriptionChange={handleTemplateDescriptionChange}
            onTemplateStatusChange={handleTemplateStatusChange}
            onBack={() => navigate('/project-templates')}
            onSave={handleSave}
          />
        </div>
        <div className="project-template-detail__side">
          <TemplateNodeInspector
            node={selectedNode}
            editable={canManage}
            totalNodes={nodes.length}
            nodeOptions={nodeOptions}
            phaseOptions={phaseOptions}
            onChangeNode={updateNode}
            onMoveToOrder={handleMoveNode}
            onDuplicate={handleDuplicateNode}
            onDelete={handleRemoveNode}
            onAddAfter={addNodeAfter}
            onAddNode={addNode}
          />
        </div>
      </div>
    </div>
  )
}

export default ProjectTemplateDetailPage
