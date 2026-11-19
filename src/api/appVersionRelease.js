import { request } from './http'

export function getAppVersionReleasesApi(params = {}) {
  return request.get('/app-version-releases', { params })
}

export function getAppReleaseDemandCoverageApi(params = {}) {
  return request.get('/app-version-releases/demand-coverage', { params })
}

export function getAppReleaseOperatingAppsApi() {
  return request.get('/app-version-releases/demand-coverage/operating-apps')
}

export function saveAppReleaseOperatingAppsApi(demandId, matrixPackageIds) {
  return request.put(`/app-version-releases/demand-coverage/${encodeURIComponent(demandId)}/operating-apps`, {
    matrix_package_ids: matrixPackageIds,
  })
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

export function updateAppVersionReleaseRegressionApi(id, regressionStatus) {
  return request.put(`/app-version-releases/${id}/regression`, { regression_status: regressionStatus })
}
