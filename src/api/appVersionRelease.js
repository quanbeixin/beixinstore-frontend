import { request } from './http'

export function getAppVersionReleasesApi(params = {}) {
  return request.get('/app-version-releases', { params })
}

export function getAppReleaseDemandCoverageApi(params = {}) {
  return request.get('/app-version-releases/demand-coverage', { params })
}

export function getGroupedAppVersionReleasesApi(params = {}) {
  return request.get('/app-version-releases/grouped', { params })
}

export function getAppVersionReleaseSyncTargetsApi(id) {
  return request.get(`/app-version-releases/${id}/sync-targets`)
}

export function getAppVersionReleaseVersionInfoApi(id) {
  return request.get(`/app-version-releases/${id}/version-info`)
}

export function createAppVersionReleaseApplicationsApi(payload = {}) {
  return request.post('/app-version-releases/applications', payload)
}

export function mergeAppVersionReleaseApi(id, payload = {}) {
  return request.post(`/app-version-releases/${id}/merge-to`, payload)
}

export function updateAppVersionReleaseApi(id, payload = {}) {
  return request.put(`/app-version-releases/${id}`, payload)
}

export function deleteAppVersionReleaseApi(id) {
  return request.delete(`/app-version-releases/${id}`)
}
