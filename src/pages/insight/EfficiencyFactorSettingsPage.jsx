import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Input, InputNumber, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEfficiencyFactorSettingsApi, updateEfficiencyFactorSettingsApi } from '../../api/work'
import { hasRole } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Paragraph, Text, Title } = Typography

function toDecimal2(value, fallback = 1) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Number(num.toFixed(2))
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
      })
      if (!result?.success) {
        message.error(result?.message || '保存效能系数设置失败')
        return
      }
      message.success('效能系数设置保存成功')
      setJobLevelRows(normalizeRows(result?.data?.job_level_weights || []))
      setTaskDifficultyRows(normalizeRows(result?.data?.task_difficulty_weights || []))
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
            当前版本支持维护两组映射：职级权重系数、任务难度系数。保存后即时生效于配置层，不影响既有统计口径。
          </Paragraph>
          {!canManage ? (
            <Text type="secondary">当前账号仅可查看，修改需 `ADMIN` 或 `SUPER_ADMIN` 角色。</Text>
          ) : null}
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
