import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getRbacPermissionsApi,
  getRbacRolesApi,
  getRolePermissionsApi,
  updateRolePermissionsApi,
} from '../api/rbac'
import { hasPermission } from '../utils/access'

const { Text } = Typography

function groupByModule(permissions = []) {
  const map = new Map()

  permissions.forEach((item) => {
    const moduleKey = item.module_key || 'misc'
    if (!map.has(moduleKey)) {
      map.set(moduleKey, [])
    }
    map.get(moduleKey).push(item)
  })

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([moduleKey, items]) => ({
      moduleKey,
      items: items.sort((x, y) => x.permission_code.localeCompare(y.permission_code)),
    }))
}

function RolePermissions() {
  const canManage = hasPermission('option.manage')

  const [loadingBase, setLoadingBase] = useState(false)
  const [loadingRolePermissions, setLoadingRolePermissions] = useState(false)
  const [saving, setSaving] = useState(false)

  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([])
  const [permissionKeyword, setPermissionKeyword] = useState('')

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  )

  const filteredPermissionGroups = useMemo(() => {
    const keyword = permissionKeyword.trim().toLowerCase()
    if (!keyword) {
      return groupByModule(permissions)
    }

    const filtered = permissions.filter((item) => {
      const haystack = `${item.module_key || 'misc'} ${item.permission_name || ''} ${item.permission_code || ''}`
      return haystack.toLowerCase().includes(keyword)
    })

    return groupByModule(filtered)
  }, [permissions, permissionKeyword])

  const fetchBaseData = useCallback(async () => {
    setLoadingBase(true)
    try {
      const [rolesResult, permissionsResult] = await Promise.all([
        getRbacRolesApi(),
        getRbacPermissionsApi(),
      ])

      if (!rolesResult?.success) {
        message.error(rolesResult?.message || '获取角色列表失败')
        return
      }

      if (!permissionsResult?.success) {
        message.error(permissionsResult?.message || '获取权限点失败')
        return
      }

      const roleList = rolesResult.data || []
      setRoles(roleList)
      setPermissions(permissionsResult.data || [])

      if (!selectedRoleId && roleList.length > 0) {
        setSelectedRoleId(roleList[0].id)
      }
    } catch (error) {
      message.error(error?.message || '加载角色权限数据失败')
    } finally {
      setLoadingBase(false)
    }
  }, [selectedRoleId])

  const fetchRolePermissions = useCallback(async (roleId) => {
    if (!roleId) {
      setSelectedPermissionIds([])
      return
    }

    setLoadingRolePermissions(true)
    try {
      const result = await getRolePermissionsApi(roleId)
      if (!result?.success) {
        message.error(result?.message || '获取角色权限失败')
        return
      }

      setSelectedPermissionIds(result.data?.permission_ids || [])
    } catch (error) {
      message.error(error?.message || '获取角色权限失败')
    } finally {
      setLoadingRolePermissions(false)
    }
  }, [])

  useEffect(() => {
    fetchBaseData()
  }, [fetchBaseData])

  useEffect(() => {
    if (selectedRoleId) {
      fetchRolePermissions(selectedRoleId)
    }
  }, [selectedRoleId, fetchRolePermissions])

  const mergeModuleSelection = useCallback((modulePermissionIds, nextCheckedIds) => {
    setSelectedPermissionIds((prev) => {
      const prevSet = new Set(prev)
      modulePermissionIds.forEach((id) => prevSet.delete(id))
      nextCheckedIds.forEach((id) => prevSet.add(id))
      return Array.from(prevSet)
    })
  }, [])

  const handleModuleChange = (modulePermissionIds, checkedIdsInModule) => {
    const nextIds = checkedIdsInModule.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    mergeModuleSelection(modulePermissionIds, nextIds)
  }

  const handleSelectAllInModule = (modulePermissionIds, checked) => {
    mergeModuleSelection(modulePermissionIds, checked ? modulePermissionIds : [])
  }

  const handleInvertInModule = (modulePermissionIds) => {
    setSelectedPermissionIds((prev) => {
      const prevSet = new Set(prev)
      const selectedInModule = modulePermissionIds.filter((id) => prevSet.has(id))

      modulePermissionIds.forEach((id) => prevSet.delete(id))
      modulePermissionIds
        .filter((id) => !selectedInModule.includes(id))
        .forEach((id) => prevSet.add(id))

      return Array.from(prevSet).filter((id) => Number.isInteger(id) && id > 0)
    })
  }

  const handleSave = async () => {
    if (!selectedRoleId || !canManage) return

    try {
      setSaving(true)
      const result = await updateRolePermissionsApi(selectedRoleId, {
        permission_ids: selectedPermissionIds,
      })

      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success('角色权限已更新')
      fetchRolePermissions(selectedRoleId)
    } catch (error) {
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ReloadOutlined />} onClick={fetchBaseData} loading={loadingBase}>
          刷新
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!canManage || !selectedRoleId || selectedRole?.role_key === 'SUPER_ADMIN'}
        >
          保存权限
        </Button>
      </div>

      {loadingBase ? (
        <Spin />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px' }}>
          <Card title="角色列表">
            {roles.length === 0 ? (
              <Empty description="暂无角色" />
            ) : (
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                {roles.map((role) => {
                  const selected = role.id === selectedRoleId
                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      style={{
                        border: `1px solid ${selected ? '#1677ff' : '#f0f0f0'}`,
                        borderRadius: 8,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        background: selected ? '#f0f7ff' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{role.name}</strong>
                        {role.role_key ? <Tag color="blue">{role.role_key}</Tag> : null}
                      </div>
                      <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                        level: {role.role_level ?? 0}
                      </div>
                    </div>
                  )
                })}
              </Space>
            )}
          </Card>

          <Card
            title={
              selectedRole
                ? `权限点配置 - ${selectedRole.name}${selectedRole.role_key ? ` (${selectedRole.role_key})` : ''}`
                : '权限点配置'
            }
            extra={
              <Input
                allowClear
                placeholder="搜索模块/权限名/权限码"
                value={permissionKeyword}
                onChange={(e) => setPermissionKeyword(e.target.value)}
                style={{ width: 260 }}
              />
            }
          >
            {!selectedRole ? (
              <Empty description="请先选择角色" />
            ) : loadingRolePermissions ? (
              <Spin />
            ) : selectedRole.role_key === 'SUPER_ADMIN' ? (
              <Empty description="超级管理员角色默认拥有所有权限，无需配置" />
            ) : filteredPermissionGroups.length === 0 ? (
              <Empty description="没有匹配的权限点" />
            ) : (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                {filteredPermissionGroups.map((group) => {
                  const enabledPermissionIds = group.items
                    .filter((item) => Number(item.enabled) === 1)
                    .map((item) => item.id)

                  const checkedInModule = selectedPermissionIds.filter((id) =>
                    enabledPermissionIds.includes(id),
                  )

                  const allChecked =
                    enabledPermissionIds.length > 0 && checkedInModule.length === enabledPermissionIds.length
                  const indeterminate =
                    checkedInModule.length > 0 && checkedInModule.length < enabledPermissionIds.length

                  return (
                    <Card
                      key={group.moduleKey}
                      size="small"
                      title={`模块：${group.moduleKey}`}
                      style={{ borderRadius: 10 }}
                      extra={
                        <Space size="small">
                          <Checkbox
                            checked={allChecked}
                            indeterminate={indeterminate}
                            disabled={enabledPermissionIds.length === 0}
                            onChange={(e) => handleSelectAllInModule(enabledPermissionIds, e.target.checked)}
                          >
                            全选
                          </Checkbox>
                          <Button
                            type="link"
                            size="small"
                            disabled={enabledPermissionIds.length === 0}
                            onClick={() => handleSelectAllInModule(enabledPermissionIds, false)}
                          >
                            清空
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            disabled={enabledPermissionIds.length === 0}
                            onClick={() => handleInvertInModule(enabledPermissionIds)}
                          >
                            反选
                          </Button>
                        </Space>
                      }
                    >
                      <Checkbox.Group
                        style={{ width: '100%' }}
                        value={checkedInModule}
                        onChange={(vals) => handleModuleChange(enabledPermissionIds, vals)}
                        options={group.items.map((item) => ({
                          value: item.id,
                          label: `${item.permission_name} (${item.permission_code})`,
                          disabled: Number(item.enabled) !== 1,
                        }))}
                      />
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          已选 {checkedInModule.length} / 可选 {enabledPermissionIds.length}
                        </Text>
                      </div>
                    </Card>
                  )
                })}
              </Space>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

export default RolePermissions
