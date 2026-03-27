import { request } from './http'
import { cachedRequest, clearCache } from '../utils/requestCache'

export function getWorkItemTypesApi(params) {
  const key = `item-types-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/item-types', { params }))
}

export function getWorkPhaseTypesApi(params) {
  const key = `phase-types-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/phase-types', { params }))
}

export function createWorkItemTypeApi(payload) {
  return request.post('/work/item-types', payload)
}

export function getWorkDemandsApi(params) {
  const key = `demands-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/demands', { params }))
}

export function getWorkDemandByIdApi(demandId) {
  return request.get(`/work/demands/${demandId}`)
}

export function createWorkDemandApi(payload) {
  clearCache()
  return request.post('/work/demands', payload)
}

export function updateWorkDemandApi(demandId, payload) {
  clearCache()
  return request.put(`/work/demands/${demandId}`, payload)
}

export function deleteWorkDemandApi(demandId) {
  clearCache()
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

export function getWorkflowAssigneesApi(params) {
  return request.get('/work/workflow/assignees', { params })
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

export function replaceDemandWorkflowLatestApi(demandId, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/replace-latest`, payload)
}

export function getWorkLogsApi(params) {
  const key = `logs-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/logs', { params }), 3000)
}

export function createWorkLogApi(payload) {
  clearCache('workbench-me')
  return request.post('/work/logs', payload)
}

export function createOwnerAssignedLogApi(payload) {
  return request.post('/work/logs/owner-assign', payload)
}

export function updateWorkLogApi(logId, payload) {
  clearCache('workbench-me')
  return request.put(`/work/logs/${logId}`, payload)
}

export function deleteWorkLogApi(logId) {
  clearCache('workbench-me')
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
  return cachedRequest('workbench-me', () => request.get('/work/workbench/me'))
}

export function getMyWeeklyReportApi(params) {
  return request.get('/work/workbench/me/weekly-report', { params })
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
