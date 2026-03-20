import { request } from './http'

export function getDepartmentsApi(params = { mode: 'tree' }) {
  return request.get('/org/departments', { params })
}

export function createDepartmentApi(payload) {
  return request.post('/org/departments', payload)
}

export function updateDepartmentApi(id, payload) {
  return request.put(`/org/departments/${id}`, payload)
}

export function deleteDepartmentApi(id) {
  return request.delete(`/org/departments/${id}`)
}

export function getUserDepartmentsApi(userId) {
  return request.get(`/org/users/${userId}/departments`)
}

export function setUserDepartmentsApi(userId, payload) {
  return request.put(`/org/users/${userId}/departments`, payload)
}
