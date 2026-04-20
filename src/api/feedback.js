import { request } from './http'

const FEEDBACK_ANALYZE_TIMEOUT = 120000

export function getAllFeedbackApi(params) {
  return request.get('/feedback', { params })
}

export function getFeedbackByIdApi(id) {
  return request.get(`/feedback/${id}`)
}

export function createFeedbackApi(payload) {
  return request.post('/feedback', payload)
}

export function updateFeedbackApi(id, payload) {
  return request.put(`/feedback/${id}`, payload)
}

export function deleteFeedbackApi(id) {
  return request.delete(`/feedback/${id}`)
}

export function updateFeedbackStatusApi(id, status) {
  return request.patch(`/feedback/${id}/status`, { status })
}

export function batchUpdateFeedbackStatusApi(ids, status) {
  return request.post('/feedback/batch/status', { ids, status })
}

export function batchImportFeedbackApi(list) {
  return request.post('/feedback/batch/import', list)
}

export function analyzeUnprocessedFeedbackApi(limit = 10) {
  return request.post('/feedback/analyze/unprocessed', {}, {
    params: { limit },
    timeout: FEEDBACK_ANALYZE_TIMEOUT,
  })
}

export function analyzeSingleFeedbackApi(id) {
  return request.post(`/feedback/${id}/analyze`, {}, {
    timeout: FEEDBACK_ANALYZE_TIMEOUT,
  })
}
