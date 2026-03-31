import { request } from './http'
import {
  mockCreateEventTemplate,
  mockGetMetricsSummary,
  mockGetRuleAudits,
  mockGetRules,
  mockGetTemplates,
  mockSyncFeishuMappings,
  mockUpdateEventTemplateStatus,
  mockUpsertRule,
} from '../mocks/notificationConfig.mock'

const notificationApiMode = String(import.meta.env.VITE_NOTIFICATION_API_MODE || 'real')
  .trim()
  .toLowerCase()

function isMockMode() {
  return notificationApiMode === 'mock'
}

// Legacy personal settings APIs
export function updateNotificationChannelApi(payload) {
  return request.put('/notifications/settings', payload)
}

export function bindFeishuOpenIdApi(payload) {
  // Backend now discourages manual open_id binding.
  return request.put('/notifications/settings/feishu-open-id', payload)
}

export function getNotificationMetricsSummaryApi(params) {
  return request.get('/notifications/metrics/summary', { params })
}

// New config-center APIs
export function getNotificationRuleTemplatesApi(params) {
  if (isMockMode()) {
    return mockGetTemplates(params?.biz_domain || 'project_management')
  }
  return request.get('/config/notifications/templates', { params })
}

export function createNotificationEventTemplateApi(payload) {
  if (isMockMode()) {
    return mockCreateEventTemplate(payload)
  }
  return request.post('/config/notifications/events', payload)
}

export function updateNotificationEventTemplateStatusApi(templateId, payload) {
  if (isMockMode()) {
    return mockUpdateEventTemplateStatus(templateId, payload)
  }
  return request.patch(`/config/notifications/events/${templateId}/status`, payload)
}

export function getNotificationRulesApi(params) {
  if (isMockMode()) {
    return mockGetRules(params?.biz_domain || 'project_management')
  }
  return request.get('/config/notifications/rules', { params })
}

export function createNotificationRuleApi(payload) {
  if (isMockMode()) {
    return mockUpsertRule(payload)
  }
  return request.post('/config/notifications/rules', payload)
}

export function updateNotificationRuleApi(ruleId, payload) {
  if (isMockMode()) {
    return mockUpsertRule({ ...payload, id: ruleId })
  }
  return request.put(`/config/notifications/rules/${ruleId}`, payload)
}

export function getNotificationRuleAuditsApi(ruleId, params) {
  if (isMockMode()) {
    return mockGetRuleAudits(ruleId)
  }
  return request.get(`/config/notifications/rules/${ruleId}/audits`, { params })
}

export function getNotificationRuleMetricsSummaryApi(params) {
  if (isMockMode()) {
    return mockGetMetricsSummary(params?.days || 7)
  }
  return request.get('/config/notifications/metrics/summary', { params })
}

export function syncFeishuMappingsApi(payload) {
  if (isMockMode()) {
    return mockSyncFeishuMappings(payload?.mappings || [])
  }
  return request.post('/config/notifications/feishu-mappings/sync', payload)
}

export function triggerSemanticNotificationApi(payload) {
  if (isMockMode()) {
    return Promise.resolve({
      success: true,
      data: {
        event: payload,
        rules_hit: 1,
        notifications: [
          {
            rule_id: 101,
            event_type: payload?.event_type || 'TASK_OVERDUE',
            notification_id: Date.now(),
            receiver_count: 2,
            dispatched_count: 2,
            skipped_count: 0,
          },
        ],
      },
    })
  }
  return request.post('/notifications/events/semantic', payload)
}
