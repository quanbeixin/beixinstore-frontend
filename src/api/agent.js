import { request } from './http'
import { cachedRequest, clearCache } from '../utils/requestCache'

export function getAgentsApi(params) {
  return request.get('/agents', { params })
}

export function getAgentByIdApi(id) {
  return request.get(`/agents/${id}`)
}

export function createAgentApi(payload) {
  return request.post('/agents', payload)
}

export function updateAgentApi(id, payload) {
  return request.put(`/agents/${id}`, payload)
}

export function updateAgentEnabledApi(id, enabled) {
  return request.patch(`/agents/${id}/enabled`, { enabled })
}

export function getAgentOptionsApi(sceneCode) {
  const normalizedSceneCode = String(sceneCode || '').trim()
  const cacheKey = `agent-options-${normalizedSceneCode || 'all'}`
  return cachedRequest(
    cacheKey,
    () =>
      request.get('/agents/options', {
        params: {
          scene_code: normalizedSceneCode,
        },
      }),
    10000,
  )
}

export function executeAgentApi(payload) {
  clearCache()
  return request.post('/agents/execute', payload, {
    timeout: 120000,
  })
}
