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
