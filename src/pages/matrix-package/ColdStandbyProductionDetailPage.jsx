import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Progress,
  Row,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getMatrixPackageApi,
  getMatrixPackageSideNotesApi,
  confirmMatrixPackageSideNoteApi,
  saveMatrixPackageSideNotesApi,
} from '../../api/matrixPackage'
import { hasPermission } from '../../utils/access'
import './ColdStandbyProductionDetailPage.css'

const { Text } = Typography

const NOTE_SECTIONS = [
  {
    type: 'DELIVERY',
    title: '投放侧补充',
    placeholder: '记录投放前需要了解的账号限制、适配要求、计划使用场景等信息',
  },
  {
    type: 'REQUIREMENT',
    title: '产品侧补充',
    placeholder: '记录包生产目标、目标市场、业务要求、素材方向等信息',
  },
  {
    type: 'OPERATION',
    title: '运营侧补充',
    placeholder: '记录可复用性、维护风险、后续观察点等信息',
  },
  {
    type: 'FRONTEND',
    title: '前端补充',
    placeholder: '记录前端实现、页面配置、交互限制、版本适配等信息',
  },
  {
    type: 'BACKEND',
    title: '后端补充',
    placeholder: '记录后端接口、服务配置、数据依赖、技术限制等信息',
  },
  {
    type: 'DEVOPS',
    title: '运维补充',
    placeholder: '记录部署配置、环境变量、构建打包、发布注意事项等信息',
  },
]

const OPERATION_FIELDS = [
  { name: 'appOrigin', label: 'appOrigin', placeholder: '填写 appOrigin' },
  {
    name: 'contactEmail',
    label: '联系邮箱',
    placeholder: 'contact@example.com',
    tooltip: 'contact@域名',
  },
  { name: 'privacyPolicyUrl', label: '隐私政策网址', placeholder: 'https://...' },
  { name: 'termsUrl', label: '服务条款网址', placeholder: 'https://...' },
  { name: 'dataDeletionUrl', label: '数据删除说明网址', placeholder: 'https://...' },
  { name: 'officialEmail', label: '官方邮箱', placeholder: '填写官方邮箱' },
  { name: 'materialUrl', label: '运营提供物料地址链接', placeholder: 'https://...' },
  { name: 'feedbackSurveyUrl', label: '用户反馈问卷地址', placeholder: 'https://...' },
  { name: 'reportSurveyUrl', label: '举报问卷地址', placeholder: 'https://...' },
  { name: 'reviewAccount', label: '送审账号', placeholder: '填写送审账号' },
]

const CHECKLIST_TOTAL = 6

function parseOperationContent(content) {
  const text = String(content || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function serializeOperationContent(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = {}
  let hasContent = false
  for (const field of OPERATION_FIELDS) {
    const text = String(source[field.name] || '').trim()
    normalized[field.name] = text
    if (text) hasContent = true
  }
  return hasContent ? JSON.stringify(normalized) : ''
}

function getChecklistPercent(values) {
  const checked = Array.isArray(values) ? values.length : 0
  return Math.round((checked / CHECKLIST_TOTAL) * 100)
}

function buildNoteFormValues(notes) {
  const values = {}
  for (const section of NOTE_SECTIONS) {
    const matched = notes.find((item) => item.note_type === section.type)
    values[section.type] = section.type === 'OPERATION'
      ? parseOperationContent(matched?.content)
      : matched?.content || ''
  }
  return values
}

function hasNoteContent(notes, noteType) {
  const matched = notes.find((item) => item.note_type === noteType)
  if (noteType === 'OPERATION') {
    const parsed = parseOperationContent(matched?.content)
    if (OPERATION_FIELDS.some((field) => String(parsed[field.name] || '').trim())) return true
  }
  return Boolean(String(matched?.content || '').trim())
}

function getSideNote(notes, noteType) {
  return notes.find((item) => item.note_type === noteType) || null
}

function ColdStandbyProductionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const autoSaveTimerRef = useRef(null)
  const autoSaveSeqRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [confirmingType, setConfirmingType] = useState('')
  const [detail, setDetail] = useState(null)
  const [sideNotes, setSideNotes] = useState([])

  const canManage = hasPermission('demand.manage')
  const checklistPercent = useMemo(() => getChecklistPercent(detail?.production_checklist), [detail])

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [detailResult, notesResult] = await Promise.all([
        getMatrixPackageApi(id),
        getMatrixPackageSideNotesApi(id),
      ])
      if (!detailResult?.success) {
        message.error(detailResult?.message || '获取生产详情失败')
        return
      }
      setDetail(detailResult.data || null)
      const notes = notesResult?.success && Array.isArray(notesResult.data) ? notesResult.data : []
      setSideNotes(notes)
      form.setFieldsValue(buildNoteFormValues(notes))
    } catch (error) {
      message.error(error?.message || '获取生产详情失败')
    } finally {
      setLoading(false)
    }
  }, [form, id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  const saveNotes = useCallback(async (values, { showSuccess = false } = {}) => {
    try {
      const notes = NOTE_SECTIONS.map((section) => ({
        note_type: section.type,
        content: section.type === 'OPERATION'
          ? serializeOperationContent(values[section.type])
          : values[section.type] || '',
      }))
      setSaving(true)
      setSaveStatus('saving')
      const result = await saveMatrixPackageSideNotesApi(id, notes)
      if (!result?.success) {
        message.error(result?.message || '保存补充信息失败')
        setSaveStatus('failed')
        return
      }
      setSideNotes(Array.isArray(result.data) ? result.data : [])
      setSaveStatus('saved')
      if (showSuccess) message.success('补充信息已保存')
    } catch (error) {
      if (error?.errorFields) return
      setSaveStatus('failed')
      message.error(error?.message || '保存补充信息失败')
    } finally {
      setSaving(false)
    }
  }, [id])

  const handleNoteValuesChange = (_, allValues) => {
    if (!canManage) return
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    const currentSeq = autoSaveSeqRef.current + 1
    autoSaveSeqRef.current = currentSeq
    setSaveStatus('pending')
    autoSaveTimerRef.current = setTimeout(() => {
      if (autoSaveSeqRef.current !== currentSeq) return
      saveNotes(allValues)
    }, 800)
  }

  const handleConfirmNote = async (noteType) => {
    setConfirmingType(noteType)
    try {
      const result = await confirmMatrixPackageSideNoteApi(id, noteType)
      if (!result?.success) {
        message.error(result?.message || '确认失败')
        return
      }
      setSideNotes(Array.isArray(result.data) ? result.data : [])
      message.success('已确认完成')
    } catch (error) {
      message.error(error?.message || '确认失败')
    } finally {
      setConfirmingType('')
    }
  }

  const handleCopyOperationField = async (event, field) => {
    event.preventDefault()
    event.stopPropagation()
    const value = String(form.getFieldValue(['OPERATION', field.name]) || '').trim()
    if (!value) {
      message.warning('暂无可复制内容')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      message.success('已复制')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const renderOperationFieldLabel = (field) => {
    const labelText = field.tooltip ? (
      <Tooltip title={field.tooltip}>
        <span>{field.label}</span>
      </Tooltip>
    ) : (
      <span>{field.label}</span>
    )

    return (
      <Space size={4} className="cold-production-operation-label">
        {labelText}
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          aria-label={`复制${field.label}`}
          onClick={(event) => handleCopyOperationField(event, field)}
        />
      </Space>
    )
  }

  if (loading && !detail) {
    return (
      <div className="cold-production-detail-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="cold-production-detail-page">
        <Empty description="未找到矩阵包生产详情">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/matrix-package-special/cold-standby-production')}>
            返回生产线
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="cold-production-detail-page">
      <div className="cold-production-detail-head">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/matrix-package-special/cold-standby-production')}>
          返回生产线
        </Button>
      </div>

      <Row gutter={[14, 14]}>
        <Col xs={24} lg={16}>
          <Card variant="borderless" title="生产总览">
            <Descriptions column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label="矩阵包" span={2}>
                {detail.package_name || <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="开发者账号" span={2}>
                {detail.developer_company_name || detail.developer_account_name ? (
                  <Text>
                    {detail.developer_company_name || '-'} / {detail.developer_account_name || '-'}
                  </Text>
                ) : (
                  <Text type="secondary">未设置</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="包状态">
                <Tag color={detail.status_color || 'default'}>{detail.status_name || detail.status_code || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="新包版本">
                {detail.new_package_version || <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="生产节点">
                {detail.production_stage_code ? (
                  <Tag color={detail.production_stage_color || 'default'}>
                    {detail.production_stage_name || detail.production_stage_code}
                  </Tag>
                ) : (
                  <Text type="secondary">未设置</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="预计冷备完成">
                {detail.expected_cold_ready_date || <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                {detail.owner_name || <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="平台">
                {detail.platform || <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="配置完整度">
                <Progress percent={checklistPercent} size="small" />
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card variant="borderless" title="各侧信息check">
            <div className="cold-production-side-checks">
              {NOTE_SECTIONS.map((section) => {
                const note = getSideNote(sideNotes, section.type)
                const completed = hasNoteContent(sideNotes, section.type)
                const confirmed = Boolean(note?.is_confirmed)
                return (
                  <div className="cold-production-side-check-item" key={section.type}>
                    <Space size={8}>
                      {completed ? (
                        <CheckCircleOutlined className="cold-production-side-check-icon-done" />
                      ) : (
                        <ClockCircleOutlined className="cold-production-side-check-icon-pending" />
                      )}
                      <Text>{section.title}</Text>
                    </Space>
                    <Space size={6} wrap>
                      <Tag color={completed ? 'green' : 'default'}>{completed ? '已填写' : '待填写'}</Tag>
                      <Tag color={confirmed ? 'blue' : 'orange'}>{confirmed ? '已确认' : '待确认'}</Tag>
                      {!confirmed ? (
                        <Button
                          size="small"
                          disabled={!canManage || !completed}
                          loading={confirmingType === section.type}
                          onClick={() => handleConfirmNote(section.type)}
                        >
                          确认完成
                        </Button>
                      ) : null}
                    </Space>
                  </div>
                )
              })}
            </div>
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" title="节点流转">
        <Alert
          type="info"
          showIcon
          message="模块预留"
          description="后续将接入项目管理模板流程，按模板节点驱动冷备包生产流转。"
        />
      </Card>

      <Card
        variant="borderless"
        title="各侧补充信息"
        extra={<Text type={saveStatus === 'failed' ? 'danger' : 'secondary'}>{saving || saveStatus === 'saving' ? '保存中...' : saveStatus === 'pending' ? '待自动保存' : saveStatus === 'saved' ? '已自动保存' : saveStatus === 'failed' ? '自动保存失败' : ''}</Text>}
      >
        <Form
          form={form}
          layout="vertical"
          className="cold-production-note-form"
          onValuesChange={handleNoteValuesChange}
        >
          <Tabs
            className="cold-production-note-tabs"
            items={NOTE_SECTIONS.map((section) => {
              const note = sideNotes.find((item) => item.note_type === section.type)
              return {
                key: section.type,
                label: section.title,
                children: (
                  <div className="cold-production-note-pane">
                    {section.type === 'OPERATION' ? (
                      <Row gutter={[14, 8]} className="cold-production-operation-form">
                        {OPERATION_FIELDS.map((field) => (
                          <Col xs={24} md={12} key={field.name}>
                            <Form.Item
                              name={[section.type, field.name]}
                              label={renderOperationFieldLabel(field)}
                            >
                              <Input
                                allowClear
                                maxLength={500}
                                disabled={!canManage}
                                placeholder={field.placeholder}
                              />
                            </Form.Item>
                          </Col>
                        ))}
                      </Row>
                    ) : (
                      <Form.Item name={section.type}>
                        <Input.TextArea
                          rows={8}
                          maxLength={4000}
                          showCount
                          disabled={!canManage}
                          placeholder={section.placeholder}
                        />
                      </Form.Item>
                    )}
                    {note?.updated_at ? (
                      <Text type="secondary">最近更新：{note.updated_at}</Text>
                    ) : null}
                  </div>
                ),
              }
            })}
          />
        </Form>
      </Card>
    </div>
  )
}

export default ColdStandbyProductionDetailPage
