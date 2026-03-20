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

function normalizeScopeType(value) {
  const scopeType = String(value || MENU_SCOPE_TYPES.ALL).trim().toUpperCase()
  return MENU_SCOPE_TYPES[scopeType] || MENU_SCOPE_TYPES.ALL
}

function normalizeMenuRule(rule) {
  const scopeType = normalizeScopeType(rule?.scope_type)
  const departmentId = toPositiveInt(rule?.department_id)
  const roleKeys = normalizeRoleKeys(rule?.role_keys)

  if (scopeType === MENU_SCOPE_TYPES.ALL) {
    return { scope_type: MENU_SCOPE_TYPES.ALL, department_id: null, role_keys: [] }
  }

  if (scopeType === MENU_SCOPE_TYPES.ROLE) {
    return { scope_type: MENU_SCOPE_TYPES.ROLE, department_id: null, role_keys: roleKeys }
  }

  return {
    scope_type: scopeType,
    department_id: departmentId,
    role_keys: [],
  }
}

export function getToken() {
  return localStorage.getItem('token') || ''
}

export function getCurrentUser() {
  return readJsonStorage('user')
}

export function getAccessSnapshot() {
  return readJsonStorage('access')
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

export function hasPermission(permissionCode) {
  const access = getAccessSnapshot()
  if (!access || !permissionCode) return true

  if (access.is_super_admin) return true
  if (access.permission_ready === false) return true

  const codes = Array.isArray(access.permission_codes) ? access.permission_codes : []
  return codes.includes(permissionCode)
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
  const raw = readJsonStorage(MENU_VISIBILITY_ACCESS_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const map = {}

  Object.keys(raw).forEach((menuKey) => {
    const normalizedKey = String(menuKey || '').trim()
    if (!normalizedKey) return
    map[normalizedKey] = Boolean(raw[menuKey])
  })

  return map
}

export function setMenuVisibilityAccessMap(value) {
  const map = {}

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.keys(value).forEach((menuKey) => {
      const normalizedKey = String(menuKey || '').trim()
      if (!normalizedKey) return
      map[normalizedKey] = Boolean(value[menuKey])
    })
  }

  localStorage.setItem(MENU_VISIBILITY_ACCESS_KEY, JSON.stringify(map))
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

  const passPermission = hasPermission(route.requiredPermission)
  const passRole = hasAnyRole(route.requiredRoles)
  if (!passPermission || !passRole) return false

  const menuKey = String(route.menu?.key || route.path || '').trim()
  if (!menuKey) return true

  const accessMap = getMenuVisibilityAccessMap()
  if (Object.prototype.hasOwnProperty.call(accessMap, menuKey)) {
    return Boolean(accessMap[menuKey])
  }

  return canAccessRouteByCachedRule(route, menuKey)
}

export function setAuthStorage({ token, user, access }) {
  if (token) {
    localStorage.setItem('token', token)
  }

  if (user) {
    localStorage.setItem('user', JSON.stringify(user))
  }

  if (access) {
    localStorage.setItem('access', JSON.stringify(access))
  }
}

export function clearAuthStorage() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('access')
  localStorage.removeItem(MENU_VISIBILITY_RULES_KEY)
  localStorage.removeItem(MENU_VISIBILITY_ACCESS_KEY)
}
