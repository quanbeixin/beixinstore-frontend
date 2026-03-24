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

export function getWorkDemandByIdApi(demandId) {
  return request.get(`/work/demands/${demandId}`)
}

export function createWorkDemandApi(payload) {
  return request.post('/work/demands', payload)
}

export function updateWorkDemandApi(demandId, payload) {
  return request.put(`/work/demands/${demandId}`, payload)
}

export function deleteWorkDemandApi(demandId) {
  return request.delete(`/work/demands/${demandId}`)
}

export function getArchivedDemandsApi(params) {
  return request.get('/work/archive/demands', { params })
}

export function purgeArchivedDemandApi(demandId, payload) {
  return request.delete(`/work/archive/demands/${demandId}/purge`, {
    data: payload || {},
  })
}

export function initDemandWorkflowApi(demandId) {
  return request.post(`/work/demands/${demandId}/workflow/init`)
}

export function getDemandWorkflowApi(demandId) {
  return request.get(`/work/demands/${demandId}/workflow`)
}

export function assignDemandWorkflowCurrentNodeApi(demandId, payload) {
  return request.post(`/work/demands/${demandId}/workflow/current/assign`, payload)
}

export function assignDemandWorkflowNodeApi(demandId, nodeKey, payload) {
  return request.post(`/work/demands/${demandId}/workflow/nodes/${nodeKey}/assign`, payload)
}

export function submitDemandWorkflowCurrentNodeApi(demandId, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/current/submit`, payload)
}

export function getWorkLogsApi(params) {
  return request.get('/work/logs', { params })
}

export function createWorkLogApi(payload) {
  return request.post('/work/logs', payload)
}

export function createOwnerAssignedLogApi(payload) {
  return request.post('/work/logs/owner-assign', payload)
}

export function updateWorkLogApi(logId, payload) {
  return request.put(`/work/logs/${logId}`, payload)
}

export function deleteWorkLogApi(logId) {
  return request.delete(`/work/logs/${logId}`)
}

export function getLogDailyPlansApi(logId, params) {
  return request.get(`/work/logs/${logId}/daily-plans`, { params })
}

export function upsertLogDailyPlanApi(logId, payload) {
  return request.post(`/work/logs/${logId}/daily-plan`, payload)
}

export function getLogDailyEntriesApi(logId, params) {
  return request.get(`/work/logs/${logId}/daily-entries`, { params })
}

export function createLogDailyEntryApi(logId, payload) {
  return request.post(`/work/logs/${logId}/daily-entries`, payload)
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

export function getMorningStandupBoardApi(params) {
  return request.get('/work/workbench/morning', { params })
}

export function previewNoFillReminderApi() {
  return request.post('/work/reminders/no-fill')
}

export function getInsightFilterOptionsApi() {
  return request.get('/work/insight/filters')
}

export function getDemandInsightApi(params) {
  return request.get('/work/insight/demand', { params })
}

export function getMemberInsightApi(params) {
  return request.get('/work/insight/member', { params })
}
