import { request } from './http'

export function getAIPromptConfigApi() {
  return request.get('/ai-config/prompt')
}

export function updateAIPromptConfigApi(payload) {
  return request.put('/ai-config/prompt', payload)
}
