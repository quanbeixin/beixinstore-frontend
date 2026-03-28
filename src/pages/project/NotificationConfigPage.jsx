import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, InputNumber, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getNotificationConfigsApi, updateNotificationConfigApi } from '../../api/work'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

const SCENE_META = {
  node_assign: { label: '节点指派', desc: '节点被分配给执行人时触发' },
  node_reject: { label: '节点驳回', desc: '节点被驳回时触发' },
  task_assign: { label: '任务指派', desc: '任务分配时触发' },
  task_deadline: { label: '任务截止提醒', desc: '按提前天数触发截止提醒' },
  task_complete: { label: '任务完成', desc: '任务完成时触发' },
  node_complete: { label: '节点完成', desc: '节点完成时触发' },
}

const RECEIVER_ROLE_OPTIONS = [
  { label: '节点负责人', value: 'node_assignee' },
  { label: '任务负责人', value: 'task_assignee' },
  { label: '任务创建人', value: 'task_creator' },
  { label: '项目负责人', value: 'project_manager' },
]

const DEFAULT_SCENE_CONFIG = {
  node_assign: { enabled: 1, receiver_roles: ['node_assignee'], advance_days: 0 },
  node_reject: { enabled: 1, receiver_roles: ['node_assignee'], advance_days: 0 },
  task_assign: { enabled: 1, receiver_roles: ['task_assignee'], advance_days: 0 },
  task_deadline: { enabled: 1, receiver_roles: ['task_assignee'], advance_days: 1 },
  task_complete: { enabled: 1, receiver_roles: ['task_creator'], advance_days: 0 },
  node_complete: { enabled: 1, receiver_roles: ['project_manager'], advance_days: 0 },
}

function normalizeRows(rows) {
  return (rows || []).map((row) => ({
    scene: String(row?.scene || '').trim(),
    enabled: Number(row?.enabled) === 1 ? 1 : 0,
    receiver_roles: Array.isArray(row?.receiver_roles) ? row.receiver_roles : [],
    advance_days: Number.isInteger(Number(row?.advance_days)) ? Number(row.advance_days) : 0,
    updated_at: row?.updated_at || null,
  }))
}

function NotificationConfig() {
  const canManage = hasPermission('notification.config.manage')
  const [loading, setLoading] = useState(false)
  const [savingScene, setSavingScene] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  const [rows, setRows] = useState([])

  const sceneRows = useMemo(() => {
    return [...rows].sort((a, b) => String(a.scene).localeCompare(String(b.scene)))
  }, [rows])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getNotificationConfigsApi()
      if (!result?.success) {
        message.error(result?.message || '获取通知配置失败')
        return
      }
      setRows(normalizeRows(result.data))
    } catch (error) {
      message.error(error?.message || '获取通知配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const patchRow = (scene, partial) => {
    setRows((prev) =>
      prev.map((item) =>
        String(item.scene) === String(scene)
          ? {
              ...item,
              ...partial,
            }
          : item,
      ),
    )
  }

  const applyDefaultConfigs = useCallback(() => {
    setRows((prev) =>
      prev.map((item) => {
        const defaults = DEFAULT_SCENE_CONFIG[item.scene]
        if (!defaults) return item
        return {
          ...item,
          enabled: Number(defaults.enabled) === 1 ? 1 : 0,
          receiver_roles: Array.isArray(defaults.receiver_roles) ? defaults.receiver_roles : [],
          advance_days: Number(defaults.advance_days || 0),
        }
      }),
    )
  }, [])

  const handleSaveScene = async (scene) => {
    const row = rows.find((item) => String(item.scene) === String(scene))
    if (!row) return

    try {
      setSavingScene(scene)
      const result = await updateNotificationConfigApi(scene, {
        enabled: Number(row.enabled) === 1 ? 1 : 0,
        receiver_roles: Array.isArray(row.receiver_roles) ? row.receiver_roles : [],
        advance_days: Number(row.advance_days || 0),
      })
      if (!result?.success) {
        message.error(result?.message || '保存通知配置失败')
        return
      }
      message.success(`场景「${SCENE_META[scene]?.label || scene}」保存成功`)
      const updated = result?.data || null
      if (updated) {
        patchRow(scene, {
          enabled: Number(updated.enabled) === 1 ? 1 : 0,
          receiver_roles: Array.isArray(updated.receiver_roles) ? updated.receiver_roles : [],
          advance_days: Number(updated.advance_days || 0),
          updated_at: updated.updated_at || row.updated_at || null,
        })
      }
    } catch (error) {
      message.error(error?.message || '保存通知配置失败')
    } finally {
      setSavingScene('')
    }
  }

  const columns = [
    {
      title: '通知场景',
      dataIndex: 'scene',
      key: 'scene',
      width: 240,
      render: (scene) => (
        <Space direction="vertical" size={2}>
          <Tag color="blue">{SCENE_META[scene]?.label || scene}</Tag>
          <Text type="secondary">{SCENE_META[scene]?.desc || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 110,
      render: (value, row) => (
        <Switch
          checked={Number(value) === 1}
          disabled={!canManage || savingAll}
          onChange={(checked) => patchRow(row.scene, { enabled: checked ? 1 : 0 })}
        />
      ),
    },
    {
      title: '接收角色',
      dataIndex: 'receiver_roles',
      key: 'receiver_roles',
      render: (value, row) => (
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={Array.isArray(value) ? value : []}
          options={RECEIVER_ROLE_OPTIONS}
          disabled={!canManage || savingAll}
          placeholder="选择接收角色"
          onChange={(next) => patchRow(row.scene, { receiver_roles: next || [] })}
        />
      ),
    },
    {
      title: '提前天数',
      dataIndex: 'advance_days',
      key: 'advance_days',
      width: 130,
      render: (value, row) => (
        <InputNumber
          min={0}
          max={30}
          precision={0}
          style={{ width: '100%' }}
          value={Number(value || 0)}
          disabled={!canManage || savingAll}
          onChange={(next) => patchRow(row.scene, { advance_days: Number(next || 0) })}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="primary"
          icon={<SaveOutlined />}
          size="small"
          disabled={!canManage || savingAll}
          loading={!savingAll && savingScene === row.scene}
          onClick={() => handleSaveScene(row.scene)}
        >
          保存
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title="通知配置"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
              刷新
            </Button>
            {canManage ? (
              <Popconfirm
                title="恢复默认配置"
                description="将当前页面值恢复到系统默认，不会自动保存到数据库。"
                okText="恢复"
                cancelText="取消"
                onConfirm={applyDefaultConfigs}
              >
                <Button disabled={savingAll}>恢复默认</Button>
              </Popconfirm>
            ) : null}
            {canManage ? (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingAll}
                onClick={async () => {
                  try {
                    setSavingAll(true)
                    const tasks = sceneRows.map((row) =>
                      updateNotificationConfigApi(row.scene, {
                        enabled: Number(row.enabled) === 1 ? 1 : 0,
                        receiver_roles: Array.isArray(row.receiver_roles) ? row.receiver_roles : [],
                        advance_days: Number(row.advance_days || 0),
                      })
                        .then((result) => ({ scene: row.scene, ok: Boolean(result?.success), message: result?.message || '' }))
                        .catch((error) => ({ scene: row.scene, ok: false, message: error?.message || '请求失败' })),
                    )

                    const results = await Promise.all(tasks)
                    const failed = results.filter((item) => !item.ok)
                    if (failed.length > 0) {
                      const failedLabelText = failed
                        .map((item) => SCENE_META[item.scene]?.label || item.scene)
                        .join('、')
                      message.error(
                        failedLabelText
                          ? `批量保存完成，失败 ${failed.length} 项：${failedLabelText}`
                          : `批量保存完成，失败 ${failed.length} 项`,
                      )
                    } else {
                      message.success('所有通知配置保存成功')
                    }
                    await loadData()
                  } catch (error) {
                    message.error(error?.message || '批量保存失败')
                  } finally {
                    setSavingAll(false)
                  }
                }}
              >
                保存全部
              </Button>
            ) : null}
          </Space>
        }
      >
        <Table
          rowKey="scene"
          loading={loading}
          dataSource={sceneRows}
          columns={columns}
          pagination={false}
          scroll={{ x: 1080 }}
          locale={{ emptyText: '暂无通知配置' }}
        />
        {!canManage ? (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            当前账号仅可查看通知配置，如需修改请分配 `notification.config.manage` 权限。
          </Text>
        ) : null}
      </Card>
    </div>
  )
}

export default NotificationConfig
