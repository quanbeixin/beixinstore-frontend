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
    path: '/pm/projects',
    componentKey: 'projects',
    requiredPermission: 'project.view',
    page: {
      title: '业务线',
      subtitle: '管理业务线基础信息、成员角色和活动日志。',
    },
    menu: {
      section: 'projectManagement',
      label: '业务线',
      icon: 'folder',
    },
  },
  {
    path: '/pm/requirements',
    componentKey: 'workDemands',
    requiredPermission: 'demand.view',
    page: {
      title: '需求池',
      subtitle: '统一维护需求信息，支持筛选、创建、流程与关联工时。',
    },
    menu: {
      section: 'projectManagement',
      label: '需求池',
      icon: 'tool',
    },
  },
  {
    path: '/pm/bugs',
    componentKey: 'bugs',
    requiredPermission: 'bug.view',
    page: {
      title: '缺陷管理',
      subtitle: '管理缺陷信息、严重程度、负责人和处理流程。',
    },
    menu: {
      section: 'projectManagement',
      label: '缺陷管理',
      icon: 'bug',
    },
  },
  {
    path: '/pm/stats',
    componentKey: 'projectStats',
    requiredPermission: 'project.stats.view',
    page: {
      title: '业务线统计',
      subtitle: '查看业务线与成员维度的工时、人天和任务投入统计。',
    },
    menu: {
      section: 'projectManagement',
      label: '业务线统计',
      icon: 'barChart',
    },
  },
  {
    path: '/efficiency/demand',
    componentKey: 'demandInsightBoard',
    requiredPermission: null,
    requiredRoles: ['SUPER_ADMIN'],
    page: {
      title: '需求投入看板',
      subtitle: '按需求、阶段、参与人查看负责人预估、个人预估与个人实际投入。',
    },
    menu: {
      section: 'efficiency',
      label: '需求投入看板',
      icon: 'dashboard',
    },
  },
  {
    path: '/efficiency/member',
    componentKey: 'memberRhythmBoard',
    requiredPermission: null,
    requiredRoles: ['SUPER_ADMIN'],
    page: {
      title: '成员工作节奏',
      subtitle: '按成员和日期观察工作饱和度与投入节奏。',
    },
    menu: {
      section: 'efficiency',
      label: '成员工作节奏',
      icon: 'dashboard',
    },
  },
  {
    path: '/work-logs',
    componentKey: 'workLogs',
    requiredPermission: 'worklog.view.self',
    page: {
      title: '个人工作台',
      subtitle: '每日填报工作记录，关联需求与需求阶段。',
    },
    menu: {
      section: 'main',
      label: '个人工作台',
      icon: 'dashboard',
    },
  },
  {
    path: '/morning-standup',
    componentKey: 'morningStandupBoard',
    requiredPermission: null,
    page: {
      title: '晨会看板',
      subtitle: '按部门同步每日进展，快速查看成员在做什么以及预计完成时间。',
    },
    menu: {
      section: 'main',
      label: '晨会看板',
      icon: 'dashboard',
    },
  },
  {
    path: '/owner-workbench',
    componentKey: 'ownerWorkbench',
    requiredPermission: 'workbench.view.owner',
    page: {
      title: 'Owner工作台',
      subtitle: '面向部门负责人的每日视图：填报覆盖、团队投入与事项 Owner 评估维护。',
    },
    menu: {
      section: 'main',
      label: 'Owner工作台',
      icon: 'dashboard',
    },
  },
  {
    path: '/personal-settings',
    componentKey: 'personalSettings',
    requiredPermission: null,
    page: {
      title: '个人设置',
      subtitle: '维护个人资料、安全信息与界面偏好。',
    },
    menu: {
      section: 'main',
      label: '个人设置',
      icon: 'setting',
    },
  },
  {
    path: '/work-demands',
    componentKey: 'workDemands',
    requiredPermission: 'demand.view',
    page: {
      title: '需求池',
      subtitle: '统一维护需求信息，支持筛选、创建与编辑需求。',
    },
  },
  {
    path: '/work-demands/:id',
    componentKey: 'workDemands',
    requiredPermission: 'demand.view',
    page: {
      title: '需求详情',
      subtitle: '查看单个需求的状态、流程和关联事项。',
    },
  },
  {
    path: '/users',
    componentKey: 'users',
    requiredPermission: 'user.view',
    page: {
      title: '用户管理',
      subtitle: '管理系统用户信息、权限和状态。',
    },
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
    page: {
      title: '部门管理（树形）',
      subtitle: '维护组织架构与部门负责人、启停状态。',
    },
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
    page: {
      title: '用户部门分配',
      subtitle: '为用户维护唯一部门归属并同步主数据。',
    },
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
    page: {
      title: '角色管理',
      subtitle: '维护角色选项。',
    },
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
    page: {
      title: '角色权限',
      subtitle: '为角色分配可访问权限。',
    },
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
    page: {
      title: '菜单权限',
      subtitle: '按角色配置菜单可见范围与规则。',
    },
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
    page: {
      title: '字典中心',
      subtitle: '集中维护系统字典类型与字典项。',
    },
    menu: {
      section: 'system',
      label: '字典中心',
      icon: 'tool',
    },
  },
]
