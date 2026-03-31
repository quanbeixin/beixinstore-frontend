import { request } from './http'

export function getUsersApi(params) {
  return request.get('/users', { params })
}

export function getUserByIdApi(userId) {
  return request.get(`/users/${userId}`)
}

export function getUserChangeLogsApi(params) {
  return request.get('/users/change-logs', { params })
}

export function createUserApi(payload) {
  return request.post('/users', payload)
}

export function updateUserApi(userId, payload) {
  return request.post(`/users/${userId}/update`, payload)
}

export function deleteUserApi(userId) {
  return request.post(`/users/${userId}/delete`)
}

export function syncUsersFromFeishuApi(payload) {
  return request.post('/users/sync-feishu', payload)
}

export function getFeishuContactsApi(params) {
  return request.get('/users/feishu-contacts', { params })
}

export function saveFeishuSyncScopesApi(payload) {
  return request.put('/users/feishu-sync-scopes', payload)
}
