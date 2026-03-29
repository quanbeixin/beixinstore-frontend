import { request } from './http'

export function getBugsApi(params) {
  return request.get('/work/bugs', { params })
}

export function getBugByIdApi(id) {
  return request.get(`/work/bugs/${id}`)
}

export function createBugApi(payload) {
  return request.post('/work/bugs', payload)
}

export function updateBugApi(id, payload) {
  return request.put(`/work/bugs/${id}`, payload)
}

export function deleteBugApi(id) {
  return request.delete(`/work/bugs/${id}`)
}

export function startBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/start`, payload)
}

export function fixBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/fix`, payload)
}

export function verifyBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/verify`, payload)
}

export function reopenBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/reopen`, payload)
}

export function rejectBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/reject`, payload)
}

export function getBugAssigneesApi(params) {
  return request.get('/work/bugs/assignees', { params })
}

export function getDemandBugsApi(demandId, params) {
  return request.get(`/work/demands/${demandId}/bugs`, { params })
}

export function getDemandBugStatsApi(demandId) {
  return request.get(`/work/demands/${demandId}/bug-stats`)
}

export function getBugAttachmentPolicyApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/attachments/policy`, payload)
}

export function createBugAttachmentApi(id, payload) {
  return request.post(`/work/bugs/${id}/attachments`, payload)
}

export function deleteBugAttachmentApi(id, attachmentId) {
  return request.delete(`/work/bugs/${id}/attachments/${attachmentId}`)
}
