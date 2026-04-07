import { request } from './http'

export function getFeishuContactsApi(params) {
  return request.get('/integrations/feishu/contacts', { params })
}

export function getFeishuContactDetailApi(id) {
  return request.get(`/integrations/feishu/contacts/${id}`)
}

export function syncFeishuContactsApi(payload = {}) {
  return request.post('/integrations/feishu/contacts/sync', payload, {
    timeout: 300000,
  })
}

export function getFeishuUserBindingsApi(params) {
  return request.get('/integrations/feishu/user-bindings', { params })
}

export function getFeishuUserBindingCandidatesApi(params) {
  return request.get('/integrations/feishu/user-binding-candidates', { params })
}

export function getFeishuUserBindingRecommendationsApi(params) {
  return request.get('/integrations/feishu/user-binding-recommendations', { params })
}

export function bindFeishuUserApi(payload) {
  return request.post('/integrations/feishu/user-bindings/bind', payload)
}

export function batchBindFeishuUsersApi(payload) {
  return request.post('/integrations/feishu/user-bindings/batch-bind', payload)
}

export function unbindFeishuUserApi(payload) {
  return request.post('/integrations/feishu/user-bindings/unbind', payload)
}
