import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Card, Col, DatePicker, Row, Select, Spin, Statistic, Table } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getAllFeedbackApi } from '../../api/feedback'

const { RangePicker } = DatePicker

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

  const categoryTableData = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.ai_category || '未分类'
      map[key] = (map[key] || 0) + 1
    })

    const total = filteredRows.length || 1
    return Object.keys(map)
      .map((key) => ({
        category: key,
        count: map[key],
        percentage: ((map[key] / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count)
  }, [filteredRows])

  const channelData = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.channel || '未知'
      map[key] = (map[key] || 0) + 1
    })

    return Object.keys(map).map((key) => ({ name: key, value: map[key] }))
  }, [filteredRows])

  const productData = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.product || '未指定'
      map[key] = (map[key] || 0) + 1
    })

    return Object.keys(map).map((key) => ({ name: key, value: map[key] }))
  }, [filteredRows])

  const categoryPieOption = useMemo(
    () => ({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 8, top: 'middle' },
      series: [
        {
          name: '分类占比',
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['62%', '50%'],
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            formatter: '{b}: {d}%',
          },
          data: categoryTableData.map((item) => ({
            name: item.category,
            value: item.count,
          })),
        },
      ],
    }),
    [categoryTableData],
  )

  const channelBarOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: channelData.map((item) => item.name),
        axisLabel: { interval: 0, rotate: 20 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: channelData.map((item) => item.value),
          itemStyle: { color: '#1677ff' },
          barMaxWidth: 36,
        },
      ],
      grid: { left: 36, right: 18, bottom: 40, top: 30 },
    }),
    [channelData],
  )

  const productBarOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: productData.map((item) => item.name),
        axisLabel: { interval: 0, rotate: 20 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: productData.map((item) => item.value),
          itemStyle: { color: '#52c41a' },
          barMaxWidth: 36,
        },
      ],
      grid: { left: 36, right: 18, bottom: 40, top: 30 },
    }),
    [productData],
  )

  const productStatsRows = useMemo(() => {
    const map = {}
    filteredRows.forEach((item) => {
      const key = item?.product || '未指定'
      if (!map[key]) {
        map[key] = { product: key, total: 0, processed: 0, pending: 0 }
      }
      map[key].total += 1
      if (item.status === 'processed') {
        map[key].processed += 1
      } else {
        map[key].pending += 1
      }
    })

    return Object.values(map).map((item) => ({
      ...item,
      processRate: item.total > 0 ? `${((item.processed / item.total) * 100).toFixed(1)}%` : '0%',
    }))
  }, [filteredRows])

  const productOptions = useMemo(
    () => ['all'].concat([...new Set((rows || []).map((item) => item.product).filter(Boolean))]),
    [rows],
  )

  return (
    <div style={{ padding: 12 }}>
      <Card style={{ marginBottom: 12 }}>
        <Row gutter={12}>
          <Col xs={24} md={10}>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              format="YYYY-MM-DD"
              onChange={(value) => setDateRange(value)}
            />
          </Col>
          <Col xs={24} md={8}>
            <Select
              style={{ width: '100%' }}
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
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="反馈总数"
                value={stats.total}
                prefix={<MessageOutlined />}
                styles={{ content: { color: '#1677ff' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="已处理"
                value={stats.processed}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: '#52c41a' } }}
                suffix={`/ ${stats.total}`}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="待处理"
                value={stats.pending}
                prefix={<ClockCircleOutlined />}
                styles={{ content: { color: '#faad14' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="AI 已分析"
                value={stats.aiProcessed}
                prefix={<UserOutlined />}
                styles={{ content: { color: '#722ed1' } }}
                suffix={`/ ${stats.total}`}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} lg={14}>
            <Card title="问题类型占比" style={{ height: 420 }}>
              <ReactECharts option={categoryPieOption} style={{ height: 340 }} notMerge lazyUpdate />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="分类明细" style={{ height: 420 }}>
              <Table
                size="small"
                rowKey="category"
                pagination={false}
                dataSource={categoryTableData}
                columns={[
                  { title: '分类', dataIndex: 'category', key: 'category' },
                  { title: '数量', dataIndex: 'count', key: 'count', width: 80 },
                  {
                    title: '占比',
                    dataIndex: 'percentage',
                    key: 'percentage',
                    width: 80,
                    render: (value) => `${value}%`,
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={24} lg={12}>
            <Card title="反馈渠道分布" style={{ height: 360 }}>
              <ReactECharts option={channelBarOption} style={{ height: 280 }} notMerge lazyUpdate />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="用户反馈量分布" style={{ height: 360 }}>
              <ReactECharts option={productBarOption} style={{ height: 280 }} notMerge lazyUpdate />
            </Card>
          </Col>
        </Row>

        <Card title="产品处理情况">
          <Table
            rowKey="product"
            size="small"
            pagination={false}
            dataSource={productStatsRows}
            columns={[
              { title: '产品', dataIndex: 'product', key: 'product' },
              { title: '总数', dataIndex: 'total', key: 'total', width: 80 },
              { title: '已处理', dataIndex: 'processed', key: 'processed', width: 90 },
              { title: '待处理', dataIndex: 'pending', key: 'pending', width: 90 },
              { title: '处理率', dataIndex: 'processRate', key: 'processRate', width: 90 },
            ]}
          />
        </Card>
      </Spin>
    </div>
  )
}

export default FeedbackDashboardPage
