import { request } from './http'

export function getMatrixPackageReviewPlansApi(params = {}) {
  return request.get('/matrix-package-review-plans', { params })
}

export function saveMatrixPackageReviewPlanApi(packageId, payload = {}) {
  return request.put(`/matrix-package-review-plans/${packageId}`, payload)
}

export function transitionMatrixPackageReviewPlanApi(packageId, payload = {}) {
  return request.post(`/matrix-package-review-plans/${packageId}/transition`, payload)
}
