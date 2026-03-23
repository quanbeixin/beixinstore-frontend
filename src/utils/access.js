function readJsonStorage(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const MENU_VISIBILITY_RULES_KEY = 'menu_visibility_rules'
const MENU_VISIBILITY_ACCESS_KEY = 'menu_visibility_access'
const USER_PREFERENCES_KEY = 'user_preferences'
const AUTH_STORAGE_EVENT = 'auth-storage-updated'
export const AUTH_STORAGE_UPDATED_EVENT = AUTH_STORAGE_EVENT

const MENU_SCOPE_TYPES = {
  ALL: 'ALL',
  ROLE: 'ROLE',
  DEPT_MEMBERS: 'DEPT_MEMBERS',
  DEPT_MANAGERS: 'DEPT_MANAGERS',
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeRoleKeys(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeDepartmentIds(value) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((item) => toPositiveInt(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ]
}

function normalizeScopeType(value) {
  const scopeType = String(value || MENU_SCOPE_TYPES.ALL).trim().toUpperCase()
  return MENU_SCOPE_TYPES[scopeType] || MENU_SCOPE_TYPES.ALL
}

function toBooleanMap(value) {
  const map = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return map

  Object.keys(value).forEach((menuKey) => {
    const normalizedKey = String(menuKey || '').trim()
    if (!normalizedKey) return
    map[normalizedKey] = Boolean(value[menuKey])
  })

  return map
}

function getCurrentUserId() {
  const user = readJsonStorage('user')
  return toPositiveInt(user?.id)
}

function normalizeMenuVisibilityAccessPayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.map) {
    return {
      user_id: toPositiveInt(value.user_id),
      map: toBooleanMap(value.map),
    }
  }

  return {
    user_id: null,
    map: toBooleanMap(value),
  }
}

function emitAuthStorageUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_STORAGE_EVENT))
}

function normalizeMenuRule(rule) {
  const scopeType = normalizeScopeType(rule?.scope_type)
  const departmentIdsFromPayload = normalizeDepartmentIds(rule?.department_ids)
  const fallbackDepartmentIds = normalizeDepartmentIds([rule?.department_id])
  const departmentIds =
    departmentIdsFromPayload.length > 0 ? departmentIdsFromPayload : fallbackDepartmentIds
  const roleKeys = normalizeRoleKeys(rule?.role_keys)

  if (scopeType === MENU_SCOPE_TYPES.ALL) {
    return { scope_type: MENU_SCOPE_TYPES.ALL, department_id: null, department_ids: [], role_keys: [] }
  }

  if (scopeType === MENU_SCOPE_TYPES.ROLE) {
    return { scope_type: MENU_SCOPE_TYPES.ROLE, department_id: null, department_ids: [], role_keys: roleKeys }
  }

  return {
    scope_type: scopeType,
    department_id: departmentIds[0] || null,
    department_ids: departmentIds,
    role_keys: [],
  }
}

export function getToken() {
  return localStorage.getItem('token') || ''
}

export function getCurrentUser() {
  return readJsonStorage('user')
}

function normalizeUserPreferences(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const defaultHome = String(raw.default_home || '').trim() || '/work-logs'
  const dateDisplayMode = String(raw.date_display_mode || '').trim().toLowerCase() === 'date' ? 'date' : 'datetime'
  const compactDefault =
    raw.demand_list_compact_default === true ||
    raw.demand_list_compact_default === 1 ||
    raw.demand_list_compact_default === '1'
      ? 1
      : 0

  return {
    default_home: defaultHome,
    date_display_mode: dateDisplayMode,
    demand_list_compact_default: compactDefault,
  }
}

export function getUserPreferences() {
  const raw = readJsonStorage(USER_PREFERENCES_KEY)
  if (!raw) {
    return normalizeUserPreferences({})
  }
  return normalizeUserPreferences(raw)
}

export function setUserPreferences(value) {
  const normalized = normalizeUserPreferences(value)
  localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(normalized))
  return normalized
}

export function getPreferredHomePath() {
  return getUserPreferences().default_home || '/work-logs'
}

export function getAccessSnapshot() {
  const access = readJsonStorage('access')
  if (!access || typeof access !== 'object') return null

  const currentUserId = getCurrentUserId()
  const accessUserId = toPositiveInt(access.user_id)
  if (currentUserId && accessUserId && currentUserId !== accessUserId) {
    localStorage.removeItem('access')
    return null
  }

  return access
}

function getRoleKeys(access) {
  if (!access) return []

  if (Array.isArray(access.role_keys)) {
    return access.role_keys
  }

  if (Array.isArray(access.roles)) {
    return access.roles.map((role) => role?.role_key).filter(Boolean)
  }

  return []
}

const PERMISSION_ALIAS_MAP = Object.freeze({
  'demand.view': ['requirement.view'],
  'demand.manage': ['requirement.create', 'requirement.edit', 'requirement.transition'],
  'demand.workflow.view': ['requirement.view'],
  'demand.workflow.manage': ['requirement.transition'],
})

function hasPermissionCode(codes, permissionCode) {
  const normalized = String(permissionCode || '').trim()
  if (!normalized) return true
  if (codes.includes(normalized)) return true

  const aliases = PERMISSION_ALIAS_MAP[normalized]
  if (!Array.isArray(aliases)) return false
  return aliases.some((alias) => codes.includes(String(alias || '').trim()))
}

export function hasPermission(permissionCode) {
  const access = getAccessSnapshot()
  if (!access || !permissionCode) return true

  // Department managers can access Owner workbench without admin-role permission code.
  if (permissionCode === 'workbench.view.owner' && access.is_department_manager) return true

  if (access.is_super_admin) return true
  if (access.permission_ready === false) return true

  const codes = Array.isArray(access.permission_codes)
    ? access.permission_codes.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  return hasPermissionCode(codes, permissionCode)
}

export function hasRole(roleKey) {
  const access = getAccessSnapshot()
  if (!access || !roleKey) return true

  if (access.is_super_admin) return true
  if (access.permission_ready === false) return true

  return getRoleKeys(access).includes(roleKey)
}

export function hasAnyRole(roleKeys) {
  if (!Array.isArray(roleKeys) || roleKeys.length === 0) {
    return true
  }

  return roleKeys.some((roleKey) => hasRole(roleKey))
}

export function getMenuVisibilityRulesMap() {
  const raw = readJsonStorage(MENU_VISIBILITY_RULES_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const map = {}

  Object.keys(raw).forEach((menuKey) => {
    const normalizedKey = String(menuKey || '').trim()
    if (!normalizedKey) return
    map[normalizedKey] = normalizeMenuRule(raw[normalizedKey])
  })

  return map
}

export function setMenuVisibilityRules(value) {
  const map = {}

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const menuKey = String(item?.menu_key || '').trim()
      if (!menuKey) return
      map[menuKey] = normalizeMenuRule(item)
    })
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((menuKey) => {
      const normalizedKey = String(menuKey || '').trim()
      if (!normalizedKey) return
      map[normalizedKey] = normalizeMenuRule(value[menuKey])
    })
  }

  localStorage.setItem(MENU_VISIBILITY_RULES_KEY, JSON.stringify(map))
  return map
}

export function getMenuVisibilityAccessMap() {
  const payload = normalizeMenuVisibilityAccessPayload(readJsonStorage(MENU_VISIBILITY_ACCESS_KEY))
  const currentUserId = getCurrentUserId()

  if (currentUserId && payload.user_id && currentUserId !== payload.user_id) {
    localStorage.removeItem(MENU_VISIBILITY_ACCESS_KEY)
    return {}
  }

  return payload.map
}

export function setMenuVisibilityAccessMap(value, options = {}) {
  const map = toBooleanMap(value)
  const currentUserId = getCurrentUserId()
  const userId = toPositiveInt(options?.user_id) || currentUserId || null

  localStorage.setItem(
    MENU_VISIBILITY_ACCESS_KEY,
    JSON.stringify({
      user_id: userId,
      map,
    }),
  )
  return map
}

function canAccessRouteByCachedRule(route, menuKey) {
  const rulesMap = getMenuVisibilityRulesMap()
  const rule = rulesMap[menuKey]
  if (!rule) return true

  if (rule.scope_type === MENU_SCOPE_TYPES.ALL) {
    return true
  }

  if (rule.scope_type === MENU_SCOPE_TYPES.ROLE) {
    return hasAnyRole(rule.role_keys)
  }

  // Department-based scope should rely on backend computed result.
  return true
}

export function canAccessRoute(route) {
  if (!route) return false

  const access = getAccessSnapshot()
  if (Array.isArray(route.requiredRoles) && route.requiredRoles.includes('SUPER_ADMIN')) {
    if (!access?.is_super_admin) return false
  }

  const passPermission = hasPermission(route.requiredPermission)
  const passRole = hasAnyRole(route.requiredRoles)
  if (!passPermission || !passRole) return false

  const menuKey = String(route.menu?.key || route.path || '').trim()
  if (!menuKey) return true

   // Ensure owner-workbench menu can be shown for department managers.
  if (menuKey === '/owner-workbench') {
    if (access?.is_department_manager) return true
  }

  const accessMap = getMenuVisibilityAccessMap()
  if (Object.prototype.hasOwnProperty.call(accessMap, menuKey)) {
    return Boolean(accessMap[menuKey])
  }

  return canAccessRouteByCachedRule(route, menuKey)
}

export function setAuthStorage({ token, user, access }) {
  const previousUserId = getCurrentUserId()
  const nextUserId = user === undefined ? previousUserId : toPositiveInt(user?.id)

  if (previousUserId && nextUserId && previousUserId !== nextUserId) {
    localStorage.removeItem('access')
    localStorage.removeItem(MENU_VISIBILITY_ACCESS_KEY)
    localStorage.removeItem(USER_PREFERENCES_KEY)
  }

  if (token) {
    localStorage.setItem('token', token)
  } else if (token === null) {
    localStorage.removeItem('token')
  }

  if (user) {
    localStorage.setItem('user', JSON.stringify(user))
  } else if (user === null) {
    localStorage.removeItem('user')
  }

  if (access) {
    localStorage.setItem('access', JSON.stringify(access))
  } else if (access === null) {
    localStorage.removeItem('access')
  }

  emitAuthStorageUpdated()
}

export function clearAuthStorage() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('access')
  localStorage.removeItem(MENU_VISIBILITY_RULES_KEY)
  localStorage.removeItem(MENU_VISIBILITY_ACCESS_KEY)
  localStorage.removeItem(USER_PREFERENCES_KEY)
  emitAuthStorageUpdated()
}
