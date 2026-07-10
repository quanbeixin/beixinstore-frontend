import { request } from './http'

function normalizeApiResult(promise) {
  return promise
    .then((result) => ({
      success: result?.success !== false,
      message: result?.message || '成功',
      data: result?.data,
      code: result?.code || null,
    }))
    .catch((error) => ({
      success: false,
      message: error?.message || '请求失败',
      code: error?.code || `HTTP_${error?.status || 0}`,
      data: error?.data || null,
    }))
}

export function getMatrixPackageNotificationMetaApi() {
  return normalizeApiResult(request.get('/matrix-package-notifications/meta'))
}

export function getMatrixPackageNotificationRulesApi() {
  return normalizeApiResult(request.get('/matrix-package-notifications'))
}

export function createMatrixPackageNotificationRuleApi(payload) {
  return normalizeApiResult(request.post('/matrix-package-notifications', payload))
}

export function updateMatrixPackageNotificationRuleApi(id, payload) {
  return normalizeApiResult(request.put(`/matrix-package-notifications/${id}`, payload))
}

export function deleteMatrixPackageNotificationRuleApi(id) {
  return normalizeApiResult(request.delete(`/matrix-package-notifications/${id}`))
}

export function getMatrixPackageNotificationFeishuChatsApi(params = {}) {
  return normalizeApiResult(request.get('/matrix-package-notifications/feishu/chats', { params }))
}

export function getNotificationTemplateFilesApi() {
  return normalizeApiResult(request.get('/matrix-package-notifications/template-files'))
}

export function upsertNotificationTemplateFileApi(templateKey, payload) {
  return normalizeApiResult(request.put(`/matrix-package-notifications/template-files/${templateKey}`, payload))
}

export function deleteNotificationTemplateFileApi(templateKey) {
  return normalizeApiResult(request.delete(`/matrix-package-notifications/template-files/${templateKey}`))
}

export function getNotificationTemplateFileUploadPolicyApi(payload = {}) {
  return normalizeApiResult(request.post('/matrix-package-notifications/template-files/upload-policy', payload))
}
