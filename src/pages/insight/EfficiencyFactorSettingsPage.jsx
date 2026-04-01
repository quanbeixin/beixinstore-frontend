import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEfficiencyFactorSettingsApi, updateEfficiencyFactorSettingsApi } from '../../api/work'
import { hasRole } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Paragraph, Text, Title } = Typography
const DEFAULT_NET_FORMULA_VARIABLE_OPTIONS = [
  { code: 'OWNER_HOURS', label: 'Owner预估总工时' },
  { code: 'PERSONAL_HOURS', label: '个人预估总工时' },
  { code: 'ACTUAL_HOURS', label: '实际总工时' },
  { code: 'TASK_DIFFICULTY_COEFF', label: '任务难度系数' },
  { code: 'JOB_LEVEL_COEFF', label: '职级权重系数' },
]
const DEFAULT_NET_FORMULA_OPERATOR_OPTIONS = [
  { code: 'ADD', label: '+' },
  { code: 'SUB', label: '-' },
  { code: 'MUL', label: '×' },
  { code: 'DIV', label: '÷' },
]
const DEFAULT_NET_FORMULA_EXPRESSION = ['ACTUAL_HOURS', 'MUL', 'TASK_DIFFICULTY_COEFF', 'DIV', 'JOB_LEVEL_COEFF']

function toDecimal2(value, fallback = 1) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Number(num.toFixed(2))
}

function normalizeFormulaExpression(expression = []) {
  const tokens = Array.isArray(expression)
    ? expression.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : []
  return tokens.length > 0 ? tokens : [...DEFAULT_NET_FORMULA_EXPRESSION]
}

function buildFormulaPreview(expression = [], variableOptions = [], operatorOptions = []) {
  const variableMap = new Map(
    (Array.isArray(variableOptions) && variableOptions.length > 0 ? variableOptions : DEFAULT_NET_FORMULA_VARIABLE_OPTIONS).map((item) => [
      item.code,
      item.label,
    ]),
  )
  const operatorMap = new Map(
    (Array.isArray(operatorOptions) && operatorOptions.length > 0 ? operatorOptions : DEFAULT_NET_FORMULA_OPERATOR_OPTIONS).map((item) => [
      item.code,
      item.label,
    ]),
  )
  return normalizeFormulaExpression(expression)
    .map((token, index) => (index % 2 === 0 ? variableMap.get(token) || token : operatorMap.get(token) || token))
    .join(' ')
}

function normalizeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((item) => ({
    factor_type: String(item?.factor_type || '').trim().toUpperCase(),
    item_code: String(item?.item_code || '').trim().toUpperCase(),
    item_name: String(item?.item_name || '').trim() || String(item?.item_code || '').trim().toUpperCase(),
    color: item?.color || null,
    coefficient: toDecimal2(item?.coefficient, 1),
    enabled: Number(item?.enabled) === 1 ? 1 : 0,
    remark: String(item?.remark || '').trim(),
    updated_at: item?.updated_at || null,
    updated_by_name: item?.updated_by_name || null,
    last_adjustment_record: item?.last_adjustment_record || '未调整',
    sort_order: Number(item?.sort_order || 0),
  }))
}

function EfficiencyFactorSettingsPage() {
  const canManage = hasRole('ADMIN') || hasRole('SUPER_ADMIN')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [jobLevelRows, setJobLevelRows] = useState([])
  const [taskDifficultyRows, setTaskDifficultyRows] = useState([])
  const [netFormulaState, setNetFormulaState] = useState({
    expression: [...DEFAULT_NET_FORMULA_EXPRESSION],
    variable_options: DEFAULT_NET_FORMULA_VARIABLE_OPTIONS,
    operator_options: DEFAULT_NET_FORMULA_OPERATOR_OPTIONS,
    updated_at: null,
    updated_by_name: null,
    last_adjustment_record: '未调整',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getEfficiencyFactorSettingsApi()
      if (!result?.success) {
        message.error(result?.message || '获取效能系数设置失败')
        return
      }
      setJobLevelRows(normalizeRows(result?.data?.job_level_weights || []))
      setTaskDifficultyRows(normalizeRows(result?.data?.task_difficulty_weights || []))
      setNetFormulaState({
        expression: normalizeFormulaExpression(result?.data?.net_efficiency_formula?.expression),
        variable_options:
          result?.data?.net_efficiency_formula?.variable_options?.length > 0
            ? result.data.net_efficiency_formula.variable_options
            : DEFAULT_NET_FORMULA_VARIABLE_OPTIONS,
        operator_options:
          result?.data?.net_efficiency_formula?.operator_options?.length > 0
            ? result.data.net_efficiency_formula.operator_options
            : DEFAULT_NET_FORMULA_OPERATOR_OPTIONS,
        updated_at: result?.data?.net_efficiency_formula?.updated_at || null,
        updated_by_name: result?.data?.net_efficiency_formula?.updated_by_name || null,
        last_adjustment_record: result?.data?.net_efficiency_formula?.last_adjustment_record || '未调整',
      })
    } catch (error) {
      message.error(error?.message || '获取效能系数设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const patchRow = useCallback((setter, itemCode, partial) => {
    setter((prev) =>
      prev.map((row) => {
        if (String(row.item_code) !== String(itemCode)) return row
        return { ...row, ...partial }
      }),
    )
  }, [])

  const unifiedColumns = useMemo(
    () => [
      {
        title: '编码',
        dataIndex: 'item_code',
        key: 'item_code',
        width: 120,
        render: (value, row) =>
          row?.color ? (
            <Tag color={row.color} style={{ marginInlineEnd: 0 }}>
              {value}
            </Tag>
          ) : (
            <Tag style={{ marginInlineEnd: 0 }}>{value}</Tag>
          ),
      },
      {
        title: '名称',
        dataIndex: 'item_name',
        key: 'item_name',
        width: 160,
        render: (value) => <Text strong>{value || '-'}</Text>,
      },
      {
        title: '系数',
        dataIndex: 'coefficient',
        key: 'coefficient',
        width: 140,
        render: (value, row, index, sectionKey) => {
          const setter = sectionKey === 'job' ? setJobLevelRows : setTaskDifficultyRows
          return (
            <InputNumber
              min={0}
              precision={2}
              step={0.1}
              value={toDecimal2(value, 1)}
              disabled={!canManage || saving}
              style={{ width: '100%' }}
              onChange={(next) => patchRow(setter, row.item_code, { coefficient: toDecimal2(next, 1) })}
            />
          )
        },
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        key: 'enabled',
        width: 110,
        render: (value, row, index, sectionKey) => {
          const setter = sectionKey === 'job' ? setJobLevelRows : setTaskDifficultyRows
          return (
            <Switch
              size="small"
              checked={Number(value) === 1}
              disabled={!canManage || saving}
              onChange={(checked) => patchRow(setter, row.item_code, { enabled: checked ? 1 : 0 })}
            />
          )
        },
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        render: (value, row, index, sectionKey) => {
          const setter = sectionKey === 'job' ? setJobLevelRows : setTaskDifficultyRows
          return (
            <Input
              value={value}
              disabled={!canManage || saving}
              maxLength={80}
              placeholder="可选备注"
              onChange={(event) => patchRow(setter, row.item_code, { remark: event?.target?.value || '' })}
            />
          )
        },
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 180,
        render: (value) => formatBeijingDateTime(value),
      },
      {
        title: '调整记录',
        dataIndex: 'last_adjustment_record',
        key: 'last_adjustment_record',
        width: 240,
        render: (value) => <Text type="secondary">{value || '未调整'}</Text>,
      },
    ],
    [canManage, patchRow, saving],
  )

  const jobColumns = useMemo(
    () =>
      unifiedColumns.map((column) =>
        ['coefficient', 'enabled', 'remark'].includes(column.key)
          ? {
              ...column,
              render: (value, row, index) => column.render(value, row, index, 'job'),
            }
          : column,
      ),
    [unifiedColumns],
  )

  const taskColumns = useMemo(
    () =>
      unifiedColumns.map((column) =>
        ['coefficient', 'enabled', 'remark'].includes(column.key)
          ? {
              ...column,
              render: (value, row, index) => column.render(value, row, index, 'task'),
            }
          : column,
      ),
    [unifiedColumns],
  )

  const formulaVariableOptions = useMemo(
    () => (netFormulaState.variable_options || []).map((item) => ({ value: item.code, label: item.label })),
    [netFormulaState.variable_options],
  )
  const formulaOperatorOptions = useMemo(
    () => (netFormulaState.operator_options || []).map((item) => ({ value: item.code, label: item.label })),
    [netFormulaState.operator_options],
  )
  const formulaPreviewText = useMemo(
    () => buildFormulaPreview(netFormulaState.expression, netFormulaState.variable_options, netFormulaState.operator_options),
    [netFormulaState.expression, netFormulaState.operator_options, netFormulaState.variable_options],
  )
  const formulaOperandCount = Math.max(1, Math.ceil(normalizeFormulaExpression(netFormulaState.expression).length / 2))

  const patchFormulaToken = useCallback((tokenIndex, nextValue) => {
    setNetFormulaState((prev) => {
      const nextExpression = normalizeFormulaExpression(prev.expression)
      nextExpression[tokenIndex] = String(nextValue || '').trim().toUpperCase()
      return { ...prev, expression: nextExpression }
    })
  }, [])

  const handleAddFormulaStep = useCallback(() => {
    setNetFormulaState((prev) => {
      const nextExpression = normalizeFormulaExpression(prev.expression)
      if (nextExpression.length >= 7) return prev
      const fallbackVariable = prev.variable_options?.[0]?.code || DEFAULT_NET_FORMULA_VARIABLE_OPTIONS[0].code
      return {
        ...prev,
        expression: [...nextExpression, 'MUL', fallbackVariable],
      }
    })
  }, [])

  const handleRemoveFormulaStep = useCallback(() => {
    setNetFormulaState((prev) => {
      const nextExpression = normalizeFormulaExpression(prev.expression)
      if (nextExpression.length <= 1) return prev
      return {
        ...prev,
        expression: nextExpression.slice(0, -2),
      }
    })
  }, [])

  const handleSaveAll = async () => {
    if (!canManage) {
      message.warning('当前账号无权维护效能系数')
      return
    }
    try {
      setSaving(true)
      const result = await updateEfficiencyFactorSettingsApi({
        job_level_weights: jobLevelRows.map((item) => ({
          item_code: item.item_code,
          coefficient: toDecimal2(item.coefficient, 1),
          enabled: Number(item.enabled) === 1 ? 1 : 0,
          remark: item.remark || '',
        })),
        task_difficulty_weights: taskDifficultyRows.map((item) => ({
          item_code: item.item_code,
          coefficient: toDecimal2(item.coefficient, 1),
          enabled: Number(item.enabled) === 1 ? 1 : 0,
          remark: item.remark || '',
        })),
        net_efficiency_formula: {
          expression: normalizeFormulaExpression(netFormulaState.expression),
        },
      })
      if (!result?.success) {
        message.error(result?.message || '保存效能系数设置失败')
        return
      }
      message.success('效能系数设置保存成功')
      setJobLevelRows(normalizeRows(result?.data?.job_level_weights || []))
      setTaskDifficultyRows(normalizeRows(result?.data?.task_difficulty_weights || []))
      setNetFormulaState({
        expression: normalizeFormulaExpression(result?.data?.net_efficiency_formula?.expression),
        variable_options:
          result?.data?.net_efficiency_formula?.variable_options?.length > 0
            ? result.data.net_efficiency_formula.variable_options
            : DEFAULT_NET_FORMULA_VARIABLE_OPTIONS,
        operator_options:
          result?.data?.net_efficiency_formula?.operator_options?.length > 0
            ? result.data.net_efficiency_formula.operator_options
            : DEFAULT_NET_FORMULA_OPERATOR_OPTIONS,
        updated_at: result?.data?.net_efficiency_formula?.updated_at || null,
        updated_by_name: result?.data?.net_efficiency_formula?.updated_by_name || null,
        last_adjustment_record: result?.data?.net_efficiency_formula?.last_adjustment_record || '未调整',
      })
    } catch (error) {
      message.error(error?.message || '保存效能系数设置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        style={{ marginBottom: 12, borderRadius: 14 }}
        extra={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
              刷新
            </Button>
            <Button
              type="primary"
              size="middle"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!canManage || loading}
              onClick={handleSaveAll}
            >
              保存全部
            </Button>
          </Space>
        }
      >
        <Space orientation="vertical" size={2}>
          <Tag color="blue" style={{ width: 'fit-content', marginInlineEnd: 0 }}>
            效能配置中心
          </Tag>
          <Title level={4} style={{ margin: 0 }}>
            效能系数设置
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            当前版本支持维护三类配置：职级权重系数、任务难度系数、净效率公式。保存后将同步影响排行页与详情页的净效率口径。
          </Paragraph>
          {!canManage ? (
            <Text type="secondary">当前账号仅可查看，修改需 `ADMIN` 或 `SUPER_ADMIN` 角色。</Text>
          ) : null}
        </Space>
      </Card>

      <Card
        variant="borderless"
        title="净效率公式配置"
        style={{ marginBottom: 12, borderRadius: 14 }}
        styles={{ body: { padding: '12px 16px 16px 16px' } }}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            title="净效率值由后端统一计算。这里保存后，部门人效排行、部门详情、个人人效详情会自动按同一公式生效。"
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {Array.from({ length: formulaOperandCount }).map((_, operandIndex) => {
              const variableTokenIndex = operandIndex * 2
              const operatorTokenIndex = variableTokenIndex - 1
              return (
                <Space key={`formula-token-${operandIndex}`} size={8} wrap>
                  {operandIndex > 0 ? (
                    <Select
                      style={{ width: 96 }}
                      value={normalizeFormulaExpression(netFormulaState.expression)[operatorTokenIndex]}
                      options={formulaOperatorOptions}
                      disabled={!canManage || saving}
                      onChange={(value) => patchFormulaToken(operatorTokenIndex, value)}
                    />
                  ) : null}
                  <Select
                    style={{ width: 180 }}
                    value={normalizeFormulaExpression(netFormulaState.expression)[variableTokenIndex]}
                    options={formulaVariableOptions}
                    disabled={!canManage || saving}
                    onChange={(value) => patchFormulaToken(variableTokenIndex, value)}
                  />
                </Space>
              )
            })}
            <Button onClick={handleAddFormulaStep} disabled={!canManage || saving || normalizeFormulaExpression(netFormulaState.expression).length >= 7}>
              新增一步
            </Button>
            <Button onClick={handleRemoveFormulaStep} disabled={!canManage || saving || normalizeFormulaExpression(netFormulaState.expression).length <= 1}>
              删除最后一步
            </Button>
          </div>
          <div>
            <Text type="secondary">公式预览：</Text>
            <Text strong>{formulaPreviewText}</Text>
          </div>
          <div>
            <Text type="secondary">最近调整：</Text>
            <Text>{netFormulaState.last_adjustment_record || '未调整'}</Text>
            {netFormulaState.updated_at ? <Text type="secondary">{`（${formatBeijingDateTime(netFormulaState.updated_at)}）`}</Text> : null}
          </div>
        </Space>
      </Card>

      <Card
        variant="borderless"
        title="职级权重系数"
        style={{ marginBottom: 12, borderRadius: 14 }}
        styles={{ body: { padding: '8px 16px 12px 16px' } }}
      >
        <Table
          rowKey="item_code"
          loading={loading}
          dataSource={jobLevelRows}
          columns={jobColumns}
          pagination={false}
          size="small"
          scroll={{ x: 980 }}
          locale={{ emptyText: '暂无职级字典项可配置' }}
        />
      </Card>

      <Card
        variant="borderless"
        title="任务难度系数"
        style={{ borderRadius: 14 }}
        styles={{ body: { padding: '8px 16px 12px 16px' } }}
      >
        <Table
          rowKey="item_code"
          loading={loading}
          dataSource={taskDifficultyRows}
          columns={taskColumns}
          pagination={false}
          size="small"
          scroll={{ x: 980 }}
          locale={{ emptyText: '暂无任务难度字典项可配置' }}
        />
      </Card>
    </div>
  )
}

export default EfficiencyFactorSettingsPage
