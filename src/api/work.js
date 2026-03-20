import { request } from './http'

export function getWorkItemTypesApi(params) {
  return request.get('/work/item-types', { params })
}

export function getWorkPhaseTypesApi(params) {
  return request.get('/work/phase-types', { params })
}

export function createWorkItemTypeApi(payload) {
  return request.post('/work/item-types', payload)
}

export function getWorkDemandsApi(params) {
  return request.get('/work/demands', { params })
}

export function createWorkDemandApi(payload) {
  return request.post('/work/demands', payload)
}

export function updateWorkDemandApi(demandId, payload) {
  return request.put(`/work/demands/${demandId}`, payload)
}

export function getWorkLogsApi(params) {
  return request.get('/work/logs', { params })
}

export function createWorkLogApi(payload) {
  return request.post('/work/logs', payload)
}

export function updateWorkLogApi(logId, payload) {
  return request.put(`/work/logs/${logId}`, payload)
}

export function updateWorkLogOwnerEstimateApi(logId, payload) {
  return request.put(`/work/logs/${logId}/owner-estimate`, payload)
}

export function getMyWorkbenchApi() {
  return request.get('/work/workbench/me')
}

export function getOwnerWorkbenchApi() {
  return request.get('/work/workbench/owner')
}

export function previewNoFillReminderApi() {
  return request.post('/work/reminders/no-fill')
}
