import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, InputNumber, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getBugWorkflowConfigApi, updateBugWorkflowConfigApi } from '../../api/bug'
import { DEFAULT_BUG_WORKFLOW_TRANSITIONS, normalizeBugWorkflowTransitions } from '../../modules/bug/utils/workflow'
import { hasPermission } from '../../utils/access'
import './BugWorkflowConfigPage.css'

const { Text } = Typography

const ACTION_NAME_MAP = Object.freeze({
  start: '开始处理',
  fix: '修复完成',
  verify: '验证通过',
  reopen: '重新打开',
  reject: '打回并关闭',
})

const ACTION_OPTIONS = Object.entries(ACTION_NAME_MAP).map(([value, label]) => ({ value, label }))

function toCode(value) {
  return String(value || '').trim().toUpperCase()
}

function toActionKey(value) {
  return String(value || '').trim().toLowerCase()
}

function toCodeList(values) {
  const source = Array.isArray(values) ? values : [values]
  const dedup = new Set()
  source.forEach((item) => {
    const code = toCode(item)
    if (code) dedup.add(code)
  })
  return Array.from(dedup)
}

function toBooleanNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1
  return 0
}

function toSortOrder(value, fallback = 10) {
  const num = Number(value)
  if (!Number.isInteger(num)) return fallback
  return num
}

function normalizeStatusRows(rows = []) {
  const source = Array.isArray(rows) ? rows : []
  return source
    .map((item, index) => ({
      status_code: toCode(item?.status_code || item?.item_code),
      status_name: String(item?.status_name || item?.item_name || item?.item_code || '').trim() || `状态${index + 1}`,
      sort_order: toSortOrder(item?.sort_order, index + 1),
    }))
    .filter((item) => item.status_code)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function buildClientRow(seed = {}, index = 0) {
  const actionKey = toActionKey(seed?.action_key) || 'start'
  return {
    client_key: `wf-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    from_status_code: toCode(seed?.from_status_code),
    to_status_codes: toCodeList(seed?.to_status_codes || seed?.to_status_code),
    action_key: actionKey,
    action_name: String(seed?.action_name || '').trim() || ACTION_NAME_MAP[actionKey] || actionKey,
    enabled: toBooleanNumber(seed?.enabled, 1),
    sort_order: toSortOrder(seed?.sort_order, (index + 1) * 10),
    require_remark: toBooleanNumber(seed?.require_remark, 0),
    require_fix_solution: toBooleanNumber(seed?.require_fix_solution, 0),
    require_verify_result: toBooleanNumber(seed?.require_verify_result, 0),
  }
}

function buildClientRowsFromTransitions(rows = []) {
  const source = normalizeBugWorkflowTransitions(rows || [])
  const grouped = new Map()

  source.forEach((item, index) => {
    const key = [
      toCode(item?.from_status_code),
      toActionKey(item?.action_key),
      String(item?.action_name || '').trim(),
      Number(item?.enabled) === 1 ? 1 : 0,
      toSortOrder(item?.sort_order, (index + 1) * 10),
      Number(item?.require_remark) === 1 ? 1 : 0,
      Number(item?.require_fix_solution) === 1 ? 1 : 0,
      Number(item?.require_verify_result) === 1 ? 1 : 0,
    ].join('|')

    if (!grouped.has(key)) {
      grouped.set(key, buildClientRow(item, index))
    }

    const existing = grouped.get(key)
    existing.to_status_codes = toCodeList([...(existing.to_status_codes || []), item?.to_status_code])
  })

  return Array.from(grouped.values())
}

function BugWorkflowConfigPage() {
  const canManage = hasPermission('bug.manage')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editable, setEditable] = useState(false)
  const [statusRows, setStatusRows] = useState([])
  const [rows, setRows] = useState([])

  const statusOptions = useMemo(
    () =>
      statusRows.map((item) => ({
        value: item.status_code,
        label: `${item.status_name} (${item.status_code})`,
      })),
    [statusRows],
  )

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBugWorkflowConfigApi()
      if (!result?.success) {
        throw new Error(result?.message || '加载Bug流程配置失败')
      }

      const statuses = normalizeStatusRows(result?.data?.statuses || [])
      const transitions = normalizeBugWorkflowTransitions(result?.data?.transitions || [])
      setStatusRows(statuses)
      setRows(buildClientRowsFromTransitions(transitions))
      setEditable(Boolean(result?.data?.editable) && canManage)
    } catch (error) {
      message.error(error?.message || '加载Bug流程配置失败')
      setRows(buildClientRowsFromTransitions(DEFAULT_BUG_WORKFLOW_TRANSITIONS))
      setEditable(canManage)
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const updateRow = useCallback((clientKey, patch) => {
    setRows((prev) =>
      prev.map((item) => (item.client_key === clientKey ? { ...item, ...patch } : item)),
    )
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => {
      const maxSort = prev.reduce((acc, item) => Math.max(acc, Number(item?.sort_order || 0)), 0)
      const defaultStatus = statusRows[0]?.status_code || 'NEW'
      return prev.concat(
        buildClientRow(
          {
            from_status_code: defaultStatus,
            to_status_codes: [defaultStatus],
            action_key: 'start',
            action_name: ACTION_NAME_MAP.start,
            enabled: 1,
            sort_order: maxSort + 10,
            require_remark: 0,
            require_fix_solution: 0,
            require_verify_result: 0,
          },
          prev.length,
        ),
      )
    })
  }, [statusRows])

  const removeRow = useCallback((clientKey) => {
    setRows((prev) => prev.filter((item) => item.client_key !== clientKey))
  }, [])

  const resetToDefault = useCallback(() => {
    setRows(buildClientRowsFromTransitions(DEFAULT_BUG_WORKFLOW_TRANSITIONS))
    message.success('已恢复默认流程模板，请记得点击保存')
  }, [])

  const validateRowsBeforeSave = useCallback(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('请至少保留一条流程规则')
    }

    const statusCodeSet = new Set(statusRows.map((item) => item.status_code))
    const duplicateSet = new Set()
    const prepared = []

    rows.forEach((item, index) => {
      const normalized = {
        from_status_code: toCode(item?.from_status_code),
        action_key: toActionKey(item?.action_key),
        action_name: String(item?.action_name || '').trim(),
        enabled: toBooleanNumber(item?.enabled, 1),
        sort_order: toSortOrder(item?.sort_order, (index + 1) * 10),
        require_remark: toBooleanNumber(item?.require_remark, 0),
        require_fix_solution: toBooleanNumber(item?.require_fix_solution, 0),
        require_verify_result: toBooleanNumber(item?.require_verify_result, 0),
      }
      const targetCodes = toCodeList(item?.to_status_codes || item?.to_status_code)

      if (!normalized.from_status_code || !normalized.action_key || targetCodes.length === 0) {
        throw new Error(`第 ${index + 1} 行缺少来源状态、动作或目标状态`)
      }
      if (!ACTION_NAME_MAP[normalized.action_key]) {
        throw new Error(`第 ${index + 1} 行动作编码不支持：${normalized.action_key}`)
      }
      if (statusCodeSet.size > 0 && !statusCodeSet.has(normalized.from_status_code)) {
        throw new Error(`第 ${index + 1} 行来源状态无效：${normalized.from_status_code}`)
      }

      targetCodes.forEach((targetCode) => {
        if (statusCodeSet.size > 0 && !statusCodeSet.has(targetCode)) {
          throw new Error(`第 ${index + 1} 行目标状态无效：${targetCode}`)
        }

        const dedupKey = `${normalized.from_status_code}|${normalized.action_key}|${targetCode}`
        if (duplicateSet.has(dedupKey)) {
          throw new Error(`存在重复规则：${dedupKey}`)
        }
        duplicateSet.add(dedupKey)

        prepared.push({
          ...normalized,
          to_status_code: targetCode,
          action_name: normalized.action_name || ACTION_NAME_MAP[normalized.action_key] || normalized.action_key,
        })
      })
    })

    return prepared
  }, [rows, statusRows])

  const handleSave = useCallback(async () => {
    if (!editable) {
      message.warning('当前账号没有保存流程配置权限')
      return
    }

    try {
      const payloadRows = validateRowsBeforeSave()
      setSaving(true)
      const result = await updateBugWorkflowConfigApi({ transitions: payloadRows })
      if (!result?.success) {
        throw new Error(result?.message || '保存Bug流程配置失败')
      }

      const statuses = normalizeStatusRows(result?.data?.statuses || [])
      const transitions = normalizeBugWorkflowTransitions(result?.data?.transitions || payloadRows)
      setStatusRows(statuses)
      setRows(buildClientRowsFromTransitions(transitions))
      message.success(result?.message || 'Bug流程配置已保存')
    } catch (error) {
      message.error(error?.message || '保存Bug流程配置失败')
    } finally {
      setSaving(false)
    }
  }, [editable, validateRowsBeforeSave])

  const columns = useMemo(
    () => [
      {
        title: '来源状态',
        dataIndex: 'from_status_code',
        key: 'from_status_code',
        width: 190,
        render: (value, row) => (
          <Select
            size="small"
            value={value || undefined}
            style={{ width: '100%' }}
            options={statusOptions}
            disabled={!editable}
            placeholder="选择来源状态"
            onChange={(next) => updateRow(row.client_key, { from_status_code: toCode(next) })}
          />
        ),
      },
      {
        title: '动作',
        dataIndex: 'action_key',
        key: 'action_key',
        width: 160,
        render: (value, row) => (
          <Select
            size="small"
            value={value || undefined}
            style={{ width: '100%' }}
            options={ACTION_OPTIONS}
            disabled={!editable}
            placeholder="选择动作"
            onChange={(next) => {
              const actionKey = toActionKey(next)
              updateRow(row.client_key, {
                action_key: actionKey,
                action_name: String(row?.action_name || '').trim() || ACTION_NAME_MAP[actionKey] || actionKey,
              })
            }}
          />
        ),
      },
      {
        title: '动作文案',
        dataIndex: 'action_name',
        key: 'action_name',
        width: 200,
        render: (value, row) => (
          <Input
            size="small"
            value={value}
            disabled={!editable}
            maxLength={50}
            placeholder="按钮文案"
            onChange={(event) => updateRow(row.client_key, { action_name: event.target.value })}
          />
        ),
      },
      {
        title: '目标状态',
        dataIndex: 'to_status_codes',
        key: 'to_status_codes',
        width: 260,
        render: (value, row) => (
          <Select
            mode="multiple"
            size="small"
            value={Array.isArray(value) ? value : []}
            style={{ width: '100%' }}
            options={statusOptions}
            disabled={!editable}
            maxTagCount="responsive"
            placeholder="可选择多个目标状态"
            onChange={(next) => updateRow(row.client_key, { to_status_codes: toCodeList(next || []) })}
          />
        ),
      },
      {
        title: '备注必填',
        dataIndex: 'require_remark',
        key: 'require_remark',
        width: 92,
        render: (value, row) => (
          <Switch
            size="small"
            checked={Number(value) === 1}
            disabled={!editable}
            onChange={(checked) => updateRow(row.client_key, { require_remark: checked ? 1 : 0 })}
          />
        ),
      },
      {
        title: '修复方案必填',
        dataIndex: 'require_fix_solution',
        key: 'require_fix_solution',
        width: 114,
        render: (value, row) => (
          <Switch
            size="small"
            checked={Number(value) === 1}
            disabled={!editable}
            onChange={(checked) => updateRow(row.client_key, { require_fix_solution: checked ? 1 : 0 })}
          />
        ),
      },
      {
        title: '验证结果必填',
        dataIndex: 'require_verify_result',
        key: 'require_verify_result',
        width: 114,
        render: (value, row) => (
          <Switch
            size="small"
            checked={Number(value) === 1}
            disabled={!editable}
            onChange={(checked) => updateRow(row.client_key, { require_verify_result: checked ? 1 : 0 })}
          />
        ),
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        key: 'enabled',
        width: 82,
        render: (value, row) => (
          <Switch
            size="small"
            checked={Number(value) === 1}
            disabled={!editable}
            onChange={(checked) => updateRow(row.client_key, { enabled: checked ? 1 : 0 })}
          />
        ),
      },
      {
        title: '排序',
        dataIndex: 'sort_order',
        key: 'sort_order',
        width: 100,
        render: (value, row) => (
          <InputNumber
            size="small"
            min={0}
            step={10}
            precision={0}
            style={{ width: '100%' }}
            value={Number(value || 0)}
            disabled={!editable}
            onChange={(next) => updateRow(row.client_key, { sort_order: toSortOrder(next, 0) })}
          />
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 90,
        fixed: 'right',
        render: (_, row) =>
          editable ? (
            <Popconfirm
              title="确认删除这条规则？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => removeRow(row.client_key)}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          ) : (
            '-'
          ),
      },
    ],
    [editable, removeRow, statusOptions, updateRow],
  )

  return (
    <div className="bug-workflow-config-page">
      <Card
        className="bug-workflow-config-page__shell"
        variant="borderless"
        title="Bug流程配置中心"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadConfig}>
              刷新
            </Button>
            {editable ? (
              <>
                <Button icon={<PlusOutlined />} onClick={addRow}>
                  新增规则
                </Button>
                <Button onClick={resetToDefault}>恢复默认模板</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                  保存配置
                </Button>
              </>
            ) : null}
          </Space>
        )}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type={editable ? 'info' : 'warning'}
            showIcon
            title={editable ? '已进入可编辑模式' : '当前为只读模式'}
            description={(
              <Space size={8} wrap>
                <Text>动作执行接口固定为：`start / fix / verify / reopen / reject`。</Text>
                <Text>目标状态支持多选，保存时会自动拆分为多条规则。</Text>
              </Space>
            )}
          />

          <Space size={8} wrap>
            <Text type="secondary">可用状态：</Text>
            {statusRows.length > 0 ? (
              statusRows.map((item) => <Tag key={item.status_code}>{item.status_name}</Tag>)
            ) : (
              <Text type="secondary">未读取到状态字典，将按编码展示</Text>
            )}
          </Space>

          <Table
            size="small"
            rowKey="client_key"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1360 }}
            locale={{ emptyText: '暂无流程规则' }}
          />
        </Space>
      </Card>
    </div>
  )
}

export default BugWorkflowConfigPage
