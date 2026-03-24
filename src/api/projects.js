import { request } from './http'

export function getProjectsApi(params) {
  return request.get('/projects', { params })
}

export function getProjectByIdApi(projectId) {
  return request.get(`/projects/${projectId}`)
}

export function createProjectApi(payload) {
  return request.post('/projects', payload)
}

export function updateProjectApi(projectId, payload) {
  return request.put(`/projects/${projectId}`, payload)
}

export function deleteProjectApi(projectId) {
  return request.delete(`/projects/${projectId}`)
}

export function getProjectMembersApi(projectId) {
  return request.get(`/projects/${projectId}/members`)
}

export function addProjectMemberApi(projectId, payload) {
  return request.post(`/projects/${projectId}/members`, payload)
}

export function updateProjectMemberApi(projectId, memberId, payload) {
  return request.put(`/projects/${projectId}/members/${memberId}`, payload)
}

export function deleteProjectMemberApi(projectId, memberId) {
  return request.delete(`/projects/${projectId}/members/${memberId}`)
}

export function getProjectActivityLogsApi(projectId, params) {
  return request.get(`/projects/${projectId}/activity-logs`, { params })
}
