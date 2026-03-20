function readJsonStorage(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
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

export function hasPermission(permissionCode) {
  const access = getAccessSnapshot()
  if (!access || !permissionCode) return true

  if (access.is_super_admin) return true
  if (access.permission_ready === false) return true

  const codes = Array.isArray(access.permission_codes) ? access.permission_codes : []
  return codes.includes(permissionCode)
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
}
