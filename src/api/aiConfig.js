import { request } from './http'

export function getAIPromptConfigApi() {
  return request.get('/ai-config/prompt')
}

export function updateAIPromptConfigApi(payload) {
  return request.put('/ai-config/prompt', payload)
}

export function getImportantEmailConfigApi() {
  return request.get('/ai-config/important-emails')
}

export function updateImportantEmailConfigApi(payload) {
  return request.put('/ai-config/important-emails', payload)
}
