const deepClone = (value) => JSON.parse(JSON.stringify(value))

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

const MOCK_DB = {
  templates: {
    project_management: [
      {
        id: 1,
        template_code: 'PM_TASK_OVERDUE',
        template_name: '任务逾期提醒',
        biz_domain: 'project_management',
        event_type: 'TASK_OVERDUE',
        event_name: '任务逾期',
        description: '任务超过截止时间后触发提醒',
        default_channels: ['IN_APP', 'FEISHU'],
        default_frequency: 'DAILY',
        default_receivers: [
          { receiver_type: 'DYNAMIC', receiver_value: 'TASK_OWNER', receiver_label: '任务负责人' },
          { receiver_type: 'ROLE', receiver_value: 'BUSINESS_LINE_ADMIN', receiver_label: '业务线管理员' },
        ],
        enabled: 1,
      },
      {
        id: 2,
        template_code: 'PM_BUG_TIMEOUT',
        template_name: 'Bug超时提醒',
        biz_domain: 'project_management',
        event_type: 'BUG_TIMEOUT',
        event_name: 'Bug超时',
        description: 'Bug在指定时限内未处理时触发提醒',
        default_channels: ['IN_APP'],
        default_frequency: 'HOURLY',
        default_receivers: [
          { receiver_type: 'DYNAMIC', receiver_value: 'TASK_OWNER', receiver_label: 'Bug负责人' },
        ],
        enabled: 1,
      },
    ],
    efficiency: [
      {
        id: 3,
        template_code: 'EFF_NO_FILL_REMINDER',
        template_name: '未填报提醒',
        biz_domain: 'efficiency',
        event_type: 'NO_FILL_REMINDER',
        event_name: '未填报提醒',
        description: '成员未完成填报时触发提醒',
        default_channels: ['IN_APP', 'FEISHU'],
        default_frequency: 'DAILY',
        default_receivers: [
          { receiver_type: 'DYNAMIC', receiver_value: 'TASK_OWNER', receiver_label: '填报责任人' },
        ],
        enabled: 1,
      },
    ],
  },
  rules: [
    {
      id: 101,
      rule_code: 'N_RULE_4d887ab65f5c4813',
      rule_name: '任务逾期提醒',
      biz_domain: 'project_management',
      biz_line_id: 1,
      event_type: 'TASK_OVERDUE',
      template_id: 1,
      template_name: '任务逾期提醒',
      event_name: '任务逾期',
      channels: ['IN_APP', 'FEISHU'],
      frequency: 'DAILY',
      trigger_condition_type: 'ALWAYS',
      trigger_condition: {},
      enabled: 1,
      last_triggered_at: '2026-03-31 14:30:00',
      receivers: [
        { id: 2001, receiver_type: 'DYNAMIC', receiver_value: 'TASK_OWNER', receiver_label: '任务负责人', enabled: 1 },
        { id: 2002, receiver_type: 'ROLE', receiver_value: 'BUSINESS_LINE_ADMIN', receiver_label: '业务线管理员', enabled: 1 },
      ],
    },
    {
      id: 102,
      rule_code: 'N_RULE_d89e8d6f7e9a4f9a',
      rule_name: 'Bug超时提醒',
      biz_domain: 'project_management',
      biz_line_id: 1,
      event_type: 'BUG_TIMEOUT',
      template_id: 2,
      template_name: 'Bug超时提醒',
      event_name: 'Bug超时',
      channels: ['IN_APP'],
      frequency: 'HOURLY',
      trigger_condition_type: 'ALWAYS',
      trigger_condition: {},
      enabled: 0,
      last_triggered_at: null,
      receivers: [
        { id: 2010, receiver_type: 'DYNAMIC', receiver_value: 'TASK_OWNER', receiver_label: 'Bug负责人', enabled: 1 },
      ],
    },
  ],
  audits: {
    101: [
      {
        id: 5001,
        rule_id: 101,
        biz_domain: 'project_management',
        biz_line_id: 1,
        operation_type: 'CREATE',
        operator_id: 1,
        operator_name: 'MockAdmin',
        before_json: null,
        after_json: { enabled: 1 },
        remark: '创建通知规则',
        created_at: '2026-03-31 10:00:00',
      },
    ],
    102: [],
  },
  metrics: {
    window_days: 7,
    notification_count: 38,
    rule_count: 2,
    total_receivers: 120,
    success_receivers: 112,
    failed_receivers: 3,
    skipped_receivers: 5,
    delivery_rate: 0.9767,
    failure_rate: 0.0262,
  },
}

function addAudit(ruleId, payload = {}) {
  const list = MOCK_DB.audits[ruleId] || []
  list.unshift({
    id: Date.now(),
    rule_id: ruleId,
    biz_domain: payload.biz_domain || 'project_management',
    biz_line_id: payload.biz_line_id || 1,
    operation_type: payload.operation_type || 'UPDATE',
    operator_id: 1,
    operator_name: 'MockAdmin',
    before_json: payload.before_json || null,
    after_json: payload.after_json || null,
    remark: payload.remark || 'mock_update',
    created_at: now(),
  })
  MOCK_DB.audits[ruleId] = list
}

function delay(ms = 220) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function mockGetTemplates(bizDomain) {
  await delay()
  return {
    success: true,
    data: deepClone(MOCK_DB.templates[bizDomain] || []),
  }
}

export async function mockGetRules(bizDomain) {
  await delay()
  return {
    success: true,
    data: deepClone(MOCK_DB.rules.filter((item) => item.biz_domain === bizDomain)),
  }
}

export async function mockCreateEventTemplate(payload = {}) {
  await delay(180)
  const bizDomain = String(payload.biz_domain || 'project_management').trim().toLowerCase()
  const eventType = String(payload.event_type || '').trim().toUpperCase()
  if (!eventType) {
    return { success: false, message: 'event_type 不能为空' }
  }

  const list = MOCK_DB.templates[bizDomain] || []
  if (list.some((item) => String(item.event_type || '').toUpperCase() === eventType)) {
    return { success: false, message: '该业务域事件已存在' }
  }

  const created = {
    id: Date.now(),
    template_code: `CUS_${bizDomain.toUpperCase()}_${eventType}_${Date.now()}`,
    template_name: payload.template_name || `${payload.event_name || eventType}提醒`,
    biz_domain: bizDomain,
    event_type: eventType,
    event_name: payload.event_name || eventType,
    description: payload.description || '',
    default_channels: Array.isArray(payload.default_channels) && payload.default_channels.length > 0
      ? payload.default_channels
      : ['IN_APP', 'FEISHU'],
    default_frequency: payload.default_frequency || 'DAILY',
    default_receivers: Array.isArray(payload.default_receivers) ? payload.default_receivers : [],
    enabled: 1,
    is_builtin: 0,
  }

  if (!MOCK_DB.templates[bizDomain]) {
    MOCK_DB.templates[bizDomain] = []
  }
  MOCK_DB.templates[bizDomain].push(created)
  return { success: true, data: deepClone(created) }
}

export async function mockUpdateEventTemplateStatus(templateId, payload = {}) {
  await delay(130)
  const id = Number(templateId)
  const enabled = payload.enabled === true || payload.enabled === 1 || payload.enabled === '1' || payload.enabled === 'true'

  for (const bizDomain of Object.keys(MOCK_DB.templates)) {
    const index = MOCK_DB.templates[bizDomain].findIndex((item) => Number(item.id) === id)
    if (index < 0) continue

    const current = MOCK_DB.templates[bizDomain][index]
    if (Number(current.is_builtin) === 1 && !enabled) {
      return { success: false, message: '内置事件不允许禁用' }
    }

    MOCK_DB.templates[bizDomain][index] = {
      ...current,
      enabled: enabled ? 1 : 0,
    }
    return { success: true, data: deepClone(MOCK_DB.templates[bizDomain][index]) }
  }

  return { success: false, message: '事件模板不存在' }
}

export async function mockUpsertRule(payload = {}) {
  await delay()
  const isUpdate = Number(payload.id) > 0
  if (isUpdate) {
    const index = MOCK_DB.rules.findIndex((item) => Number(item.id) === Number(payload.id))
    if (index >= 0) {
      const before = deepClone(MOCK_DB.rules[index])
      MOCK_DB.rules[index] = {
        ...MOCK_DB.rules[index],
        ...payload,
        trigger_condition_type: payload.trigger_condition_type || MOCK_DB.rules[index].trigger_condition_type || 'ALWAYS',
        trigger_condition: payload.trigger_condition || MOCK_DB.rules[index].trigger_condition || {},
        enabled: payload.enabled === undefined ? MOCK_DB.rules[index].enabled : Number(payload.enabled ? 1 : 0),
      }
      addAudit(MOCK_DB.rules[index].id, {
        biz_domain: MOCK_DB.rules[index].biz_domain,
        operation_type: 'UPDATE',
        before_json: before,
        after_json: deepClone(MOCK_DB.rules[index]),
        remark: 'mock_update_rule',
      })
      return { success: true, data: deepClone(MOCK_DB.rules[index]) }
    }
  }

  const created = {
    id: Date.now(),
    rule_code: `N_RULE_${Date.now()}`,
    rule_name: payload.rule_name || '新规则',
    biz_domain: payload.biz_domain || 'project_management',
    biz_line_id: 1,
    event_type: payload.event_type || 'TASK_OVERDUE',
    template_id: payload.template_id || null,
    channels: payload.channels || ['IN_APP'],
    frequency: payload.frequency || 'DAILY',
    trigger_condition_type: payload.trigger_condition_type || 'ALWAYS',
    trigger_condition: payload.trigger_condition || {},
    enabled: Number(payload.enabled ? 1 : 0),
    last_triggered_at: null,
    receivers: payload.receivers || [],
  }
  MOCK_DB.rules.unshift(created)
  addAudit(created.id, {
    biz_domain: created.biz_domain,
    operation_type: 'CREATE',
    before_json: null,
    after_json: deepClone(created),
    remark: 'mock_create_rule',
  })
  return { success: true, data: deepClone(created) }
}

export async function mockGetRuleAudits(ruleId) {
  await delay(140)
  const rows = deepClone(MOCK_DB.audits[ruleId] || [])
  return {
    success: true,
    data: {
      rows,
      total: rows.length,
      page: 1,
      pageSize: 20,
    },
  }
}

export async function mockGetMetricsSummary(days = 7) {
  await delay(120)
  return {
    success: true,
    data: {
      ...deepClone(MOCK_DB.metrics),
      window_days: Number(days) || 7,
    },
  }
}

export async function mockSyncFeishuMappings(records = []) {
  await delay(180)
  return {
    success: true,
    data: {
      synced_count: Array.isArray(records) ? records.length : 0,
    },
  }
}
