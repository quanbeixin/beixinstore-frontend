import { request } from './http'

async function normalizeApiResult(promise) {
  try {
    const result = await promise
    if (result?.success === false) {
      return {
        success: false,
        message: result?.message || '请求失败',
        code: result?.code || 'BUSINESS_ERROR',
        data: result?.data || null,
      }
    }

    return {
      success: true,
      message: result?.message || '成功',
      data: result?.data,
      code: result?.code || null,
    }
  } catch (error) {
    return {
      success: false,
      message: error?.message || '请求失败',
      code: error?.code || `HTTP_${error?.status || 0}`,
      data: error?.data || null,
    }
  }
}

export function getNotificationRulesApi(params) {
  return normalizeApiResult(request.get('/notification/rules', { params }))
}

export function createNotificationRuleApi(payload) {
  return normalizeApiResult(request.post('/notification/rules', payload))
}

export function updateNotificationRuleApi(ruleId, payload) {
  return normalizeApiResult(request.put(`/notification/rules/${ruleId}`, payload))
}

export function deleteNotificationRuleApi(ruleId) {
  return normalizeApiResult(request.delete(`/notification/rules/${ruleId}`))
}

export function triggerNotificationEventApi(payload) {
  return normalizeApiResult(request.post('/notification/event', payload))
}

export function getNotificationSendControlApi() {
  return normalizeApiResult(request.get('/notification/rules/send-control'))
}

export function updateNotificationSendControlApi(payload) {
  return normalizeApiResult(request.put('/notification/rules/send-control', payload))
}
