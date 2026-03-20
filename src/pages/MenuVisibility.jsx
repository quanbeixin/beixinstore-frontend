import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Select, Space, Spin, Tag, Typography, message } from 'antd'
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
    return '部门范围需要选择一个部门'
  }

  return ''
}

function MenuVisibility() {
  const canManage = hasPermission('option.manage')

  const [loading, setLoading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savingMenuKey, setSavingMenuKey] = useState('')

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
      return {
        menuKey,
        path: route.path,
        section: route.menu.section || 'main',
        label: route.menu.label || route.path,
      }
    })
  }, [])

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
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>菜单权限</h1>
        <p style={{ color: '#666', marginTop: '8px' }}>
          支持按角色、部门成员、部门负责人配置菜单可见范围。
        </p>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
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
      </div>

      {loading ? (
        <Spin />
      ) : (
        <Card>
          {menuRouteItems.length === 0 ? (
            <Empty description="暂无可配置菜单" />
          ) : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {menuRouteItems.map((item) => {
                const rule = normalizeRule(rulesMap[item.menuKey] || {})
                const isRoleScope = rule.scope_type === 'ROLE'
                const isDeptScope =
                  rule.scope_type === 'DEPT_MEMBERS' || rule.scope_type === 'DEPT_MANAGERS'

                return (
                  <div
                    key={item.menuKey}
                    style={{
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: '12px',
                      display: 'grid',
                      gridTemplateColumns: '260px 200px 1fr auto',
                      gap: '12px',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.label}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.path} | {item.section}
                      </Text>
                    </div>

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
                        onChange={(vals) => updateRuleDraft(item.menuKey, { role_keys: normalizeRoleKeys(vals) })}
                      />
                    ) : isDeptScope ? (
                      <Select
                        allowClear
                        placeholder="选择部门"
                        value={rule.department_id}
                        options={departmentOptions}
                        disabled={!canManage || savingAll}
                        onChange={(value) => updateRuleDraft(item.menuKey, { department_id: toPositiveInt(value) })}
                      />
                    ) : (
                      <div>
                        <Tag color="green">无需额外条件</Tag>
                      </div>
                    )}

                    <Button
                      icon={<SaveOutlined />}
                      loading={savingMenuKey === item.menuKey}
                      disabled={!canManage || savingAll}
                      onClick={() => handleSaveSingle(item.menuKey)}
                    >
                      保存
                    </Button>
                  </div>
                )
              })}
            </Space>
          )}
        </Card>
      )}
    </div>
  )
}

export default MenuVisibility
