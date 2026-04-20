import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Card, Col, DatePicker, Empty, Row, Select, Spin, Statistic } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getAllFeedbackApi } from '../../api/feedback'
import './FeedbackDashboardPage.css'

const { RangePicker } = DatePicker
const CATEGORY_COLORS = [
  '#2f80ed',
  '#14b8a6',
  '#f2994a',
  '#bb6bd9',
  '#6f6ceb',
  '#7cb518',
  '#56ccf2',
  '#eb5757',
  '#f2c94c',
  '#2d9cdb',
  '#27ae60',
  '#9b51e0',
]

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return '0.0%'
  return `${Number(value).toFixed(1)}%`
}

function getPrimaryCategory(record) {
  return String(record?.ai_primary_category || record?.ai_category || '').trim()
}

function FeedbackDashboardPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(30, 'day').startOf('day'),
    dayjs().endOf('day'),
  ])
  const [selectedProduct, setSelectedProduct] = useState('all')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAllFeedbackApi()
      const list = Array.isArray(result?.data) ? result.data : []
      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const filteredRows = useMemo(() => {
    return (rows || []).filter((item) => {
      const itemDate = dayjs(item?.date)
      const rangeStart = dateRange?.[0]
      const rangeEnd = dateRange?.[1]

      const inRange =
        !rangeStart ||
        !rangeEnd ||
        (itemDate.isValid() &&
          (itemDate.isAfter(rangeStart) || itemDate.isSame(rangeStart)) &&
          (itemDate.isBefore(rangeEnd) || itemDate.isSame(rangeEnd)))

      const matchProduct = selectedProduct === 'all' || item?.product === selectedProduct
      return inRange && matchProduct
    })
  }, [rows, dateRange, selectedProduct])

  const stats = useMemo(() => {
    const total = filteredRows.length
    const processed = filteredRows.filter((item) => item.status === 'processed').length
    const pending = filteredRows.filter((item) => item.status === 'pending').length
    const aiProcessed = filteredRows.filter((item) => item.ai_processed).length

    return { total, processed, pending, aiProcessed }
  }, [filteredRows])

  const categoryRows = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = getPrimaryCategory(item) || '未分类'
      map[key] = (map[key] || 0) + 1
    })

    const total = filteredRows.length || 1
    return Object.keys(map)
      .map((key) => ({
        category: key,
        count: map[key],
        percentage: (map[key] / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)
  }, [filteredRows])

  const categoryListRows = useMemo(() => categoryRows, [categoryRows])
  const categoryPieRows = useMemo(() => categoryRows.slice(0, 10), [categoryRows])

  const channelData = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.channel || '未知'
      map[key] = (map[key] || 0) + 1
    })

    return Object.keys(map)
      .map((key) => ({ name: key, value: map[key] }))
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  }, [filteredRows])

  const productData = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.product || '未指定'
      map[key] = (map[key] || 0) + 1
    })

    return Object.keys(map)
      .map((key) => ({ name: key, value: map[key] }))
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  }, [filteredRows])

  const categoryPieOption = useMemo(
    () => ({
      tooltip: { trigger: 'item' },
      color: CATEGORY_COLORS,
      series: [
        {
          name: '分类占比',
          type: 'pie',
          radius: ['54%', '74%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}: {d}%',
            color: '#6b7280',
            fontSize: 12,
          },
          labelLine: {
            show: true,
            length: 12,
            length2: 10,
            lineStyle: {
              color: '#b6bfcc',
              width: 1,
            },
          },
          data: categoryPieRows.map((item) => ({
            name: item.category,
            value: item.count,
          })),
        },
      ],
    }),
    [categoryPieRows],
  )

  const channelBarOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: channelData.map((item) => item.name),
        axisLabel: { interval: 0, rotate: 0, color: '#8a94a6', fontSize: 12 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e7ecf4' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9aa4b3' },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      series: [
        {
          type: 'bar',
          data: channelData.map((item) => item.value),
          itemStyle: {
            color: '#2f80ed',
            borderRadius: [6, 6, 0, 0],
          },
          label: {
            show: true,
            position: 'insideTop',
            color: '#1f4f93',
            fontSize: 11,
          },
          barMaxWidth: 36,
        },
      ],
      grid: { left: 28, right: 16, bottom: 22, top: 24, containLabel: true },
    }),
    [channelData],
  )

  const productBarOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: productData.map((item) => item.name),
        axisLabel: { interval: 0, rotate: 0, color: '#8a94a6', fontSize: 12 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e7ecf4' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9aa4b3' },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      series: [
        {
          type: 'bar',
          data: productData.map((item) => item.value),
          itemStyle: {
            color: '#2f80ed',
            borderRadius: [6, 6, 0, 0],
          },
          label: {
            show: true,
            position: 'insideTop',
            color: '#1f4f93',
            fontSize: 11,
          },
          barMaxWidth: 36,
        },
      ],
      grid: { left: 28, right: 16, bottom: 22, top: 24, containLabel: true },
    }),
    [productData],
  )

  const productOptions = useMemo(
    () => ['all'].concat([...new Set((rows || []).map((item) => item.product).filter(Boolean))]),
    [rows],
  )

  const hasCategoryData = categoryRows.length > 0
  const hasChannelData = channelData.length > 0
  const hasProductData = productData.length > 0

  return (
    <div className="feedback-dashboard-page">
      <Card className="feedback-dashboard-filter-card" variant="borderless">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <RangePicker
              className="feedback-dashboard-range"
              value={dateRange}
              format="YYYY-MM-DD"
              onChange={(value) => setDateRange(value)}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              className="feedback-dashboard-product-select"
              value={selectedProduct}
              onChange={setSelectedProduct}
              options={productOptions.map((item) => ({
                label: item === 'all' ? '全部产品' : item,
                value: item,
              }))}
            />
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        <Row gutter={[12, 12]} className="feedback-dashboard-stats-row">
          <Col xs={24} sm={12} lg={6}>
            <Card className="feedback-dashboard-stat-card" variant="borderless">
              <Statistic
                title="反馈总数"
                value={stats.total}
                prefix={<MessageOutlined />}
                styles={{ content: { color: '#101827' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="feedback-dashboard-stat-card" variant="borderless">
              <Statistic
                title="已处理"
                value={stats.processed}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: '#101827' } }}
                suffix={`/ ${stats.total}`}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="feedback-dashboard-stat-card" variant="borderless">
              <Statistic
                title="待处理"
                value={stats.pending}
                prefix={<ClockCircleOutlined />}
                styles={{ content: { color: '#101827' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="feedback-dashboard-stat-card" variant="borderless">
              <Statistic
                title="AI 已分析"
                value={stats.aiProcessed}
                prefix={<UserOutlined />}
                styles={{ content: { color: '#101827' } }}
                suffix={`/ ${stats.total}`}
              />
            </Card>
          </Col>
        </Row>

        <Card title="问题类型占比" className="feedback-dashboard-category-card" variant="borderless">
          {hasCategoryData ? (
            <Row gutter={[12, 12]}>
              <Col xs={24} xl={10}>
                <div className="feedback-dashboard-category-list">
                  {categoryListRows.map((item, index) => (
                    <div
                      key={item.category}
                      className="feedback-dashboard-category-list-item"
                      style={{ '--item-color': CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    >
                      <div className="feedback-dashboard-category-list-label">
                        <span className="feedback-dashboard-category-dot" />
                        <span className="feedback-dashboard-category-name">{item.category}</span>
                      </div>
                      <div className="feedback-dashboard-category-list-meta">
                        <span className="feedback-dashboard-category-count">{item.count}</span>
                        <span className="feedback-dashboard-category-percent">
                          {formatPercent(item.percentage)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
              <Col xs={24} xl={14}>
                <div className="feedback-dashboard-category-chart-wrap">
                  <ReactECharts option={categoryPieOption} style={{ height: 330 }} notMerge lazyUpdate />
                </div>
              </Col>
            </Row>
          ) : (
            <div className="feedback-dashboard-empty-wrap">
              <Empty description="暂无分类数据" />
            </div>
          )}
        </Card>

        <Row gutter={[12, 12]} className="feedback-dashboard-bottom-row">
          <Col xs={24} lg={12}>
            <Card title="反馈渠道分布" className="feedback-dashboard-chart-card" variant="borderless">
              {hasChannelData ? (
                <ReactECharts option={channelBarOption} style={{ height: 260 }} notMerge lazyUpdate />
              ) : (
                <div className="feedback-dashboard-empty-wrap">
                  <Empty description="暂无渠道数据" />
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="用户反馈量分布" className="feedback-dashboard-chart-card" variant="borderless">
              {hasProductData ? (
                <ReactECharts option={productBarOption} style={{ height: 260 }} notMerge lazyUpdate />
              ) : (
                <div className="feedback-dashboard-empty-wrap">
                  <Empty description="暂无产品数据" />
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default FeedbackDashboardPage
