import { request } from './http'
import { cachedRequest, clearCache, clearCacheByPrefix } from '../utils/requestCache'

export function getWorkItemTypesApi(params) {
  const key = `item-types-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/item-types', { params }))
}

export function getWorkPhaseTypesApi(params) {
  const key = `phase-types-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/phase-types', { params }))
}

export function getProjectTemplatePhaseTypesApi(params) {
  const key = `project-template-phase-types-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/project-template-phase-types', { params }))
}

export function createWorkItemTypeApi(payload) {
  return request.post('/work/item-types', payload)
}

export function getProjectTemplatesApi(params) {
  return request.get('/work/project-templates', { params })
}

export function getProjectTemplateByIdApi(templateId) {
  return request.get(`/work/project-templates/${templateId}`)
}

export function createProjectTemplateApi(payload) {
  return request.post('/work/project-templates', payload)
}

export function updateProjectTemplateApi(templateId, payload) {
  return request.put(`/work/project-templates/${templateId}`, payload)
}

export function getNotificationConfigsApi() {
  return request.get('/work/notification-configs')
}

export function updateNotificationConfigApi(scene, payload) {
  return request.put(`/work/notification-configs/${scene}`, payload)
}

export function getEfficiencyFactorSettingsApi() {
  return request.get('/work/efficiency-factor-settings')
}

export function updateEfficiencyFactorSettingsApi(payload) {
  return request.put('/work/efficiency-factor-settings', payload)
}

export function getWorkDemandsApi(params) {
  const key = `demands-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/demands', { params }))
}

export function getWorkDemandByIdApi(demandId) {
  return request.get(`/work/demands/${demandId}`)
}

export function getDemandMembersApi(demandId) {
  return request.get(`/work/demands/${demandId}/members`)
}

export function getDemandCommunicationsApi(demandId, params) {
  return request.get(`/work/demands/${demandId}/communications`, { params })
}

export function createDemandCommunicationApi(demandId, payload) {
  return request.post(`/work/demands/${demandId}/communications`, payload)
}

export function deleteDemandCommunicationApi(demandId, communicationId) {
  return request.delete(`/work/demands/${demandId}/communications/${communicationId}`)
}

export function addDemandMemberApi(demandId, payload) {
  return request.post(`/work/demands/${demandId}/members`, payload)
}

export function removeDemandMemberApi(demandId, userId) {
  return request.delete(`/work/demands/${demandId}/members/${userId}`)
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

export function restoreArchivedDemandApi(demandId) {
  return request.post(`/work/archive/demands/${demandId}/restore`)
}

export function initDemandWorkflowApi(demandId) {
  return request.post(`/work/demands/${demandId}/workflow/init`)
}

export function getDemandWorkflowApi(demandId) {
  return request.get(`/work/demands/${demandId}/workflow`)
}

export function getDemandWorkflowNodeOptionsApi(demandId) {
  return request.get(`/work/demands/${demandId}/workflow/node-options`)
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

export function submitDemandWorkflowNodeApi(demandId, nodeKey, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/nodes/${nodeKey}/submit`, payload)
}

export function rejectDemandWorkflowCurrentNodeApi(demandId, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/current/reject`, payload)
}

export function rejectDemandWorkflowNodeApi(demandId, nodeKey, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/nodes/${nodeKey}/reject`, payload)
}

export function forceCompleteDemandWorkflowCurrentNodeApi(demandId, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/current/force-complete`, payload)
}

export function forceCompleteDemandWorkflowNodeApi(demandId, nodeKey, payload = {}) {
  return request.post(`/work/demands/${demandId}/workflow/nodes/${nodeKey}/force-complete`, payload)
}

export function updateDemandWorkflowNodeHoursApi(demandId, nodeKey, payload) {
  return request.put(`/work/demands/${demandId}/workflow/nodes/${nodeKey}/hours`, payload)
}

export function updateDemandWorkflowTaskHoursApi(demandId, taskId, payload) {
  return request.put(`/work/demands/${demandId}/workflow/tasks/${taskId}/hours`, payload)
}

export function getDemandWorkflowTaskCollaboratorsApi(demandId, taskId) {
  return request.get(`/work/demands/${demandId}/workflow/tasks/${taskId}/collaborators`)
}

export function addDemandWorkflowTaskCollaboratorApi(demandId, taskId, payload) {
  return request.post(`/work/demands/${demandId}/workflow/tasks/${taskId}/collaborators`, payload)
}

export function removeDemandWorkflowTaskCollaboratorApi(demandId, taskId, userId, payload = {}) {
  return request.delete(`/work/demands/${demandId}/workflow/tasks/${taskId}/collaborators/${userId}`, {
    data: payload,
  })
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
  clearCacheByPrefix('logs-')
  return request.post('/work/logs', payload)
}

export function createOwnerAssignedLogApi(payload) {
  clearCache('workbench-me')
  clearCacheByPrefix('logs-')
  return request.post('/work/logs/owner-assign', payload)
}

export function updateWorkLogApi(logId, payload) {
  clearCache('workbench-me')
  clearCacheByPrefix('logs-')
  return request.put(`/work/logs/${logId}`, payload)
}

export function deleteWorkLogApi(logId) {
  clearCache('workbench-me')
  clearCacheByPrefix('logs-')
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
  clearCache('workbench-me')
  clearCacheByPrefix('logs-')
  return request.post(`/work/logs/${logId}/daily-entries`, payload)
}

export function updateLogDailyEntryApi(logId, entryId, payload) {
  clearCache('workbench-me')
  clearCacheByPrefix('logs-')
  return request.put(`/work/logs/${logId}/daily-entries/${entryId}`, payload)
}

export function updateWorkLogOwnerEstimateApi(logId, payload) {
  return request.put(`/work/logs/${logId}/owner-estimate`, payload)
}

export function getMyWorkbenchApi(options = {}) {
  const force = Boolean(options?.force)
  if (force) {
    clearCache('workbench-me')
    return request.get('/work/workbench/me')
  }
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
  return cachedRequest('insight-filters', () => request.get('/work/insight/filters'), 30000)
}

export function getDepartmentEfficiencyRankingApi(params) {
  const key = `insight-department-ranking-${JSON.stringify(params || {})}`
  return cachedRequest(key, () => request.get('/work/insight/department-ranking', { params }), 1000)
}

export function getDepartmentEfficiencyDetailApi(params) {
  const key = `insight-department-detail-${JSON.stringify(params || {})}`
  return cachedRequest(key, () => request.get('/work/insight/department-detail', { params }), 1000)
}

export function getDemandInsightApi(params) {
  const key = `insight-demand-${JSON.stringify(params || {})}`
  return cachedRequest(key, () => request.get('/work/insight/demand', { params }), 1000)
}

export function getMemberInsightApi(params) {
  const key = `insight-member-${JSON.stringify(params || {})}`
  return cachedRequest(key, () => request.get('/work/insight/member', { params }), 1000)
}

export function getMemberEfficiencyDetailApi(params) {
  const key = `insight-member-detail-${JSON.stringify(params || {})}`
  return cachedRequest(key, () => request.get('/work/insight/member-detail', { params }), 1000)
}

export function getMyAssignedItemsApi() {
  return request.get('/work/my-assigned-items')
}

export function updateAssignedLogApi(logId, payload) {
  return request.put(`/work/my-assigned-items/${logId}`, payload)
}
