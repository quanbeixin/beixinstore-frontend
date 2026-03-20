import {
  ApartmentOutlined,
  FilterOutlined,
  GlobalOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Card, Empty, Input, Select, Space, Spin, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMenuVisibilityDepartmentsApi,
  getMenuVisibilityRulesApi,
  getMyMenuVisibilityApi,
  getRbacRolesApi,
  updateMenuVisibilityRuleApi,
} from '../api/rbac'
import { PRIVATE_ROUTES } from '../config/route.config'
import { hasPermission, setMenuVisibilityAccessMap, setMenuVisibilityRules } from '../utils/access'

const { Text } = Typography

const MENU_SCOPE_OPTIONS = [
  { label: '全员可见', value: 'ALL' },
  { label: '按角色可见', value: 'ROLE' },
  { label: '按部门成员可见', value: 'DEPT_MEMBERS' },
  { label: '按部门负责人可见', value: 'DEPT_MANAGERS' },
]

const SCOPE_META = {
  ALL: { label: '全员可见', color: 'green' },
  ROLE: { label: '按角色可见', color: 'blue' },
  DEPT_MEMBERS: { label: '按部门成员可见', color: 'gold' },
  DEPT_MANAGERS: { label: '按部门负责人可见', color: 'purple' },
}

const SECTION_LABELS = {
  main: '主导航',
  system: '系统设置',
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeRoleKeys(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeRule(rule = {}) {
  const scopeType = String(rule.scope_type || 'ALL').trim().toUpperCase()
  const departmentId = toPositiveInt(rule.department_id)
  const roleKeys = normalizeRoleKeys(rule.role_keys)

  if (scopeType === 'ROLE') {
    return {
      scope_type: 'ROLE',
      department_id: null,
      role_keys: roleKeys,
    }
  }

  if (scopeType === 'DEPT_MEMBERS' || scopeType === 'DEPT_MANAGERS') {
    return {
      scope_type: scopeType,
      department_id: departmentId,
      role_keys: [],
    }
  }

  return {
    scope_type: 'ALL',
    department_id: null,
    role_keys: [],
  }
}

function buildRulesMap(rules = []) {
  const map = {}

  if (!Array.isArray(rules)) return map

  rules.forEach((item) => {
    const menuKey = String(item?.menu_key || '').trim()
    if (!menuKey) return
    map[menuKey] = normalizeRule(item)
  })

  return map
}

function buildDraftMap(menuRouteItems, rulesMap) {
  const draft = {}

  menuRouteItems.forEach((item) => {
    draft[item.menuKey] = rulesMap[item.menuKey] || normalizeRule({ scope_type: 'ALL' })
  })

  return draft
}

function validateRule(rule) {
  if (rule.scope_type === 'ROLE' && rule.role_keys.length === 0) {
    return '按角色可见时，至少需要选择一个角色'
  }

  if (
    (rule.scope_type === 'DEPT_MEMBERS' || rule.scope_type === 'DEPT_MANAGERS') &&
    !toPositiveInt(rule.department_id)
  ) {
    return '按部门范围可见时，需要选择一个部门'
  }

  return ''
}

function MenuVisibility() {
  const canManage = hasPermission('option.manage')

  const [loading, setLoading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savingMenuKey, setSavingMenuKey] = useState('')
  const [keyword, setKeyword] = useState('')

  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [rulesMap, setRulesMap] = useState({})

  const roleOptions = useMemo(
    () =>
      roles
        .filter((role) => role.role_key)
        .map((role) => ({
          label: `${role.name} (${role.role_key})`,
          value: role.role_key,
        })),
    [roles],
  )

  const departmentOptions = useMemo(
    () =>
      departments.map((dept) => ({
        label: dept.name,
        value: dept.id,
      })),
    [departments],
  )

  const menuRouteItems = useMemo(() => {
    return PRIVATE_ROUTES.filter((route) => route.menu).map((route) => {
      const menuKey = String(route.menu.key || route.path || '').trim()
      const section = route.menu.section || 'main'
      return {
        menuKey,
        path: route.path,
        section,
        sectionLabel: route.menu.sectionLabel || SECTION_LABELS[section] || section,
        label: route.menu.label || route.path,
      }
    })
  }, [])

  const filteredMenuSections = useMemo(() => {
    const sectionMap = {}

    menuRouteItems.forEach((item) => {
      if (!sectionMap[item.section]) {
        sectionMap[item.section] = {
          key: item.section,
          label: item.sectionLabel || SECTION_LABELS[item.section] || item.section,
          items: [],
        }
      }
    })

    const q = keyword.trim().toLowerCase()
    menuRouteItems.forEach((item) => {
      const section = sectionMap[item.section]
      const haystack = `${item.label} ${item.path} ${item.section} ${section.label}`.toLowerCase()
      if (!q || haystack.includes(q)) {
        section.items.push(item)
      }
    })

    const sections = Object.values(sectionMap).filter((section) => section.items.length > 0)
    const orderedSections = []
    const preferredOrder = ['main', 'system']

    preferredOrder.forEach((key) => {
      const section = sections.find((item) => item.key === key)
      if (section) orderedSections.push(section)
    })

    sections.forEach((section) => {
      if (!preferredOrder.includes(section.key)) {
        orderedSections.push(section)
      }
    })

    return orderedSections
  }, [menuRouteItems, keyword])

  const filteredMenuCount = useMemo(
    () => filteredMenuSections.reduce((acc, section) => acc + section.items.length, 0),
    [filteredMenuSections],
  )

  const summary = useMemo(() => {
    const counts = {
      total: menuRouteItems.length,
      all: 0,
      role: 0,
      deptMembers: 0,
      deptManagers: 0,
    }

    menuRouteItems.forEach((item) => {
      const scope = normalizeRule(rulesMap[item.menuKey] || {}).scope_type
      if (scope === 'ALL') counts.all += 1
      if (scope === 'ROLE') counts.role += 1
      if (scope === 'DEPT_MEMBERS') counts.deptMembers += 1
      if (scope === 'DEPT_MANAGERS') counts.deptManagers += 1
    })

    return counts
  }, [menuRouteItems, rulesMap])

  const syncMyMenuAccess = useCallback(async () => {
    try {
      const result = await getMyMenuVisibilityApi()
      if (result?.success) {
        setMenuVisibilityAccessMap(result?.data?.menu_access_map || {})
      }
    } catch {
      // keep current cache
    }
  }, [])

  const fetchBaseData = useCallback(async () => {
    setLoading(true)
    try {
      const [rolesResult, rulesResult, departmentsResult] = await Promise.all([
        getRbacRolesApi(),
        getMenuVisibilityRulesApi(),
        getMenuVisibilityDepartmentsApi(),
      ])

      if (!rolesResult?.success) {
        message.error(rolesResult?.message || '获取角色列表失败')
        return
      }

      if (!rulesResult?.success) {
        message.error(rulesResult?.message || '获取菜单规则失败')
        return
      }

      if (!departmentsResult?.success) {
        message.error(departmentsResult?.message || '获取部门列表失败')
        return
      }

      setRoles(rolesResult.data || [])
      setDepartments((departmentsResult.data || []).filter((dept) => Number(dept.enabled) !== 0))

      const fetchedRulesMap = buildRulesMap(rulesResult?.data?.rules || [])
      const draftMap = buildDraftMap(menuRouteItems, fetchedRulesMap)
      setRulesMap(draftMap)
      setMenuVisibilityRules(draftMap)
    } catch (error) {
      message.error(error?.message || '加载菜单规则失败')
    } finally {
      setLoading(false)
    }
  }, [menuRouteItems])

  useEffect(() => {
    fetchBaseData()
  }, [fetchBaseData])

  const updateRuleDraft = (menuKey, patch) => {
    setRulesMap((prev) => {
      const current = normalizeRule(prev[menuKey] || {})
      const next = normalizeRule({
        ...current,
        ...patch,
      })
      return {
        ...prev,
        [menuKey]: next,
      }
    })
  }

  const buildSavePayload = (menuKey) => {
    const rule = normalizeRule(rulesMap[menuKey] || {})
    return {
      menu_key: menuKey,
      scope_type: rule.scope_type,
      department_id: rule.department_id,
      role_keys: rule.role_keys,
    }
  }

  const handleSaveSingle = async (menuKey) => {
    if (!menuKey || !canManage) return

    const rule = normalizeRule(rulesMap[menuKey] || {})
    const validationError = validateRule(rule)
    if (validationError) {
      message.warning(validationError)
      return
    }

    try {
      setSavingMenuKey(menuKey)
      const result = await updateMenuVisibilityRuleApi(buildSavePayload(menuKey))

      if (!result?.success) {
        message.error(result?.message || '保存菜单规则失败')
        return
      }

      const savedRule = normalizeRule(result?.data || {})
      const nextMap = {
        ...rulesMap,
        [menuKey]: savedRule,
      }

      setRulesMap(nextMap)
      setMenuVisibilityRules(nextMap)
      await syncMyMenuAccess()
      message.success('菜单规则已保存')
    } catch (error) {
      message.error(error?.message || '保存菜单规则失败')
    } finally {
      setSavingMenuKey('')
    }
  }

  const handleSaveAll = async () => {
    if (!canManage) return

    try {
      setSavingAll(true)

      const tasks = menuRouteItems.map(async (item) => {
        const rule = normalizeRule(rulesMap[item.menuKey] || {})
        const validationError = validateRule(rule)
        if (validationError) {
          throw new Error(`${item.label}: ${validationError}`)
        }

        const result = await updateMenuVisibilityRuleApi(buildSavePayload(item.menuKey))
        if (!result?.success) {
          throw new Error(result?.message || `保存失败: ${item.label}`)
        }
        return { menuKey: item.menuKey, rule: normalizeRule(result?.data || {}) }
      })

      const settled = await Promise.allSettled(tasks)
      const failed = settled.filter((item) => item.status === 'rejected')

      if (failed.length > 0) {
        message.error(`批量保存完成，但有 ${failed.length} 项失败`)
        return
      }

      const nextMap = { ...rulesMap }
      settled.forEach((item) => {
        if (item.status === 'fulfilled') {
          nextMap[item.value.menuKey] = item.value.rule
        }
      })

      setRulesMap(nextMap)
      setMenuVisibilityRules(nextMap)
      await syncMyMenuAccess()
      message.success(`批量保存成功，共 ${menuRouteItems.length} 项`)
    } catch (error) {
      message.error(error?.message || '批量保存失败')
    } finally {
      setSavingAll(false)
    }
  }

  return (
    <div className="menu-visibility-page">
      <Card className="menu-visibility-hero" variant="borderless">
        <div className="menu-visibility-hero-head">
          <div>
            <h1 className="menu-visibility-title">菜单权限</h1>
            <p className="menu-visibility-subtitle">
              把可见规则和组织关系放在同一页统一管理，减少漏配与误配。
            </p>
          </div>
          <Tag color="geekblue" className="menu-visibility-tag">
            <SafetyCertificateOutlined /> 权限治理
          </Tag>
        </div>

        <div className="menu-visibility-stats">
          <div className="menu-visibility-stat">
            <div className="label">
              <FilterOutlined /> 菜单总数
            </div>
            <div className="value">{summary.total}</div>
          </div>
          <div className="menu-visibility-stat">
            <div className="label">
              <GlobalOutlined /> 全员可见
            </div>
            <div className="value">{summary.all}</div>
          </div>
          <div className="menu-visibility-stat">
            <div className="label">
              <TeamOutlined /> 角色可见
            </div>
            <div className="value">{summary.role}</div>
          </div>
          <div className="menu-visibility-stat">
            <div className="label">
              <ApartmentOutlined /> 部门可见
            </div>
            <div className="value">{summary.deptMembers + summary.deptManagers}</div>
          </div>
        </div>
      </Card>

      <Card className="menu-visibility-toolbar" variant="borderless">
        <div className="toolbar-left">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索菜单名称 / 路径 / 分组"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 320 }}
          />
          <Text type="secondary">匹配 {filteredMenuCount} / {menuRouteItems.length} 项</Text>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchBaseData} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAll}
            loading={savingAll}
            disabled={!canManage || loading || menuRouteItems.length === 0}
          >
            批量保存全部菜单配置
          </Button>
        </Space>
      </Card>

      {loading ? (
        <Card className="menu-visibility-panel">
          <Spin />
        </Card>
      ) : (
        <Card className="menu-visibility-panel">
          {filteredMenuCount === 0 ? (
            <Empty description={keyword ? '没有匹配的菜单' : '暂无可配置菜单'} />
          ) : (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              {filteredMenuSections.map((section) => (
                <div className="menu-visibility-section" key={section.key}>
                  <div className="menu-visibility-section-head">
                    <div className="menu-visibility-section-title">
                      {section.key === 'main' ? <GlobalOutlined /> : <ApartmentOutlined />}
                      <span>{section.label}</span>
                      <Tag>父级</Tag>
                    </div>
                    <Text type="secondary">{section.items.length} 个子菜单</Text>
                  </div>

                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    {section.items.map((item) => {
                      const rule = normalizeRule(rulesMap[item.menuKey] || {})
                      const isRoleScope = rule.scope_type === 'ROLE'
                      const isDeptScope =
                        rule.scope_type === 'DEPT_MEMBERS' || rule.scope_type === 'DEPT_MANAGERS'
                      const scopeMeta = SCOPE_META[rule.scope_type] || SCOPE_META.ALL

                      return (
                        <div className="menu-visibility-rule" key={item.menuKey}>
                          <div className="menu-visibility-rule-meta">
                            <div className="title-line">
                              <span className="title">{item.label}</span>
                              <Tag>子级</Tag>
                              <Tag color={scopeMeta.color}>{scopeMeta.label}</Tag>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              父级：{item.sectionLabel} | 路径：{item.path}
                            </Text>
                          </div>

                          <div className="menu-visibility-rule-controls">
                            <Select
                              value={rule.scope_type}
                              options={MENU_SCOPE_OPTIONS}
                              disabled={!canManage || savingAll}
                              onChange={(value) => {
                                if (value === 'ALL') {
                                  updateRuleDraft(item.menuKey, {
                                    scope_type: 'ALL',
                                    department_id: null,
                                    role_keys: [],
                                  })
                                  return
                                }

                                if (value === 'ROLE') {
                                  updateRuleDraft(item.menuKey, {
                                    scope_type: 'ROLE',
                                    department_id: null,
                                  })
                                  return
                                }

                                updateRuleDraft(item.menuKey, {
                                  scope_type: value,
                                  role_keys: [],
                                })
                              }}
                            />

                            {isRoleScope ? (
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="选择角色"
                                value={rule.role_keys}
                                options={roleOptions}
                                disabled={!canManage || savingAll}
                                onChange={(vals) =>
                                  updateRuleDraft(item.menuKey, { role_keys: normalizeRoleKeys(vals) })
                                }
                              />
                            ) : null}

                            {isDeptScope ? (
                              <Select
                                allowClear
                                placeholder="选择部门"
                                value={rule.department_id}
                                options={departmentOptions}
                                disabled={!canManage || savingAll}
                                onChange={(value) =>
                                  updateRuleDraft(item.menuKey, { department_id: toPositiveInt(value) })
                                }
                              />
                            ) : null}

                            {!isRoleScope && !isDeptScope ? (
                              <div className="no-filter">
                                <GlobalOutlined /> 当前菜单默认对所有登录用户可见
                              </div>
                            ) : null}

                            <Button
                              icon={<SaveOutlined />}
                              loading={savingMenuKey === item.menuKey}
                              disabled={!canManage || savingAll}
                              onClick={() => handleSaveSingle(item.menuKey)}
                            >
                              保存
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      )}
    </div>
  )
}

export default MenuVisibility
