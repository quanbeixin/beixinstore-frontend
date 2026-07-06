import { request } from './http'

export function getDeveloperAccountsApi(params = {}) {
  return request.get('/developer-accounts', { params })
}

export function getDeveloperAccountOptionsApi() {
  return request.get('/developer-accounts/options')
}

export function createDeveloperAccountApi(payload) {
  return request.post('/developer-accounts', payload)
}

export function updateDeveloperAccountApi(id, payload) {
  return request.put(`/developer-accounts/${id}`, payload)
}

export function deleteDeveloperAccountApi(id) {
  return request.delete(`/developer-accounts/${id}`)
}
