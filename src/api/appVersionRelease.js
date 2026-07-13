import { request } from './http'

export function getAppVersionReleasesApi(params = {}) {
  return request.get('/app-version-releases', { params })
}

export function createAppVersionReleaseApplicationsApi(payload = {}) {
  return request.post('/app-version-releases/applications', payload)
}

export function updateAppVersionReleaseApi(id, payload = {}) {
  return request.put(`/app-version-releases/${id}`, payload)
}

export function deleteAppVersionReleaseApi(id) {
  return request.delete(`/app-version-releases/${id}`)
}
