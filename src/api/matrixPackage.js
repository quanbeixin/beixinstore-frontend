import { request } from './http'

export function getMatrixPackagesApi(params = {}) {
  return request.get('/matrix-packages', { params })
}

export function createMatrixPackageApi(payload) {
  return request.post('/matrix-packages', payload)
}

export function updateMatrixPackageApi(id, payload) {
  return request.put(`/matrix-packages/${id}`, payload)
}

export function deleteMatrixPackageApi(id) {
  return request.delete(`/matrix-packages/${id}`)
}
