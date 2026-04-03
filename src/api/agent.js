import { request } from './http'

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
  return request.get('/agents/options', {
    params: {
      scene_code: sceneCode,
    },
  })
}

export function executeAgentApi(payload) {
  return request.post('/agents/execute', payload, {
    timeout: 120000,
  })
}
