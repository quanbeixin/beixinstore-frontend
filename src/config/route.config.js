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
    path: '/efficiency/department-ranking',
    componentKey: 'departmentEfficiencyRanking',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    allowDepartmentManager: true,
    page: {
      title: '部门人效排行',
      subtitle: '按部门查看成员投入排行、预估工时与实际工时分布。',
    },
    menu: {
      section: 'efficiency',
      label: '部门人效排行',
      icon: 'dashboard',
    },
  },
  {
    path: '/efficiency/department/:departmentId/detail',
    componentKey: 'departmentEfficiencyDetail',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    allowDepartmentManager: true,
    page: {
      title: '部门人效详情',
      subtitle: '查看单个部门在指定周期内的成员投入结构、重点需求与波动情况。',
    },
  },
  {
    path: '/efficiency/member',
    componentKey: 'memberRhythmBoard',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    allowDepartmentManager: true,
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
    path: '/efficiency/member/:userId/detail',
    componentKey: 'memberEfficiencyDetail',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    allowDepartmentManager: true,
    page: {
      title: '个人人效详情',
      subtitle: '查看单个成员在指定周期内的投入结构、需求汇总与事项明细。',
    },
  },
  {
    path: '/efficiency/factor-settings',
    componentKey: 'efficiencyFactorSettings',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    page: {
      title: '效能系数设置',
      subtitle: '维护效能口径中的配置项与后续计算系数入口。',
    },
    menu: {
      section: 'efficiency',
      label: '效能系数设置',
      icon: 'setting',
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
    path: '/work-logs',
    componentKey: 'workLogs',
    requiredPermission: 'worklog.view.self',
    page: {
      title: '我的工作台',
      subtitle: '每日填报工作记录，关联需求与需求阶段。',
    },
    menu: {
      section: 'workbench',
      label: '今日工作台',
      icon: 'dashboard',
    },
  },
  {
    path: '/my-assigned-items',
    componentKey: 'myAssignedItems',
    requiredPermission: 'worklog.view.self',
    page: {
      title: '我的指派事项',
      subtitle: '查看我指派给他人的所有事项。',
    },
    menu: {
      section: 'workbench',
      label: '我指派任务',
      icon: 'dashboard',
    },
  },
  {
    path: '/my-demands',
    componentKey: 'myDemands',
    requiredPermission: 'demand.view',
    page: {
      title: '我的需求',
      subtitle: '集中查看我创建和我参与的需求，沿用需求池的展示字段与详情能力。',
    },
    menu: {
      section: 'workbench',
      label: '我参与需求',
      icon: 'dashboard',
    },
  },
  {
    path: '/my-pending-bugs',
    componentKey: 'myPendingBugs',
    requiredPermission: 'bug.view',
    page: {
      title: '待处理bug',
      subtitle: '查看处理人为当前登录人的 Bug 列表。',
    },
    menu: {
      section: 'workbench',
      label: '待处理缺陷',
      icon: 'dashboard',
    },
  },
  {
    path: '/demand-scores',
    componentKey: 'demandScoring',
    requiredPermission: 'demand.score.view',
    page: {
      title: '需求评分',
      subtitle: '对已完成需求中的参与人进行独立评分。',
    },
    menu: {
      section: 'workbench',
      label: '需求互评分',
      icon: 'dashboard',
    },
  },
  {
    path: '/my-demand-value-reviews',
    componentKey: 'myDemandValueReviews',
    requiredPermission: 'workbench.view.self',
    page: {
      title: '待我复盘评价',
      subtitle: '查看并提交我参与的需求价值复盘评价。',
    },
    menu: {
      section: 'workbench',
      label: '待复盘评价',
      icon: 'dashboard',
    },
  },
  {
    path: '/my-overtime-records',
    componentKey: 'myOvertimeRecords',
    requiredPermission: 'workbench.view.self',
    page: {
      title: '加班记录',
      subtitle: '查看个人加班申报记录，待确认状态支持撤回/删除。',
    },
    menu: {
      section: 'workbench',
      label: '加班申请单',
      icon: 'dashboard',
    },
  },
  {
    path: '/work-log-history',
    componentKey: 'workLogHistory',
    requiredPermission: 'worklog.view.self',
    page: {
      title: '历史工作记录',
      subtitle: '集中查看、筛选、维护个人历史工作记录。',
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
    path: '/matrix-package-special/panorama',
    componentKey: 'matrixPackageSpecial',
    requiredPermission: 'matrix_package.view',
    page: {
      title: '矩阵包全景图',
      subtitle: '矩阵包专项全景视图入口。',
    },
    menu: {
      section: 'matrixPackage',
      label: '矩阵包全景图',
      icon: 'tool',
    },
  },
  {
    path: '/matrix-package-special/cold-standby-production',
    componentKey: 'coldStandbyProduction',
    requiredPermission: 'matrix_package.view',
    page: {
      title: '冷备包生产线',
      subtitle: '跟踪开发中到冷备包的生产推进信息。',
    },
    menu: {
      section: 'matrixPackage',
      label: '冷备包生产线',
      icon: 'tool',
    },
  },
  {
    path: '/matrix-package-special/cold-standby-production/:id',
    componentKey: 'coldStandbyProductionDetail',
    requiredPermission: 'matrix_package.view',
    page: {
      title: '冷备包生产详情',
      subtitle: '查看单个矩阵包的生产档案、预留流转模块与各侧补充信息。',
    },
  },
  {
    path: '/matrix-package-special/review-plans',
    componentKey: 'matrixPackageReviewPlan',
    requiredPermission: 'matrix_package.view',
    page: {
      title: '矩阵包送审排期',
      subtitle: '规划冷备包送审时间，跟踪首次送审、审核、广告账号绑定、二次送审与热备状态。',
    },
    menu: {
      section: 'matrixPackage',
      label: '矩阵包送审排期',
      icon: 'tool',
    },
  },
  {
    path: '/matrix-package-special/developer-accounts',
    componentKey: 'developerAccount',
    requiredPermission: 'matrix_package.view',
    page: {
      title: '开发者账号管理',
      subtitle: '维护公司主体下的开发者账号，并作为矩阵包归属基础数据。',
    },
    menu: {
      section: 'matrixPackage',
      label: '开发者账号管理',
      icon: 'setting',
    },
  },
  {
    path: '/matrix-package-special/api-debug',
    componentKey: 'matrixPackageApiDebug',
    requiredPermission: 'matrix_package.manage',
    page: {
      title: '接口调试台',
      subtitle: '通过后端代理调试外部站点接口连通性。',
    },
    menu: {
      section: 'matrixPackage',
      label: '接口调试台',
      icon: 'api',
    },
  },
  {
    path: '/matrix-package-special/notification-rules',
    componentKey: 'matrixPackageNotification',
    requiredPermission: 'matrix_package.notification.manage',
    page: {
      title: '通知配置',
      subtitle: '维护矩阵包专项的状态变更与定时提醒通知规则。',
    },
    menu: {
      section: 'matrixPackage',
      label: '通知配置',
      icon: 'setting',
    },
  },
  {
    path: '/app-version-release',
    componentKey: 'appVersionRelease',
    requiredPermission: 'demand.view',
    page: {
      title: 'APP版本发布',
      subtitle: '集中维护 APP 版本发布计划、发布节点与相关信息。',
    },
    menu: {
      section: 'appRelease',
      label: 'APP版本发布',
      icon: 'tool',
    },
  },
  {
    path: '/app-version-release/apply',
    componentKey: 'appVersionReleaseApply',
    requiredPermission: 'demand.manage',
    page: {
      title: '版本发布申请',
      subtitle: '手动选择一个或多个矩阵包，批量创建 APP 版本发布申请。',
    },
    menu: {
      section: 'appRelease',
      label: '版本发布申请',
      icon: 'tool',
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
    menu: {
      section: 'project',
      label: '需求看板',
      icon: 'tool',
    },
  },
  {
    path: '/launch-plan',
    componentKey: 'launchPlan',
    requiredPermission: 'demand.view',
    page: {
      title: '上线计划表',
      subtitle: '按预期上线时间树形查看近期上线与延期需求。',
    },
    menu: {
      section: 'project',
      label: '上线排期',
      icon: 'tool',
    },
  },
  {
    path: '/demand-score-results',
    componentKey: 'demandScoreResults',
    requiredPermission: null,
    requiredRoles: ['SUPER_ADMIN'],
    allowDepartmentManager: true,
    page: {
      title: '评分结果',
      subtitle: '按需求与周期查看团队评分结果和维度表现。',
    },
    menu: {
      section: 'efficiency',
      label: '需求评分结果',
      icon: 'dashboard',
    },
  },
  {
    path: '/demand-value-reviews',
    componentKey: 'demandValueReviews',
    requiredPermission: 'workbench.view.self',
    page: {
      title: '需求价值复盘',
      subtitle: '管理员手动发起并维护已上线需求的价值复盘记录。',
    },
    menu: {
      section: 'project',
      label: '价值复盘',
      icon: 'tool',
    },
  },
  {
    path: '/demand-value-reviews/:id',
    componentKey: 'demandValueReviews',
    requiredPermission: 'workbench.view.self',
    page: {
      title: '需求价值复盘详情',
      subtitle: '查看并维护单个需求的价值复盘详情。',
    },
  },
  {
    path: '/human-gantt',
    componentKey: 'humanGantt',
    requiredPermission: null,
    page: {
      title: '人力甘特图',
      subtitle: '按成员和日期查看事项排期，快速识别冲突与空档，支持人力协调安排。',
    },
    menu: {
      section: 'project',
      label: '人力排期',
      icon: 'tool',
    },
  },
  {
    path: '/project-templates',
    componentKey: 'projectTemplates',
    requiredPermission: 'project.template.view',
    page: {
      title: '项目模板',
      subtitle: '维护项目流程模板配置，供项目模式复用。',
    },
    menu: {
      section: 'project',
      label: '流程模板',
      icon: 'tool',
    },
  },
  {
    path: '/project-templates/:id',
    componentKey: 'projectTemplateDetail',
    requiredPermission: 'project.template.view',
    page: {
      title: '模板详情',
      subtitle: '维护模板基础信息，并通过可视化画布配置项目流程节点。',
    },
  },
  {
    path: '/bugs',
    componentKey: 'bugList',
    requiredPermission: 'bug.view',
    page: {
      title: 'Bug管理',
      subtitle: '统一管理缺陷记录、流转与验证闭环。',
    },
    menu: {
      section: 'project',
      label: '缺陷管理',
      icon: 'tool',
    },
  },
  {
    path: '/bug-workflow-config',
    componentKey: 'bugWorkflowConfig',
    requiredPermission: 'bug.manage',
    page: {
      title: 'Bug流程配置中心',
      subtitle: '配置 Bug 状态流转规则、动作文案与字段必填要求。',
    },
    menu: {
      section: 'project',
      label: '缺陷流程',
      icon: 'tool',
    },
  },
  {
    path: '/bugs/:id',
    componentKey: 'bugDetail',
    requiredPermission: 'bug.view',
    page: {
      title: 'Bug详情',
      subtitle: '查看缺陷详情、状态流转、历史和附件。',
    },
  },
  {
    path: '/feedback/list',
    componentKey: 'feedbackList',
    requiredPermission: 'feedback.view',
    page: {
      title: '用户问题记录',
      subtitle: '查看、筛选并维护用户反馈记录，支持 AI 分析和批量导入。',
    },
    menu: {
      section: 'feedback',
      label: '用户问题记录',
      icon: 'message',
    },
  },
  {
    path: '/feedback/dashboard',
    componentKey: 'feedbackDashboard',
    requiredPermission: 'feedback.view',
    page: {
      title: '反馈数据看板',
      subtitle: '按时间、产品和分类查看用户反馈处理与分析概览。',
    },
    menu: {
      section: 'feedback',
      label: '反馈数据看板',
      icon: 'message',
    },
  },
  {
    path: '/feedback/ai-config',
    componentKey: 'feedbackAIPromptConfig',
    requiredPermission: 'feedback.manage',
    page: {
      title: 'AI 配置',
      subtitle: '维护反馈分析场景的 Prompt、知识库与分类规则。',
    },
    menu: {
      section: 'feedback',
      label: 'AI 配置',
      icon: 'setting',
    },
  },
  {
    path: '/feedback/important-emails',
    componentKey: 'importantEmailConfig',
    requiredPermission: 'feedback.manage',
    page: {
      title: '重点邮箱配置',
      subtitle: '维护用户反馈中的重点邮箱规则，用于重要邮件识别与高亮展示。',
    },
    menu: {
      section: 'feedback',
      label: '重点邮箱配置',
      icon: 'setting',
    },
  },
  {
    path: '/notification/rules',
    componentKey: 'notificationRules',
    requiredPermission: 'notification.rule.manage',
    page: {
      title: '通知规则',
      subtitle: '维护通知中心规则配置与启停状态。',
    },
    menu: {
      section: 'system',
      label: '通知规则',
      icon: 'setting',
    },
  },
  {
    path: '/agent-config',
    componentKey: 'agentConfig',
    requiredPermission: null,
    requiredRoles: ['ADMIN'],
    page: {
      title: 'Agent配置',
      subtitle: '维护不同业务场景下可人工触发的 Agent、定位与 Prompt 配置。',
    },
    menu: {
      section: 'system',
      label: 'Agent配置',
      icon: 'setting',
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
    path: '/launch-plan/:id',
    componentKey: 'launchPlan',
    requiredPermission: 'demand.view',
    page: {
      title: '上线计划详情',
      subtitle: '查看需求详情、流程与关联事项。',
    },
  },
  {
    path: '/my-demands/:id',
    componentKey: 'myDemands',
    requiredPermission: 'demand.view',
    page: {
      title: '我的需求详情',
      subtitle: '查看我创建或我参与的需求详情、流程和关联事项。',
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
      section: 'personal',
      label: '个人设置',
      icon: 'setting',
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
    path: '/integrations/feishu-contacts',
    componentKey: 'feishuContacts',
    requiredPermission: 'option.view',
    page: {
      title: '飞书通讯录',
      subtitle: '手动同步飞书通讯录快照，查看成员标识、组织信息与原始回传数据。',
    },
    menu: {
      section: 'integration',
      label: '飞书通讯录',
      icon: 'api',
    },
  },
  {
    path: '/integrations/feishu-user-bindings',
    componentKey: 'feishuUserBindings',
    requiredPermission: 'option.view',
    page: {
      title: '飞书账号映射',
      subtitle: '将系统用户与飞书通讯录快照人工绑定，为后续消息通知提供准确 open_id。',
    },
    menu: {
      section: 'integration',
      label: '飞书账号映射',
      icon: 'api',
    },
  },
  {
    path: '/archive-demands',
    componentKey: 'archiveDemands',
    requiredPermission: 'archive.view',
    page: {
      title: '归档管理',
      subtitle: '集中管理已归档需求，并支持彻底删除。',
    },
    menu: {
      section: 'system',
      label: '归档管理',
      icon: 'tool',
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
