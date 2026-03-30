import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Input, Select, Space, Tag, Typography } from 'antd'
import { WorkflowGraph } from '../../workflow'

const { Paragraph, Text, Title } = Typography

function TemplateFlowEditor({
  nodes,
  selectedNodeId,
  highlightedNodeIds = [],
  templateMeta,
  canManage = false,
  saving = false,
  onSelectNode,
  onTemplateNameChange,
  onTemplateDescriptionChange,
  onTemplateStatusChange,
  onBack,
  onSave,
}) {
  return (
    <Card
      className="project-template-detail__canvas-card"
      styles={{ body: { padding: 20 } }}
    >
      <div className="project-template-detail__canvas-header">
        <div className="project-template-detail__canvas-meta">
          <div className="project-template-detail__canvas-primary-row">
            <div className="project-template-detail__canvas-title-block">
              {canManage ? (
                <Input
                  value={templateMeta?.name || ''}
                  maxLength={100}
                  placeholder="请输入模板名称"
                  className="project-template-detail__canvas-name-input"
                  onChange={(event) => onTemplateNameChange?.(event.target.value)}
                />
              ) : (
                <Title level={4}>{templateMeta?.name || '-'}</Title>
              )}
            </div>
            <Space wrap className="project-template-detail__canvas-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                返回列表
              </Button>
              {canManage ? (
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
                  保存模板
                </Button>
              ) : null}
            </Space>
          </div>
          <div className="project-template-detail__canvas-summary-row">
            <div className="project-template-detail__canvas-summary-item is-status">
              <Text type="secondary">状态</Text>
              {canManage ? (
                <Select
                  value={Number(templateMeta?.status) === 1 ? 1 : 0}
                  className="project-template-detail__canvas-status-select"
                  options={[
                    { label: '启用', value: 1 },
                    { label: '停用', value: 0 },
                  ]}
                  onChange={onTemplateStatusChange}
                />
              ) : (
                <Tag color={templateMeta?.status === 1 ? 'green' : 'default'}>
                  {templateMeta?.statusLabel || '-'}
                </Tag>
              )}
            </div>
            <div className="project-template-detail__canvas-summary-item is-description">
              <Text type="secondary">模板描述</Text>
              {canManage ? (
                <Input.TextArea
                  value={templateMeta?.description || ''}
                  maxLength={300}
                  autoSize={{ minRows: 1, maxRows: 2 }}
                  placeholder="请输入模板描述"
                  className="project-template-detail__canvas-description-input"
                  onChange={(event) => onTemplateDescriptionChange?.(event.target.value)}
                />
              ) : (
                <Paragraph
                  className="project-template-detail__canvas-description"
                  ellipsis={{ rows: 2, tooltip: templateMeta?.description || '-' }}
                >
                  {templateMeta?.description || '-'}
                </Paragraph>
              )}
            </div>
            <div className="project-template-detail__canvas-summary-item is-time">
              <Text type="secondary">更新时间</Text>
              <Text className="project-template-detail__canvas-summary-text is-time">
                {templateMeta?.updatedAtLabel || '-'}
              </Text>
            </div>
          </div>
        </div>
      </div>
      <WorkflowGraph
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        highlightedNodeIds={highlightedNodeIds}
        layoutMode="dag"
        editable={false}
        showToolbar={false}
        onSelectNode={onSelectNode}
      />
    </Card>
  )
}

export default TemplateFlowEditor
