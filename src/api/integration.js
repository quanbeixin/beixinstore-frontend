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
