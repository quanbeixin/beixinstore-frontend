import { request } from './http'

export function getBugsApi(params) {
  return request.get('/bugs', { params })
}

export function getBugByIdApi(bugId) {
  return request.get(`/bugs/${bugId}`)
}

export function createBugApi(payload) {
  return request.post('/bugs', payload)
}

export function updateBugApi(bugId, payload) {
  return request.put(`/bugs/${bugId}`, payload)
}

export function deleteBugApi(bugId) {
  return request.delete(`/bugs/${bugId}`)
}

export function updateBugStatusApi(bugId, payload) {
  return request.put(`/bugs/${bugId}/status`, payload)
}

export function updateBugStageApi(bugId, payload) {
  return request.put(`/bugs/${bugId}/stage`, payload)
}

export function updateBugAssigneeApi(bugId, payload) {
  return request.put(`/bugs/${bugId}/assignee`, payload)
}

export function updateBugHoursApi(bugId, payload) {
  return request.put(`/bugs/${bugId}/hours`, payload)
}
