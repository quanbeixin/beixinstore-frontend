import { request } from './http'

export function getRbacRolesApi() {
  return request.get('/rbac/roles')
}

export function getRbacPermissionsApi() {
  return request.get('/rbac/permissions')
}

export function getRolePermissionsApi(roleId) {
  return request.get(`/rbac/roles/${roleId}/permissions`)
}

export function updateRolePermissionsApi(roleId, payload) {
  return request.put(`/rbac/roles/${roleId}/permissions`, payload)
}

export function getMenuVisibilityRulesApi() {
  return request.get('/rbac/menu-visibility')
}

export function getMyMenuVisibilityApi() {
  return request.get('/rbac/menu-visibility/me')
}

export function getMenuVisibilityDepartmentsApi() {
  return request.get('/rbac/menu-visibility/departments')
}

export function updateMenuVisibilityRuleApi(payload) {
  return request.put('/rbac/menu-visibility', payload)
}
