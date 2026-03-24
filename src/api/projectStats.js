import { request } from './http'

export function getProjectStatsOverviewApi() {
  return request.get('/project-stats/overview')
}

export function getProjectStatsProjectsApi(params) {
  return request.get('/project-stats/projects', { params })
}

export function getProjectStatsMembersApi(params) {
  return request.get('/project-stats/members', { params })
}
