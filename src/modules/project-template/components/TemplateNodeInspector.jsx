import { CopyOutlined, DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { TEMPLATE_NODE_TYPE_OPTIONS } from '../utils/projectTemplate.constants'
import { WorkflowInspector } from '../../workflow'

const { Text } = Typography

function renderLabelWithHelp(label, tip) {
  return (
    <span className="template-node-inspector__label-with-help">
      <span>{label}</span>
      <Tooltip title={tip} placement="top">
        <QuestionCircleOutlined className="template-node-inspector__label-help-icon" />
      </Tooltip>
    </span>
  )
}

function TemplateNodeInspector({
  node,
  editable = false,
  totalNodes = 0,
  nodeOptions = [],
  phaseOptions = [],
  participantRoleOptions = [],
  onChangeNode,
  onMoveToOrder,
  onDuplicate,
  onDelete,
  onAddAfter,
  onAddNode,
}) {
  const [form] = Form.useForm()
  const [flowFeedback, setFlowFeedback] = useState({ nodeId: '', text: '' })
  const flowFeedbackTimerRef = useRef(null)

  useEffect(() => {
    if (!node) {
      form.resetFields()
      return
    }

    form.setFieldsValue({
      title: node.title || '',
      key: node.key || '',
      type: node.type || 'EXECUTE',
      phaseKey: node.phaseKey || 'develop',
      order: Number(node.order) || 1,
      description: String(node.meta?.description || ''),
      incomingKeys: Array.isArray(node.meta?.incomingKeys) ? node.meta.incomingKeys : [],
      participantRoles: Array.isArray(node.meta?.participantRoles) ? node.meta.participantRoles : [],
    })
  }, [form, node])

  useEffect(() => () => {
    if (flowFeedbackTimerRef.current) {
      clearTimeout(flowFeedbackTimerRef.current)
    }
  }, [])

  const successorOptions = (nodeOptions || []).filter((item) =>
    (Array.isArray(node?.meta?.outgoingKeys) ? node.meta.outgoingKeys : []).includes(String(item.value || '').trim()),
  )

  const predecessorOptions = (nodeOptions || []).filter(
    (item) => String(item.value || '').trim() !== String(node?.key || '').trim(),
  )

  const incomingCount = Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys.length : 0
  const outgoingCount = Array.isArray(node?.meta?.outgoingKeys) ? node.meta.outgoingKeys.length : 0
  const isStartNode = incomingCount === 0
  const isParallelSplit = outgoingCount > 1
  const isMergeNode = incomingCount > 1

  const showFlowFeedback = (nextIncomingKeys = []) => {
    if (flowFeedbackTimerRef.current) {
      clearTimeout(flowFeedbackTimerRef.current)
    }

    const count = Array.isArray(nextIncomingKeys) ? nextIncomingKeys.length : 0
    setFlowFeedback({
      nodeId: String(node?.id || ''),
      text: count > 0 ? `已更新前置节点，左侧已高亮 ${count} 个前置节点` : '已更新前置节点，当前节点为开始节点',
    })
    flowFeedbackTimerRef.current = setTimeout(() => {
      setFlowFeedback({ nodeId: '', text: '' })
      flowFeedbackTimerRef.current = null
    }, 2200)
  }

  const handleValuesChange = (changedValues, allValues) => {
    if (!node) return

    if (Object.prototype.hasOwnProperty.call(changedValues || {}, 'order')) {
      onMoveToOrder?.(node.id, allValues?.order)
      return
    }

    const currentIncomingKeys = Array.isArray(node?.meta?.incomingKeys) ? node.meta.incomingKeys : []
    const currentParticipantRoles = Array.isArray(node?.meta?.participantRoles) ? node.meta.participantRoles : []

    onChangeNode?.(node.id, {
      title: allValues?.title ?? node.title,
      key: allValues?.key ?? node.key,
      type: allValues?.type ?? node.type,
      phaseKey: allValues?.phaseKey ?? node.phaseKey,
      meta: {
        ...(node.meta || {}),
        description: allValues?.description ?? node.meta?.description,
        incomingKeys: Array.isArray(allValues?.incomingKeys) ? allValues.incomingKeys : currentIncomingKeys,
        participantRoles: Array.isArray(allValues?.participantRoles)
          ? allValues.participantRoles
          : currentParticipantRoles,
      },
    })

    if (Object.prototype.hasOwnProperty.call(changedValues || {}, 'incomingKeys')) {
      showFlowFeedback(allValues?.incomingKeys)
    }
  }

  return (
    <WorkflowInspector
      title="节点设置"
      subtitle="左侧看流程，右侧维护当前节点的名称、流转关系和后续规则。"
      empty={!node}
      emptyDescription="请选择一个节点，或先新增一个节点开始配置流程。"
      extra={node ? <Tag color="processing">第 {node.order} 个节点</Tag> : null}
    >
      {node ? (
        <div className="template-node-inspector">
          <Form form={form} layout="vertical" disabled={!editable} onValuesChange={handleValuesChange}>
            <Tabs
              defaultActiveKey="basic"
              destroyOnHidden={false}
              items={[
                {
                  key: 'basic',
                  label: '基础信息',
                  children: (
                    <>
                      <Form.Item
                        label="节点名称"
                        name="title"
                        rules={[{ required: true, message: '请输入节点名称' }]}
                      >
                        <Input maxLength={50} placeholder="例如：需求评审" />
                      </Form.Item>
                      <div className="template-node-inspector__two-column">
                        <Form.Item
                          label={renderLabelWithHelp(
                            '需求阶段',
                            '表示这个节点属于需求推进过程中的哪个阶段，例如需求评审、方案设计、开发、测试、上线，方便团队理解流程位置和后续统计分组。',
                          )}
                          name="phaseKey"
                        >
                          <Select options={phaseOptions} />
                        </Form.Item>
                        <Form.Item
                          label={renderLabelWithHelp(
                            '节点类型',
                            '表示这个节点是什么性质的环节。当前版本暂不开放手动调整，先按系统默认规则处理。',
                          )}
                          name="type"
                        >
                          <Select disabled options={TEMPLATE_NODE_TYPE_OPTIONS} />
                        </Form.Item>
                      </div>
                      <div className="template-node-inspector__two-column">
                        <Form.Item label="显示顺序" name="order">
                          <InputNumber min={1} max={Math.max(totalNodes, 1)} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          label={renderLabelWithHelp(
                            '系统标识',
                            '用于模板保存和流程识别，建议使用英文大写加下划线。',
                          )}
                          name="key"
                          rules={[{ required: true, message: '请输入系统标识' }]}
                        >
                          <Input maxLength={50} placeholder="例如：PLAN_REVIEW" />
                        </Form.Item>
                      </div>
                      <Form.Item
                        label={renderLabelWithHelp(
                          '适用参与角色',
                          '不设置表示所有需求都启用；设置后，只有需求选择了对应参与角色，系统才会生成该节点。',
                        )}
                        name="participantRoles"
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          optionFilterProp="label"
                          placeholder="选择哪些业务参与角色需要这个节点"
                          options={participantRoleOptions}
                        />
                      </Form.Item>
                      <Form.Item label="节点说明" name="description">
                        <Input.TextArea rows={4} maxLength={300} placeholder="补充这个节点的目标、输出物或执行要求" />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'actions',
                  label: '快捷操作',
                  children: (
                    <div className="template-node-inspector__actions-panel">
                      <div className="template-node-inspector__section-heading">
                        <Text strong>常用节点动作</Text>
                        <Text type="secondary">这些操作会直接影响当前流程结构，请在确认后再执行。</Text>
                      </div>
                      <Space wrap>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          disabled={!editable}
                          onClick={() => onAddAfter?.(node.id)}
                        >
                          新增后续节点
                        </Button>
                        <Button icon={<PlusOutlined />} disabled={!editable} onClick={onAddNode}>
                          新增独立节点
                        </Button>
                        <Button icon={<CopyOutlined />} disabled={!editable} onClick={() => onDuplicate?.(node.id)}>
                          复制当前节点
                        </Button>
                        <Button danger icon={<DeleteOutlined />} disabled={!editable} onClick={() => onDelete?.(node.id)}>
                          删除当前节点
                        </Button>
                      </Space>
                    </div>
                  ),
                },
                {
                  key: 'flow',
                  label: '流转关系',
                  children: (
                    <>
                      <Form.Item
                        label="前置节点"
                        name="incomingKeys"
                        extra={
                          <div className="template-node-inspector__field-extra">
                            <Text type="secondary">没有前置节点时，这个节点会被识别为开始节点。</Text>
                            {flowFeedback?.nodeId === String(node?.id || '') && flowFeedback?.text ? (
                              <Text type="success">{flowFeedback.text}</Text>
                            ) : null}
                          </div>
                        }
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          optionFilterProp="label"
                          placeholder="选择当前节点依赖哪些前序节点"
                          options={predecessorOptions}
                        />
                      </Form.Item>
                      <div className="template-node-inspector__flow-summary">
                        <div className="template-node-inspector__flow-group">
                          <Text strong>系统识别结果</Text>
                          <div className="template-node-inspector__flow-tags">
                            <Tag color={isStartNode ? 'green' : 'default'}>
                              {isStartNode ? '开始节点' : '非开始节点'}
                            </Tag>
                            <Tag color={isParallelSplit ? 'gold' : 'default'}>
                              {isParallelSplit ? '并行分发节点' : '普通流转节点'}
                            </Tag>
                            <Tag color={isMergeNode ? 'blue' : 'default'}>
                              {isMergeNode ? '汇合节点' : '单前置/无前置'}
                            </Tag>
                          </div>
                        </div>
                        <div className="template-node-inspector__flow-group">
                          <Text strong>下游节点</Text>
                          <div className="template-node-inspector__flow-tags">
                            {successorOptions.length > 0 ? (
                              successorOptions.map((item) => (
                                <Tag key={item.value} color="blue">
                                  {item.label}
                                </Tag>
                              ))
                            ) : (
                              <Text type="secondary">当前节点后面还没有配置下游节点，可理解为结束节点。</Text>
                            )}
                          </div>
                        </div>
                        <div className="template-node-inspector__flow-group">
                          <Text strong>识别规则</Text>
                          <div className="template-node-inspector__flow-hints">
                            <Text type="secondary">无前置节点：系统会把它作为流程开始。</Text>
                            <Text type="secondary">1 个前置节点：按顺序衔接上一个节点。</Text>
                            <Text type="secondary">多个前置节点：要等前面的节点都完成后才会进入当前节点。</Text>
                            <Text type="secondary">一个节点连接多个下游节点：系统会识别为并行分发。</Text>
                          </div>
                        </div>
                      </div>
                    </>
                  ),
                },
                {
                  key: 'children',
                  label: '事项清单',
                  children: (
                    <div className="template-node-inspector__placeholder">
                      <Text strong>预留事项配置区</Text>
                      <Text type="secondary">
                        后续可以在这里补充这个节点下的任务清单、交付物、检查项，作为执行时的标准动作。
                      </Text>
                    </div>
                  ),
                },
                {
                  key: 'events',
                  label: '通知规则',
                  children: (
                    <div className="template-node-inspector__placeholder">
                      <Text strong>预留通知与自动动作区</Text>
                      <Text type="secondary">
                        后续可以在这里维护节点提醒、状态触发、自动通知等规则，方便执行过程自动推进。
                      </Text>
                    </div>
                  ),
                },
              ]}
            />
          </Form>

          <div className="template-node-inspector__status-bar">
            <Tag color={isStartNode ? 'green' : 'default'}>{isStartNode ? '开始节点' : '非开始节点'}</Tag>
            <Tag color={isParallelSplit ? 'gold' : 'default'}>{isParallelSplit ? '并行分发' : '普通流转'}</Tag>
            <Tag color={isMergeNode ? 'blue' : 'default'}>{isMergeNode ? '汇合节点' : '单前置/无前置'}</Tag>
          </div>
        </div>
      ) : null}
    </WorkflowInspector>
  )
}

export default TemplateNodeInspector
