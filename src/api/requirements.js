import { request } from './http'

export function getRequirementsApi(params) {
  return request.get('/requirements', { params })
}

export function getRequirementByIdApi(requirementId) {
  return request.get(`/requirements/${requirementId}`)
}

export function createRequirementApi(payload) {
  return request.post('/requirements', payload)
}

export function updateRequirementApi(requirementId, payload) {
  return request.put(`/requirements/${requirementId}`, payload)
}

export function deleteRequirementApi(requirementId) {
  return request.delete(`/requirements/${requirementId}`)
}

export function updateRequirementStatusApi(requirementId, payload) {
  return request.put(`/requirements/${requirementId}/status`, payload)
}

export function updateRequirementStageApi(requirementId, payload) {
  return request.put(`/requirements/${requirementId}/stage`, payload)
}

export function updateRequirementAssigneeApi(requirementId, payload) {
  return request.put(`/requirements/${requirementId}/assignee`, payload)
}

export function updateRequirementHoursApi(requirementId, payload) {
  return request.put(`/requirements/${requirementId}/hours`, payload)
}
