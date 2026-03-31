import { Empty, Segmented, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'

const { Text } = Typography

const CHART_COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#c2410c']

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatValue(mode, value) {
  if (mode === 'tasks') return `${toNumber(value, 0)} 项`
  return `${toNumber(value, 0).toFixed(1)}h`
}

function WorkTypeDistributionChart({
  data = [],
  loading = false,
  valueMode,
  onValueModeChange,
}) {
  const [internalMode, setInternalMode] = useState('hours')
  const activeMode = valueMode || internalMode
  const setActiveMode = onValueModeChange || setInternalMode

  const chartRows = useMemo(() => {
    const rows = Array.isArray(data) ? data : []
    return rows
      .map((item) => {
        const actualHours = toNumber(item?.actual_hours, 0)
        const taskCount = toNumber(item?.task_count, 0)
        return {
          item_type_name: item?.item_type_name || '-',
          actual_hours: actualHours,
          task_count: taskCount,
          value: activeMode === 'tasks' ? taskCount : actualHours,
        }
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  }, [activeMode, data])

  const totalValue = useMemo(
    () => chartRows.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [chartRows],
  )
  const totalText = useMemo(() => formatValue(activeMode, totalValue), [activeMode, totalValue])

  const option = useMemo(() => {
    return {
      color: CHART_COLORS,
      animationDuration: 360,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'item',
        borderWidth: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        textStyle: {
          color: '#f8fafc',
        },
        formatter: (params) => {
          const row = params?.data || {}
          return `${row.name}<br/>${formatValue(activeMode, row.value)} · ${toNumber(params?.percent, 0).toFixed(1)}%`
        },
      },
      legend: {
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
        textStyle: {
          color: '#475467',
          fontSize: 12,
        },
      },
      graphic: [
        {
          type: 'text',
          left: '34%',
          top: '46%',
          silent: true,
          style: {
            text: '总计',
            fill: '#98a2b3',
            fontSize: 12,
            fontWeight: 500,
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          left: '34%',
          top: '53%',
          silent: true,
          style: {
            text: totalText,
            fill: '#0f172a',
            fontSize: 16,
            fontWeight: 700,
            textAlign: 'center',
          },
        },
      ],
      series: [
        {
          type: 'pie',
          radius: ['48%', '74%'],
          center: ['34%', '50%'],
          avoidLabelOverlap: true,
          minAngle: 4,
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: ({ percent }) => `${toNumber(percent, 0).toFixed(0)}%`,
            color: '#344054',
            fontSize: 12,
            fontWeight: 600,
          },
          labelLine: {
            length: 10,
            length2: 6,
            lineStyle: {
              color: '#cbd5e1',
            },
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
          },
          data: chartRows.map((item) => ({
            name: item.item_type_name,
            value: item.value,
            raw: item,
          })),
        },
      ],
    }
  }, [activeMode, chartRows, totalText])

  return (
    <div className="efficiency-distribution-card">
      <div className="efficiency-distribution-card__header">
        <div>
          <div className="efficiency-distribution-card__title">工作类型分布</div>
          <Text type="secondary" className="efficiency-distribution-card__subtitle">
            基于当前事项类型统计，支持工时与任务数量两种口径查看
          </Text>
        </div>
        <Segmented
          size="small"
          value={activeMode}
          onChange={setActiveMode}
          options={[
            { label: '工时占比', value: 'hours' },
            { label: '任务数量占比', value: 'tasks' },
          ]}
        />
      </div>

      {chartRows.length === 0 ? (
        <div className="efficiency-distribution-card__empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围暂无可展示的工作类型分布" />
        </div>
      ) : (
        <>
          <div className="efficiency-distribution-card__meta">
            <Space size={16} wrap>
              <span className="efficiency-distribution-card__meta-item">
                <span className="efficiency-distribution-card__meta-label">类型数</span>
                <span className="efficiency-distribution-card__meta-value">{chartRows.length}</span>
              </span>
              <span className="efficiency-distribution-card__meta-item">
                <span className="efficiency-distribution-card__meta-label">总计</span>
                <span className="efficiency-distribution-card__meta-value">{formatValue(activeMode, totalValue)}</span>
              </span>
            </Space>
          </div>
          <ReactECharts option={option} notMerge lazyUpdate showLoading={loading} style={{ height: 320 }} />
        </>
      )}
    </div>
  )
}

export default WorkTypeDistributionChart
