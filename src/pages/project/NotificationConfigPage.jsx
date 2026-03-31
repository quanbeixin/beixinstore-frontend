import {
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createNotificationEventTemplateApi,
  createNotificationRuleApi,
  getNotificationRuleAuditsApi,
  getNotificationRuleMetricsSummaryApi,
  getNotificationRulesApi,
  getNotificationRuleTemplatesApi,
  triggerSemanticNotificationApi,
  updateNotificationEventTemplateStatusApi,
  updateNotificationRuleApi,
} from '../../api/notifications'
import {
  AUDIT_STATES,
  GLOBAL_STATES,
  MODAL_STATES,
  useNotificationConfigStore,
} from '../../store/notificationConfigStore'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

const CHANNEL_OPTIONS = [
  { label: '站内通知', value: 'IN_APP' },
  { label: '飞书通知', value: 'FEISHU' },
]

const FREQUENCY_OPTIONS = [
  { label: '立即', value: 'IMMEDIATE' },
  { label: '每小时', value: 'HOURLY' },
  { label: '每天一次', value: 'DAILY' },
]

const RECEIVER_TYPE_HINTS = [
  'DYNAMIC|TASK_OWNER|任务负责人',
  'ROLE|BUSINESS_LINE_ADMIN|业务线管理员',
  'DEPT|10|研发部',
  'USER|23|张三',
]

function toErrorMessage(error) {
  if (!error) return '请求失败'
  if (typeof error === 'string') return error
  return error?.message || '请求失败'
}

function normalizeRuleRow(row = {}) {
  return {
    ...row,
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    channels: Array.isArray(row.channels) ? row.channels : [],
    receivers: Array.isArray(row.receivers) ? row.receivers : [],
    trigger_condition_type: row.trigger_condition_type || 'ALWAYS',
    trigger_condition: row.trigger_condition && typeof row.trigger_condition === 'object' ? row.trigger_condition : {},
  }
}

function formatReceiverText(receivers = []) {
  return receivers
    .map((item) => `${item.receiver_type || ''}|${item.receiver_value || ''}|${item.receiver_label || ''}`)
    .join('\n')
}

function parseReceiverText(raw = '') {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [receiver_type = '', receiver_value = '', receiver_label = ''] = line.split('|').map((item) => item.trim())
      return {
        receiver_type: receiver_type.toUpperCase(),
        receiver_value,
        receiver_label,
      }
    })
    .filter((item) => item.receiver_type && item.receiver_value)
}

function getTriggerConditionLabel(row = {}) {
  const conditionType = String(row.trigger_condition_type || 'ALWAYS').trim().toUpperCase()
  const condition = row.trigger_condition && typeof row.trigger_condition === 'object' ? row.trigger_condition : {}
  if (conditionType === 'STATUS_IN') {
    const statuses = Array.isArray(condition.statuses) ? condition.statuses : []
    return statuses.length > 0 ? `状态命中: ${statuses.join(', ')}` : '状态命中'
  }
  if (conditionType === 'DEADLINE_BEFORE_HOURS') {
    const hours = Number(condition.hours || 24)
    return `截止前 ${hours} 小时`
  }
  return '总是触发'
}

function NotificationConfigPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [eventForm] = Form.useForm()
  const [eventModalOpen, setEventModalOpen] = useState(false)

  const canManage = hasPermission('notification.config.manage')
  const canView = hasPermission('notification.config.view')

  const {
    bizDomain,
    globalState,
    modalState,
    auditState,
    metricDays,
    selectedRuleId,
    editingRule,
    auditRows,
    auditTotal,
    errorMessage,
    setBizDomain,
    setGlobalState,
    setModalState,
    setAuditState,
    setMetricDays,
    setErrorMessage,
    setAuditData,
    openEditModal,
    closeEditModal,
    openAuditDrawer,
    closeAuditDrawer,
  } = useNotificationConfigStore()

  const templatesQuery = useQuery({
    queryKey: ['notification-templates', bizDomain],
    queryFn: () => getNotificationRuleTemplatesApi({ biz_domain: bizDomain }),
    enabled: canView,
  })

  const rulesQuery = useQuery({
    queryKey: ['notification-rules', bizDomain],
    queryFn: () => getNotificationRulesApi({ biz_domain: bizDomain }),
    enabled: canView,
  })

  const metricsQuery = useQuery({
    queryKey: ['notification-metrics', bizDomain, metricDays],
    queryFn: () => getNotificationRuleMetricsSummaryApi({ biz_domain: bizDomain, days: metricDays }),
    enabled: canView,
  })

  const auditsQuery = useQuery({
    queryKey: ['notification-audits', selectedRuleId],
    queryFn: () => getNotificationRuleAuditsApi(selectedRuleId, { page: 1, page_size: 20 }),
    enabled: Number(selectedRuleId) > 0,
  })

  useEffect(() => {
    if (!canView) {
      setGlobalState(GLOBAL_STATES.NO_PERMISSION)
      return
    }

    if (templatesQuery.isLoading || rulesQuery.isLoading || metricsQuery.isLoading) {
      setGlobalState(GLOBAL_STATES.BOOTSTRAP_LOADING)
      return
    }

    if (templatesQuery.isError || rulesQuery.isError || metricsQuery.isError) {
      setGlobalState(GLOBAL_STATES.LOAD_ERROR)
      setErrorMessage(
        toErrorMessage(templatesQuery.error || rulesQuery.error || metricsQuery.error),
      )
      return
    }

    const rows = Array.isArray(rulesQuery.data?.data) ? rulesQuery.data.data : []
    setGlobalState(rows.length > 0 ? GLOBAL_STATES.READY : GLOBAL_STATES.EMPTY_RULES)
  }, [
    canView,
    templatesQuery.isLoading,
    rulesQuery.isLoading,
    metricsQuery.isLoading,
    templatesQuery.isError,
    rulesQuery.isError,
    metricsQuery.isError,
    templatesQuery.error,
    rulesQuery.error,
    metricsQuery.error,
    rulesQuery.data,
    setGlobalState,
    setErrorMessage,
  ])

  useEffect(() => {
    if (!selectedRuleId) return

    if (auditsQuery.isFetching) {
      setAuditState(AUDIT_STATES.LOADING)
      return
    }
    if (auditsQuery.isError) {
      setAuditState(AUDIT_STATES.ERROR)
      return
    }

    if (auditsQuery.data?.success) {
      const payload = auditsQuery.data.data || { rows: [], total: 0 }
      setAuditData(payload)
      setAuditState((payload.rows || []).length > 0 ? AUDIT_STATES.READY : AUDIT_STATES.EMPTY)
    }
  }, [
    selectedRuleId,
    auditsQuery.isFetching,
    auditsQuery.isError,
    auditsQuery.data,
    setAuditData,
    setAuditState,
  ])

  const rules = useMemo(
    () => (Array.isArray(rulesQuery.data?.data) ? rulesQuery.data.data.map(normalizeRuleRow) : []),
    [rulesQuery.data],
  )

  const templates = useMemo(
    () => (Array.isArray(templatesQuery.data?.data) ? templatesQuery.data.data : []),
    [templatesQuery.data],
  )

  const saveRuleMutation = useMutation({
    mutationFn: async (payload) => {
      const isUpdate = Number(payload.id) > 0
      return isUpdate
        ? updateNotificationRuleApi(payload.id, payload)
        : createNotificationRuleApi(payload)
    },
    onSuccess: () => {
      message.success('通知规则保存成功')
      closeEditModal()
      setModalState(MODAL_STATES.CLOSED)
      void queryClient.invalidateQueries({ queryKey: ['notification-rules', bizDomain] })
    },
    onError: (error) => {
      setModalState(MODAL_STATES.SAVE_ERROR)
      setErrorMessage(toErrorMessage(error))
      message.error(toErrorMessage(error))
    },
  })

  const toggleRuleMutation = useMutation({
    mutationFn: async (rule) =>
      updateNotificationRuleApi(rule.id, {
        biz_domain: rule.biz_domain,
        enabled: rule.enabled !== 1,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-rules', bizDomain] })
    },
    onError: (error) => {
      message.error(toErrorMessage(error))
    },
  })

  const triggerEventMutation = useMutation({
    mutationFn: async () =>
      triggerSemanticNotificationApi({
        event_id: `TASK_OVERDUE_${Date.now()}`,
        biz_domain: bizDomain,
        event_type: bizDomain === 'efficiency' ? 'NO_FILL_REMINDER' : 'TASK_OVERDUE',
        biz_id: Number(Date.now().toString().slice(-8)),
        payload: {
          task_title: '前端联调任务',
          owner_user_id: 1,
          owner_name: '系统管理员',
          due_at: formatBeijingDateTime(new Date()),
          detail_url: '/work-demands',
        },
      }),
    onSuccess: (result) => {
      message.success(`事件触发成功，命中规则 ${result?.data?.rules_hit || 0} 条`)
      void queryClient.invalidateQueries({ queryKey: ['notification-metrics', bizDomain, metricDays] })
    },
    onError: (error) => {
      message.error(toErrorMessage(error))
    },
  })

  const createEventMutation = useMutation({
    mutationFn: async (payload) => createNotificationEventTemplateApi(payload),
    onSuccess: () => {
      message.success('通知事件新增成功')
      setEventModalOpen(false)
      eventForm.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['notification-templates', bizDomain] })
    },
    onError: (error) => {
      message.error(toErrorMessage(error))
    },
  })

  const updateEventStatusMutation = useMutation({
    mutationFn: async ({ templateId, enabled }) =>
      updateNotificationEventTemplateStatusApi(templateId, { enabled }),
    onSuccess: () => {
      message.success('事件状态更新成功')
      void queryClient.invalidateQueries({ queryKey: ['notification-templates', bizDomain] })
      void queryClient.invalidateQueries({ queryKey: ['notification-rules', bizDomain] })
    },
    onError: (error) => {
      message.error(toErrorMessage(error))
    },
  })

  const openEdit = (rule) => {
    openEditModal(rule)
    setModalState(MODAL_STATES.OPEN_EDIT)
    form.setFieldsValue({
      id: rule.id,
      rule_name: rule.rule_name,
      biz_domain: rule.biz_domain,
      event_type: rule.event_type,
      channels: rule.channels,
      frequency: rule.frequency,
      trigger_condition_type: rule.trigger_condition_type || 'ALWAYS',
      trigger_statuses: Array.isArray(rule.trigger_condition?.statuses) ? rule.trigger_condition.statuses.join(', ') : '',
      trigger_hours: Number(rule.trigger_condition?.hours || 24),
      enabled: rule.enabled === 1,
      receivers_text: formatReceiverText(rule.receivers),
    })
  }

  const handleCreateByTemplate = (template) => {
    openEditModal(null)
    setModalState(MODAL_STATES.OPEN_EDIT)
    form.setFieldsValue({
      id: null,
      rule_name: template.template_name,
      biz_domain: template.biz_domain,
      event_type: template.event_type,
      channels: template.default_channels || ['IN_APP'],
      frequency: template.default_frequency || 'DAILY',
      trigger_condition_type: 'ALWAYS',
      trigger_statuses: '',
      trigger_hours: 24,
      enabled: false,
      receivers_text: formatReceiverText(template.default_receivers || []),
      template_id: template.id,
    })
  }

  const handleSave = async () => {
    try {
      setModalState(MODAL_STATES.VALIDATING)
      const values = await form.validateFields()
      const receivers = parseReceiverText(values.receivers_text || '')
      if (receivers.length === 0) {
        throw new Error('至少需要一个接收人')
      }

      const triggerConditionType = String(values.trigger_condition_type || 'ALWAYS').trim().toUpperCase()
      let triggerCondition = {}
      if (triggerConditionType === 'STATUS_IN') {
        const statuses = String(values.trigger_statuses || '')
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean)
        if (!statuses.length) throw new Error('状态命中模式下，请至少填写一个状态')
        triggerCondition = { statuses }
      } else if (triggerConditionType === 'DEADLINE_BEFORE_HOURS') {
        const hours = Number(values.trigger_hours)
        if (!Number.isFinite(hours) || hours <= 0) throw new Error('截止前小时数必须大于0')
        triggerCondition = { hours: Math.floor(hours) }
      }

      setModalState(MODAL_STATES.SAVING)
      saveRuleMutation.mutate({
        id: values.id || undefined,
        template_id: values.template_id || undefined,
        biz_domain: values.biz_domain,
        event_type: values.event_type,
        rule_name: values.rule_name,
        channels: values.channels || [],
        frequency: values.frequency,
        trigger_condition_type: triggerConditionType,
        trigger_condition: triggerCondition,
        enabled: values.enabled === true,
        receivers,
      })
    } catch (error) {
      setModalState(MODAL_STATES.SAVE_ERROR)
      setErrorMessage(toErrorMessage(error))
    }
  }

  const handleCreateEvent = async () => {
    try {
      const values = await eventForm.validateFields()
      const receivers = parseReceiverText(values.default_receivers_text || '')
      createEventMutation.mutate({
        biz_domain: values.biz_domain,
        event_name: values.event_name,
        template_name: values.template_name,
        description: values.description,
        default_channels: values.default_channels || ['IN_APP'],
        default_frequency: values.default_frequency || 'DAILY',
        default_receivers: receivers,
      })
    } catch (error) {
      if (!error?.errorFields) {
        message.error(toErrorMessage(error))
      }
    }
  }

  const metrics = metricsQuery.data?.data || {}
  const eventTypeOptions = useMemo(() => {
    const map = new Map()
    templates.forEach((item) => {
      const key = String(item.event_type || '').trim().toUpperCase()
      if (!key) return
      map.set(key, item.event_name || item.template_name || key)
    })
    rules.forEach((item) => {
      const key = String(item.event_type || '').trim().toUpperCase()
      if (!key || map.has(key)) return
      map.set(key, item.event_name || item.rule_name || key)
    })
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [templates, rules])

  const columns = [
    {
      title: '事件',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Tag color="blue">{row.event_name || row.event_type}</Tag>
          <Text type="secondary">{row.rule_name}</Text>
        </Space>
      ),
    },
    {
      title: '频率',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 120,
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: '触发条件',
      key: 'trigger_condition',
      width: 220,
      render: (_, row) => <Tag color="cyan">{getTriggerConditionLabel(row)}</Tag>,
    },
    {
      title: '通道',
      dataIndex: 'channels',
      key: 'channels',
      width: 180,
      render: (channels) => (
        <Space wrap>
          {(channels || []).map((item) => (
            <Tag key={item} color={item === 'FEISHU' ? 'geekblue' : 'green'}>
              {item}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '接收人',
      dataIndex: 'receivers',
      key: 'receivers',
      render: (receivers) => (
        <Space wrap>
          {(receivers || []).map((item) => (
            <Tag key={`${item.receiver_type}_${item.receiver_value}`}>
              {item.receiver_type}:{item.receiver_label || item.receiver_value}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled, row) => (
        <Switch
          checked={Number(enabled) === 1}
          disabled={!canManage}
          loading={toggleRuleMutation.isPending}
          onChange={() => toggleRuleMutation.mutate(row)}
        />
      ),
    },
    {
      title: '上次触发',
      dataIndex: 'last_triggered_at',
      key: 'last_triggered_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} disabled={!canManage}>
            编辑
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openAuditDrawer(row.id)}>
            审计
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title="通知配置"
        extra={
          <Space>
            <Select
              style={{ width: 160 }}
              value={bizDomain}
              options={[
                { label: '项目管理', value: 'project_management' },
                { label: '人效', value: 'efficiency' },
              ]}
              onChange={(value) => setBizDomain(value)}
            />
            <Select
              style={{ width: 120 }}
              value={metricDays}
              options={[
                { label: '7天', value: 7 },
                { label: '30天', value: 30 },
              ]}
              onChange={(value) => setMetricDays(value)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void queryClient.invalidateQueries({ queryKey: ['notification-rules', bizDomain] })}>
              刷新
            </Button>
            <Button icon={<PlusOutlined />} disabled={!canManage} onClick={() => {
              eventForm.setFieldsValue({
                biz_domain: bizDomain,
                default_channels: ['IN_APP', 'FEISHU'],
                default_frequency: 'DAILY',
                default_receivers_text: 'DYNAMIC|TASK_OWNER|负责人',
              })
              setEventModalOpen(true)
            }}>
              新增事件
            </Button>
            <Button icon={<SendOutlined />} loading={triggerEventMutation.isPending} onClick={() => triggerEventMutation.mutate()}>
              触发示例事件
            </Button>
          </Space>
        }
      >
        {globalState === GLOBAL_STATES.BOOTSTRAP_LOADING && <Alert type="info" message="加载中..." showIcon />}
        {globalState === GLOBAL_STATES.NO_PERMISSION && <Alert type="warning" message="当前账号无权限访问通知配置" showIcon />}
        {globalState === GLOBAL_STATES.LOAD_ERROR && <Alert type="error" message={`加载失败：${errorMessage}`} showIcon />}

        {(globalState === GLOBAL_STATES.READY || globalState === GLOBAL_STATES.EMPTY_RULES) && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="通知指标">
              <Row gutter={12}>
                <Col span={6}>
                  <Statistic title="通知数" value={metrics.notification_count || 0} />
                </Col>
                <Col span={6}>
                  <Statistic title="规则数" value={metrics.rule_count || 0} />
                </Col>
                <Col span={6}>
                  <Statistic title="接收总数" value={metrics.total_receivers || 0} />
                </Col>
                <Col span={6}>
                  <Statistic title="送达率" value={metrics.delivery_rate || 0} precision={4} />
                </Col>
              </Row>
            </Card>

            <Card size="small" title={`模板（${templates.length}）`}>
              <Space wrap>
                {templates.map((template) => (
                  <Card key={template.id} size="small" style={{ minWidth: 260 }}>
                    <Space direction="vertical" size={6}>
                      <Tag color="purple">{template.template_name}</Tag>
                      <Text type="secondary">{template.event_name}</Text>
                      <Text type="secondary">事件编码：{template.event_type}</Text>
                      <Text type="secondary">默认频率：{template.default_frequency}</Text>
                      <Space>
                        <Tag color={Number(template.enabled) === 1 ? 'green' : 'default'}>
                          {Number(template.enabled) === 1 ? '启用' : '停用'}
                        </Tag>
                        <Switch
                          size="small"
                          checked={Number(template.enabled) === 1}
                          disabled={!canManage || Number(template.is_builtin) === 1}
                          loading={updateEventStatusMutation.isPending}
                          onChange={(checked) => updateEventStatusMutation.mutate({
                            templateId: template.id,
                            enabled: checked,
                          })}
                        />
                      </Space>
                      <Button size="small" disabled={!canManage} onClick={() => handleCreateByTemplate(template)}>
                        基于模板创建规则
                      </Button>
                    </Space>
                  </Card>
                ))}
              </Space>
            </Card>

            <Table
              rowKey="id"
              loading={rulesQuery.isLoading}
              columns={columns}
              dataSource={rules}
              pagination={false}
              scroll={{ x: 1200 }}
              locale={{ emptyText: '暂无规则' }}
            />
          </Space>
        )}
      </Card>

      <Modal
        title={editingRule ? '编辑通知规则' : '新建通知规则'}
        open={modalState !== MODAL_STATES.CLOSED}
        onCancel={closeEditModal}
        onOk={handleSave}
        confirmLoading={saveRuleMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="template_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="业务域" name="biz_domain" rules={[{ required: true, message: '请选择业务域' }]}>
            <Select
              options={[
                { label: '项目管理', value: 'project_management' },
                { label: '人效', value: 'efficiency' },
              ]}
            />
          </Form.Item>
          <Form.Item label="事件类型" name="event_type" rules={[{ required: true, message: '请选择事件类型' }]}>
            <Select options={eventTypeOptions} />
          </Form.Item>
          <Form.Item label="规则名称" name="rule_name" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item label="通道" name="channels" rules={[{ required: true, message: '至少选择一个通道' }]}>
            <Select mode="multiple" options={CHANNEL_OPTIONS} />
          </Form.Item>
          <Form.Item label="频率" name="frequency" rules={[{ required: true, message: '请选择频率' }]}>
            <Select options={FREQUENCY_OPTIONS} />
          </Form.Item>
          <Form.Item label="触发条件" name="trigger_condition_type" rules={[{ required: true, message: '请选择触发条件' }]}>
            <Select
              options={[
                { label: '总是触发', value: 'ALWAYS' },
                { label: '状态命中触发', value: 'STATUS_IN' },
                { label: '截止前N小时触发', value: 'DEADLINE_BEFORE_HOURS' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue('trigger_condition_type') === 'STATUS_IN' ? (
                <Form.Item
                  label="触发状态（逗号分隔）"
                  name="trigger_statuses"
                  rules={[{ required: true, message: '请填写触发状态' }]}
                  extra="示例：RISK,ESCALATED,BLOCKED"
                >
                  <Input placeholder="如：RISK,ESCALATED" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue('trigger_condition_type') === 'DEADLINE_BEFORE_HOURS' ? (
                <Form.Item
                  label="截止前小时数"
                  name="trigger_hours"
                  rules={[{ required: true, message: '请输入截止前小时数' }]}
                >
                  <Input type="number" min={1} max={720} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="接收人（每行：TYPE|VALUE|LABEL）"
            name="receivers_text"
            rules={[{ required: true, message: '请至少配置一条接收人' }]}
            extra={`示例：${RECEIVER_TYPE_HINTS.join(' / ')}`}
          >
            <Input.TextArea rows={6} />
          </Form.Item>
          {modalState === MODAL_STATES.SAVE_ERROR && errorMessage ? (
            <Alert type="error" message={errorMessage} showIcon />
          ) : null}
        </Form>
      </Modal>

      <Modal
        title="新增通知事件"
        open={eventModalOpen}
        onCancel={() => setEventModalOpen(false)}
        onOk={handleCreateEvent}
        confirmLoading={createEventMutation.isPending}
      >
        <Form form={eventForm} layout="vertical">
          <Form.Item label="业务域" name="biz_domain" rules={[{ required: true, message: '请选择业务域' }]}>
            <Select
              options={[
                { label: '项目管理', value: 'project_management' },
                { label: '人效', value: 'efficiency' },
              ]}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="事件编码将由系统自动生成，您只需填写事件名称。"
          />
          <Form.Item label="事件名称" name="event_name" rules={[{ required: true, message: '请输入事件名称' }]}>
            <Input maxLength={128} placeholder="如：任务升级提醒" />
          </Form.Item>
          <Form.Item label="模板名称" name="template_name">
            <Input maxLength={128} placeholder="默认自动生成：{事件名称}提醒" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item label="默认通道" name="default_channels" rules={[{ required: true, message: '请选择至少一个通道' }]}>
            <Select mode="multiple" options={CHANNEL_OPTIONS} />
          </Form.Item>
          <Form.Item label="默认频率" name="default_frequency" rules={[{ required: true, message: '请选择默认频率' }]}>
            <Select options={FREQUENCY_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="默认接收人（每行：TYPE|VALUE|LABEL）"
            name="default_receivers_text"
            extra={`示例：${RECEIVER_TYPE_HINTS.join(' / ')}`}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`规则审计 #${selectedRuleId || ''}`}
        open={auditState !== AUDIT_STATES.CLOSED}
        onClose={closeAuditDrawer}
        width={560}
      >
        {auditState === AUDIT_STATES.LOADING && <Alert type="info" message="审计加载中..." showIcon />}
        {auditState === AUDIT_STATES.ERROR && <Alert type="error" message="审计加载失败" showIcon />}
        {auditState === AUDIT_STATES.EMPTY && <Alert type="warning" message="暂无审计记录" showIcon />}
        {auditState === AUDIT_STATES.READY && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">总计 {auditTotal} 条</Text>
            {auditRows.map((item) => (
              <Card key={item.id} size="small">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="操作类型">{item.operation_type}</Descriptions.Item>
                  <Descriptions.Item label="操作人">{item.operator_name}</Descriptions.Item>
                  <Descriptions.Item label="时间">{formatBeijingDateTime(item.created_at)}</Descriptions.Item>
                  <Descriptions.Item label="备注">{item.remark || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </Space>
        )}
      </Drawer>

      {!canManage ? (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message="当前账号仅可查看通知配置，如需修改请分配 notification.config.manage 权限。"
        />
      ) : null}
    </div>
  )
}

export default NotificationConfigPage
