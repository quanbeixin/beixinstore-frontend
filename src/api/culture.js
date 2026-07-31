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

export function getCulturePushConfigsApi(params) {
  return normalizeApiResult(request.get('/culture/push-configs', { params }))
}

export function createCulturePushConfigApi(payload) {
  return normalizeApiResult(request.post('/culture/push-configs', payload))
}

export function updateCulturePushConfigApi(id, payload) {
  return normalizeApiResult(request.put(`/culture/push-configs/${id}`, payload))
}

export function updateCulturePushConfigEnabledApi(id, enabled) {
  return normalizeApiResult(request.patch(`/culture/push-configs/${id}/enabled`, { enabled }))
}

export function deleteCulturePushConfigApi(id) {
  return normalizeApiResult(request.delete(`/culture/push-configs/${id}`))
}

export function sendCulturePushConfigTestApi(id) {
  return normalizeApiResult(request.post(`/culture/push-configs/${id}/test-send`))
}

export function getCulturePushConfigLogsApi(id, params) {
  return normalizeApiResult(request.get(`/culture/push-configs/${id}/logs`, { params }))
}

export function getCultureFeishuChatsApi(params) {
  return normalizeApiResult(request.get('/culture/feishu/chats', { params }))
}

export function getCulturePushImageUploadPolicyApi(payload) {
  return normalizeApiResult(request.post('/culture/push-configs/image-upload-policy', payload))
}
