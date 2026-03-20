export const PUBLIC_ROUTES = [
  {
    path: '/login',
    componentKey: 'login',
  },
  {
    path: '/register',
    componentKey: 'register',
  },
]

export const PRIVATE_ROUTES = [
  // 可选字段：
  // requiredPermission: 'user.view'
  // requiredRoles: ['ADMIN', 'SUPER_ADMIN']
  {
    path: '/performance-dashboard',
    componentKey: 'performanceDashboard',
    requiredPermission: null,
    menu: {
      section: 'main',
      label: '人效看板',
      icon: 'dashboard',
    },
  },
  {
    path: '/users',
    componentKey: 'users',
    requiredPermission: 'user.view',
    menu: {
      section: 'system',
      label: '用户管理',
      icon: 'user',
    },
  },
  {
    path: '/departments',
    componentKey: 'departments',
    requiredPermission: 'dept.view',
    menu: {
      section: 'system',
      label: '部门管理',
      icon: 'apartment',
    },
  },
  {
    path: '/user-departments',
    componentKey: 'userDepartments',
    requiredPermission: 'dept.view',
    menu: {
      section: 'system',
      label: '用户部门分配',
      icon: 'apartment',
    },
  },
  {
    path: '/options',
    componentKey: 'options',
    requiredPermission: 'option.view',
    menu: {
      section: 'system',
      label: '角色管理',
      icon: 'tool',
    },
  },
  {
    path: '/role-permissions',
    componentKey: 'rolePermissions',
    requiredPermission: 'option.view',
    menu: {
      section: 'system',
      label: '角色权限',
      icon: 'safety',
    },
  },
  {
    path: '/menu-visibility',
    componentKey: 'menuVisibility',
    requiredPermission: 'option.view',
    menu: {
      section: 'system',
      label: '菜单权限',
      icon: 'setting',
    },
  },
  {
    path: '/dict-center',
    componentKey: 'dictCenter',
    requiredPermission: 'dict.view',
    menu: {
      section: 'system',
      label: '字典中心',
      icon: 'tool',
    },
  },
]
