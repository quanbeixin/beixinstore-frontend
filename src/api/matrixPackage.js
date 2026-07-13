import { request } from './http'

export function getMatrixPackagesApi(params = {}) {
  return request.get('/matrix-packages', { params })
}

export function getMatrixPackageApi(id) {
  return request.get(`/matrix-packages/${id}`)
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

export function completeMatrixPackageProductionApi(id) {
  return request.post(`/matrix-packages/${id}/complete-production`)
}

export function getMatrixPackageSideNotesApi(id) {
  return request.get(`/matrix-packages/${id}/side-notes`)
}

export function getMatrixPackageProductionNodesApi(id) {
  return request.get(`/matrix-packages/${id}/production-nodes`)
}

export function updateMatrixPackageProductionNodeApi(id, nodeCode, payload = {}) {
  return request.put(`/matrix-packages/${id}/production-nodes/${nodeCode}`, payload)
}

export function remindMatrixPackageProductionNodeApi(id, nodeCode) {
  return request.post(`/matrix-packages/${id}/production-nodes/${nodeCode}/remind`)
}

export function saveMatrixPackageSideNotesApi(id, notes) {
  return request.put(`/matrix-packages/${id}/side-notes`, { notes })
}

export function confirmMatrixPackageSideNoteApi(id, noteType) {
  return request.post(`/matrix-packages/${id}/side-notes/${noteType}/confirm`)
}

export function remindMatrixPackageSideNoteApi(id, noteType) {
  return request.post(`/matrix-packages/${id}/side-notes/${noteType}/remind`)
}

export function getMatrixPackageSideNoteUploadPolicyApi(id, payload = {}) {
  return request.post(`/matrix-packages/${id}/side-notes/upload-policy`, payload, {
    timeout: 30000,
  })
}
