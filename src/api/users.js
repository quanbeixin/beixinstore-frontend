import { request } from './http'

export function getUsersApi(params) {
  return request.get('/users', { params })
}

export function getUserByIdApi(userId) {
  return request.get(`/users/${userId}`)
}

export function createUserApi(payload) {
  return request.post('/users', payload)
}

export function updateUserApi(userId, payload) {
  return request.post(`/users/${userId}/update`, payload)
}

export function deleteUserApi(userId) {
  return request.post(`/users/${userId}/delete`)
}
