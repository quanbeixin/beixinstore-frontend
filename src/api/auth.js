import { request } from './http'

export function loginApi(payload) {
  return request.post('/auth/login', payload)
}

export function registerApi(payload) {
  return request.post('/auth/register', payload)
}

export function getAccessApi() {
  return request.get('/auth/access')
}

export function getProfileApi() {
  return request.get('/auth/profile')
}

export function updateProfileApi(payload) {
  return request.put('/auth/profile', payload)
}

export function updatePasswordApi(payload) {
  return request.put('/auth/password', payload)
}

export function getPreferencesApi() {
  return request.get('/auth/preferences')
}

export function updatePreferencesApi(payload) {
  return request.put('/auth/preferences', payload)
}
