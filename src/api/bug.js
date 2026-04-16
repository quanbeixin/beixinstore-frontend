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

export function transitionBugApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/transition`, payload)
}

export function createBugCommentApi(id, payload = {}) {
  return request.post(`/work/bugs/${id}/comments`, payload)
}

export function updateBugCommentApi(id, commentLogId, payload = {}) {
  return request.put(`/work/bugs/${id}/comments/${commentLogId}`, payload)
}

export function getBugCommentAttachmentPolicyApi(id, commentLogId, payload = {}) {
  return request.post(`/work/bugs/${id}/comments/${commentLogId}/attachments/policy`, payload)
}

export function createBugCommentAttachmentApi(id, commentLogId, payload = {}) {
  return request.post(`/work/bugs/${id}/comments/${commentLogId}/attachments`, payload)
}

export function deleteBugCommentAttachmentApi(id, commentLogId, attachmentId) {
  return request.delete(`/work/bugs/${id}/comments/${commentLogId}/attachments/${attachmentId}`)
}

export function getBugAssigneesApi(params) {
  return request.get('/work/bugs/assignees', { params })
}

export function getBugWorkflowConfigApi() {
  return request.get('/work/bugs/workflow/config')
}

export function updateBugWorkflowConfigApi(payload) {
  return request.put('/work/bugs/workflow/config', payload)
}

export function getBugViewsApi() {
  return request.get('/work/bugs/views')
}

export function getBugViewByIdApi(viewId) {
  return request.get(`/work/bugs/views/${viewId}`)
}

export function createBugViewApi(payload) {
  return request.post('/work/bugs/views', payload)
}

export function updateBugViewApi(viewId, payload) {
  return request.put(`/work/bugs/views/${viewId}`, payload)
}

export function deleteBugViewApi(viewId) {
  return request.delete(`/work/bugs/views/${viewId}`)
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

export function precheckBugAttachmentApi(payload = {}) {
  return request.post('/work/bugs/attachments/precheck', payload)
}

export function createBugAttachmentApi(id, payload) {
  return request.post(`/work/bugs/${id}/attachments`, payload)
}

export function deleteBugAttachmentApi(id, attachmentId) {
  return request.delete(`/work/bugs/${id}/attachments/${attachmentId}`)
}
