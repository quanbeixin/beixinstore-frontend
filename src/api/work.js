import { request } from './http'
import { cachedRequest, clearCache, clearCacheByPrefix } from '../utils/requestCache'

function clearDerivedWorkCaches({ includeWorkbench = true } = {}) {
  if (includeWorkbench) {
    clearCache('workbench-me')
  }
  clearCacheByPrefix('logs-')
  clearCacheByPrefix('demands-')
  clearCacheByPrefix('insight-')
  clearCacheByPrefix('morning-standup-')
  clearCacheByPrefix('human-gantt-')
  clearCacheByPrefix('overtime-records-')
}

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

export function previewOwnerEstimateCalibrationApi() {
  return request.post('/work/project-templates/owner-estimate-calibration/preview')
}

export function runOwnerEstimateCalibrationApi() {
  clearDerivedWorkCaches()
  return request.post('/work/project-templates/owner-estimate-calibration/run')
}

export function getNotificationConfigsApi() {
  return request.get('/work/notification-configs')
}

export function updateNotificationConfigApi(scene, payload) {
  return request.put(`/work/notification-configs/${scene}`, payload)
}

export function getNotificationTemplateFilesApi() {
  return request.get('/work/notification-template-files')
}

export function upsertNotificationTemplateFileApi(templateKey, payload) {
  return request.put(`/work/notification-template-files/${templateKey}`, payload)
}

export function getNotificationTemplateFileUploadPolicyApi(payload = {}) {
  return request.post('/work/notification-template-files/upload-policy', payload, {
    timeout: 30000,
  })
}

export function getEfficiencyFactorSettingsApi() {
  return request.get('/work/efficiency-factor-settings')
}

export function updateEfficiencyFactorSettingsApi(payload) {
  return request.put('/work/efficiency-factor-settings', payload)
}

export function getMyDemandScoreSlotsApi(params) {
  return request.get('/work/demand-scores/my', { params })
}

export function getMyDemandScoreSlotApi(slotId) {
  return request.get(`/work/demand-scores/slots/${slotId}`)
}

export function submitDemandScoreSlotApi(slotId, payload) {
  return request.post(`/work/demand-scores/slots/${slotId}`, payload)
}

export function declineDemandScoreSlotApi(slotId, payload) {
  return request.post(`/work/demand-scores/slots/${slotId}/decline`, payload)
}

export function generateDemandScoreTaskApi(demandId, payload = {}) {
  return request.post(`/work/demand-scores/demands/${demandId}/generate`, payload)
}

export function deleteDemandScoreTaskApi(demandId) {
  return request.delete(`/work/demand-scores/demands/${demandId}`)
}

export function getDemandScoreResultsApi(params) {
  return request.get('/work/demand-score-results', { params })
}

export function getDemandScoreResultDetailApi(taskId) {
  return request.get(`/work/demand-score-results/${taskId}`)
}

export function getDemandScoreTeamRankingApi(params) {
  return request.get('/work/demand-score-results/ranking', { params })
}

export function initDemandValueReviewApi(demandId, payload = {}) {
  return request.post(`/work/demand-value-reviews/demands/${encodeURIComponent(demandId)}/init`, payload)
}

export function updateDemandValueReviewParticipantsApi(reviewId, payload = {}) {
  return request.put(`/work/demand-value-reviews/${reviewId}/participants`, payload)
}

export function getDemandValueReviewByDemandIdApi(demandId) {
  return request.get(`/work/demand-value-reviews/by-demand/${encodeURIComponent(demandId)}`)
}

export function getDemandValueReviewMapApi(params) {
  return request.get('/work/demand-value-reviews/map', { params })
}

export function getDemandValueReviewsApi(params) {
  return request.get('/work/demand-value-reviews', { params })
}

export function getDemandValueReviewDetailApi(reviewId) {
  return request.get(`/work/demand-value-reviews/${reviewId}`)
}

export function updateDemandValueReviewApi(reviewId, payload) {
  return request.put(`/work/demand-value-reviews/${reviewId}`, payload)
}

export function submitDemandValueReviewApi(reviewId, payload) {
  return request.post(`/work/demand-value-reviews/${reviewId}/submit`, payload)
}

export function skipDemandValueReviewApi(reviewId, payload) {
  return request.post(`/work/demand-value-reviews/${reviewId}/skip`, payload)
}

export function unskipDemandValueReviewApi(reviewId) {
  return request.post(`/work/demand-value-reviews/${reviewId}/unskip`)
}

export function reopenDemandValueReviewApi(reviewId) {
  return request.post(`/work/demand-value-reviews/${reviewId}/reopen`)
}

export function deleteDemandValueReviewApi(reviewId) {
  return request.delete(`/work/demand-value-reviews/${reviewId}`)
}

export function getMyPendingDemandValueReviewsApi(params) {
  return request.get('/work/demand-value-reviews/my/pending', { params })
}

export function getMyDemandValueReviewDetailApi(reviewId) {
  return request.get(`/work/demand-value-reviews/my/${reviewId}`)
}

export function submitMyDemandValueReviewApi(reviewId, payload) {
  return request.post(`/work/demand-value-reviews/my/${reviewId}/submit`, payload)
}

export function getWorkDemandsApi(params) {
  const key = `demands-${JSON.stringify(params)}`
  return cachedRequest(key, () => request.get('/work/demands', { params }))
}

export function getDemandViewsApi() {
  return request.get('/work/demands/views')
}

export function getDemandViewByIdApi(viewId) {
  return request.get(`/work/demands/views/${viewId}`)
}

export function createDemandViewApi(payload) {
  return request.post('/work/demands/views', payload)
}

export function updateDemandViewApi(viewId, payload) {
  return request.put(`/work/demands/views/${viewId}`, payload)
}

export function deleteDemandViewApi(viewId) {
  return request.delete(`/work/demands/views/${viewId}`)
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
  clearDerivedWorkCaches()
  return request.post('/work/logs', payload)
}

export function createOwnerAssignedLogApi(payload) {
  clearDerivedWorkCaches()
  return request.post('/work/logs/owner-assign', payload)
}

export function updateWorkLogApi(logId, payload) {
  clearDerivedWorkCaches()
  return request.put(`/work/logs/${logId}`, payload)
}

export function deleteWorkLogApi(logId) {
  clearDerivedWorkCaches()
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
  clearDerivedWorkCaches()
  return request.post(`/work/logs/${logId}/daily-entries`, payload)
}

export function updateLogDailyEntryApi(logId, entryId, payload) {
  clearDerivedWorkCaches()
  return request.put(`/work/logs/${logId}/daily-entries/${entryId}`, payload)
}

export function deleteLogDailyEntryApi(logId, entryId) {
  clearDerivedWorkCaches()
  return request.delete(`/work/logs/${logId}/daily-entries/${entryId}`)
}

export function updateWorkLogOwnerEstimateApi(logId, payload) {
  clearDerivedWorkCaches({ includeWorkbench: false })
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

export function getOvertimeRecordsApi(params = {}, options = {}) {
  const normalizedParams = params || {}
  const cacheKey = `overtime-records-${JSON.stringify(normalizedParams)}`
  const requestFn = () => request.get('/work/workbench/overtime-records', { params: normalizedParams })

  if (options?.force) {
    clearCache(cacheKey)
    return requestFn()
  }

  return cachedRequest(cacheKey, requestFn, 2000)
}

export function createOvertimeRecordApi(payload) {
  clearDerivedWorkCaches({ includeWorkbench: false })
  return request.post('/work/workbench/overtime-records', payload)
}

export function updateOvertimeRecordApi(recordId, payload) {
  clearDerivedWorkCaches({ includeWorkbench: false })
  return request.put(`/work/workbench/overtime-records/${recordId}`, payload)
}

export function deleteOvertimeRecordApi(recordId) {
  clearDerivedWorkCaches({ includeWorkbench: false })
  return request.delete(`/work/workbench/overtime-records/${recordId}`)
}

export function confirmOvertimeRecordApi(recordId) {
  clearDerivedWorkCaches({ includeWorkbench: false })
  return request.post(`/work/workbench/overtime-records/${recordId}/confirm`)
}

export function getOwnerWorkbenchApi(params) {
  return request.get('/work/workbench/owner', { params })
}

export function getMorningStandupBoardApi(params, options = {}) {
  const normalizedParams = params || {}
  const cacheKey = `morning-standup-${JSON.stringify(normalizedParams)}`
  const requestFn = () =>
    request.get('/work/workbench/morning', {
      params: normalizedParams,
      timeout: 30000,
    })

  if (options?.force) {
    clearCache(cacheKey)
    return requestFn()
  }

  return cachedRequest(cacheKey, requestFn, 15000)
}

export function getMorningStandupWeeklyProgressApi(params, options = {}) {
  const normalizedParams = params || {}
  const cacheKey = `morning-standup-weekly-progress-${JSON.stringify(normalizedParams)}`
  const requestFn = () =>
    request.get('/work/workbench/morning/weekly-progress', {
      params: normalizedParams,
      timeout: 30000,
    })

  if (options?.force) {
    clearCache(cacheKey)
    return requestFn()
  }

  return cachedRequest(cacheKey, requestFn, 15000)
}

export function getMorningStandupWeeklyCompletedApi(params, options = {}) {
  const normalizedParams = params || {}
  const cacheKey = `morning-standup-weekly-completed-${JSON.stringify(normalizedParams)}`
  const requestFn = () =>
    request.get('/work/workbench/morning/weekly-completed', {
      params: normalizedParams,
      timeout: 30000,
    })

  if (options?.force) {
    clearCache(cacheKey)
    return requestFn()
  }

  return cachedRequest(cacheKey, requestFn, 15000)
}

export function getHumanGanttApi(params, options = {}) {
  const normalizedParams = params || {}
  const cacheKey = `human-gantt-${JSON.stringify(normalizedParams)}`
  const requestFn = () =>
    request.get('/work/human-gantt', {
      params: normalizedParams,
      timeout: 30000,
    })

  if (options?.force) {
    clearCache(cacheKey)
    return requestFn()
  }

  return cachedRequest(cacheKey, requestFn, 10000)
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
  return cachedRequest(
    key,
    () => request.get('/work/insight/demand', { params, timeout: 20000 }),
    1000,
  )
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
  clearDerivedWorkCaches()
  return request.put(`/work/my-assigned-items/${logId}`, payload)
}
