import { DownloadOutlined, EyeOutlined, QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Empty, Input, Modal, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDemandScoreResultDetailApi, getDemandScoreResultsApi, getDemandScoreTeamRankingApi } from '../../api/work'

const { RangePicker } = DatePicker
const { Text } = Typography

const ROLE_SCORE_TOOLTIPS = Object.freeze({
  avg_demand_owner_score: '需求负责人只评价“完成质量&完成时间”。标准权重 60%。',
  avg_direct_owner_score: '直属Owner只评价“结合职级、任务难度的表现分”。标准权重 15%。',
  avg_collaborator_score: '协作方只评价“协作表现分”。多人时先取平均分。标准权重 15%。',
  avg_project_manager_score: '项目管理只评价“项目流程表现分”。标准权重 10%。',
})

const MISSING_ROLE_TOOLTIP =
  '缺失评分身份表示该成员在当前需求下还有哪些应评身份尚未提交，不代表低分预警。'
const CONTRIBUTION_TOOLTIP =
  '占比=该评价人在当前被评价人最终结果中的实际权重占比；贡献=该评分按实际权重折算后，对最终得分的实际加分。'

const RANKING_SORT_FIELDS = Object.freeze([
  'avg_final_score',
  'avg_demand_owner_score',
  'avg_direct_owner_score',
  'avg_collaborator_score',
  'avg_project_manager_score',
])

function getDefaultRange() {
  const now = dayjs()
  return [now.startOf('month'), now.endOf('month')]
}

function getWeekRange(offset = 0) {
  const base = dayjs().startOf('day')
  const weekday = (base.day() + 6) % 7
  const weekStart = base.subtract(weekday, 'day').add(offset * 7, 'day')
  const weekEnd = weekStart.add(6, 'day')
  return [weekStart, weekEnd]
}

function isSameDayRange(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length < 2 || right.length < 2) return false
  const leftStart = dayjs(left[0])
  const leftEnd = dayjs(left[1])
  const rightStart = dayjs(right[0])
  const rightEnd = dayjs(right[1])
  if (!leftStart.isValid() || !leftEnd.isValid() || !rightStart.isValid() || !rightEnd.isValid()) return false
  return leftStart.isSame(rightStart, 'day') && leftEnd.isSame(rightEnd, 'day')
}

function formatScore(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : '-'
}

function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  const rounded = Math.round(num * 100) / 100
  const display = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/\.?0+$/, '')
  return `${display}%`
}

function renderWeightedTitle(label, tooltip) {
  return (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={tooltip}>
        <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', cursor: 'help' }} />
      </Tooltip>
    </Space>
  )
}

function toSortableNumber(value, fallback = Number.NEGATIVE_INFINITY) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function compareByOrder(leftValue, rightValue, order = 'descend') {
  const left = toSortableNumber(leftValue)
  const right = toSortableNumber(rightValue)
  if (left === right) return 0
  return order === 'ascend' ? left - right : right - left
}

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename, rows = []) {
  const content = rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

function renderCompletenessTag(record = {}) {
  const pendingSlotCount = Number(record?.pending_slot_count || 0)
  const pendingEvaluators = Array.isArray(record?.pending_evaluator_names) ? record.pending_evaluator_names : []
  if (pendingSlotCount > 0) {
    const tooltipText = pendingEvaluators.length > 0 ? `待评价：${pendingEvaluators.join('、')}` : '仍有成员待评价'
    return (
      <Tooltip title={tooltipText}>
        <Tag color="processing">评价中</Tag>
      </Tooltip>
    )
  }
  return <Tag color="success">完整</Tag>
}

function renderSubjectStatus(status, rowType = 'subject') {
  const normalized = String(status || '').trim().toUpperCase()
  if (rowType === 'slot') {
    if (normalized === 'SUBMITTED') return <Tag color="success">已提交</Tag>
    return <Tag color="warning">待提交</Tag>
  }
  if (normalized === 'COMPLETED') return <Tag color="success">已完成</Tag>
  if (normalized === 'PARTIAL') return <Tag color="processing">评价中</Tag>
  return <Tag color="warning">待评价</Tag>
}

function renderRoleScoreValue(record, fieldKey, roleKey) {
  if (record.row_type === 'slot') {
    return record.primary_role_key === roleKey ? formatScore(record.score) : '-'
  }
  return formatScore(record[fieldKey])
}

function DemandScoreResultsPage() {
  const [activeTab, setActiveTab] = useState('demands')
  const [range, setRange] = useState(getDefaultRange)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [rankingRows, setRankingRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailExpandedRowKeys, setDetailExpandedRowKeys] = useState([])
  const [demandSorter, setDemandSorter] = useState({ field: 'avg_final_score', order: null })
  const [rankingSorter, setRankingSorter] = useState({ field: 'avg_final_score', order: 'descend' })
  const thisWeekRange = useMemo(() => getWeekRange(0), [])
  const lastWeekRange = useMemo(() => getWeekRange(-1), [])
  const quickRangeKey = useMemo(() => {
    if (isSameDayRange(range, thisWeekRange)) return 'THIS_WEEK'
    if (isSameDayRange(range, lastWeekRange)) return 'LAST_WEEK'
    return ''
  }, [lastWeekRange, range, thisWeekRange])

  const dateParams = useMemo(() => ({
    start_date: range?.[0]?.format?.('YYYY-MM-DD'),
    end_date: range?.[1]?.format?.('YYYY-MM-DD'),
  }), [range])

  const loadDemands = useCallback(async ({ page = 1, pageSize = 20 } = {}) => {
    setLoading(true)
    try {
      const result = await getDemandScoreResultsApi({
        ...dateParams,
        keyword,
        page,
        pageSize,
      })
      if (!result?.success) {
        message.error(result?.message || '获取评分结果失败')
        return
      }
      const data = result.data || {}
      setRows(data.list || [])
      setPagination({
        current: data.page || page,
        pageSize: data.pageSize || pageSize,
        total: data.total || 0,
      })
    } catch (err) {
      message.error(err?.message || '获取评分结果失败')
    } finally {
      setLoading(false)
    }
  }, [dateParams, keyword])

  const loadRanking = useCallback(async () => {
    setRankingLoading(true)
    try {
      const result = await getDemandScoreTeamRankingApi(dateParams)
      if (!result?.success) {
        message.error(result?.message || '获取团队排行失败')
        return
      }
      setRankingRows(result.data || [])
    } catch (err) {
      message.error(err?.message || '获取团队排行失败')
    } finally {
      setRankingLoading(false)
    }
  }, [dateParams])

  const rankingSortConfig = useMemo(() => {
    const field = RANKING_SORT_FIELDS.includes(rankingSorter?.field) ? rankingSorter.field : 'avg_final_score'
    const order = rankingSorter?.order === 'ascend' || rankingSorter?.order === 'descend' ? rankingSorter.order : 'descend'
    return { field, order }
  }, [rankingSorter])

  const demandSortConfig = useMemo(() => {
    const field = demandSorter?.field === 'avg_final_score' ? 'avg_final_score' : 'avg_final_score'
    const order = demandSorter?.order === 'ascend' || demandSorter?.order === 'descend' ? demandSorter.order : null
    return { field, order }
  }, [demandSorter])

  useEffect(() => {
    if (activeTab === 'demands') {
      loadDemands({ page: 1 })
    } else {
      loadRanking()
    }
  }, [activeTab, loadDemands, loadRanking])

  const openDetail = async (record) => {
    setDetailOpen(true)
    setDetailExpandedRowKeys([])
    setDetail(null)
    setDetailLoading(true)
    try {
      const result = await getDemandScoreResultDetailApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '获取详情失败')
        return
      }
      setDetail(result.data || null)
    } catch (err) {
      message.error(err?.message || '获取详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const demandColumns = [
    {
      title: '需求',
      dataIndex: 'demand_name',
      key: 'demand_name',
      width: 360,
      render: (value, record) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value || '-'}</Text>
          <Text type="secondary">{record.demand_id}</Text>
        </Space>
      ),
    },
    {
      title: '被评价人数',
      dataIndex: 'subject_count',
      key: 'subject_count',
      width: 110,
    },
    {
      title: '综合得分',
      dataIndex: 'avg_final_score',
      key: 'avg_final_score',
      width: 110,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: demandSortConfig.field === 'avg_final_score' ? demandSortConfig.order : null,
      render: formatScore,
    },
    {
      title: renderWeightedTitle('需求负责人评分', ROLE_SCORE_TOOLTIPS.avg_demand_owner_score),
      dataIndex: 'avg_demand_owner_score',
      key: 'avg_demand_owner_score',
      width: 150,
      render: formatScore,
    },
    {
      title: renderWeightedTitle('直属Owner评分', ROLE_SCORE_TOOLTIPS.avg_direct_owner_score),
      dataIndex: 'avg_direct_owner_score',
      key: 'avg_direct_owner_score',
      width: 150,
      render: formatScore,
    },
    {
      title: renderWeightedTitle('协作方评分', ROLE_SCORE_TOOLTIPS.avg_collaborator_score),
      dataIndex: 'avg_collaborator_score',
      key: 'avg_collaborator_score',
      width: 140,
      render: formatScore,
    },
    {
      title: renderWeightedTitle('项目管理评分', ROLE_SCORE_TOOLTIPS.avg_project_manager_score),
      dataIndex: 'avg_project_manager_score',
      key: 'avg_project_manager_score',
      width: 150,
      render: formatScore,
    },
    {
      title: '完整性',
      key: 'completeness',
      width: 120,
      render: (_, record) => renderCompletenessTag(record),
    },
    {
      title: '完成时间',
      dataIndex: 'demand_completed_at',
      key: 'demand_completed_at',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button icon={<EyeOutlined />} onClick={() => openDetail(record)}>
          查看
        </Button>
      ),
    },
  ]

  const rankingColumns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (_, record) => (record.row_type === 'demand' ? '-' : record.rank),
    },
    {
      title: '成员 / 需求',
      key: 'evaluatee_or_demand',
      width: 320,
      render: (_, record) => {
        if (record.row_type === 'demand') {
          return (
            <Space orientation="vertical" size={2}>
              <Text>{record.demand_name || '-'}</Text>
              <Text type="secondary">{record.demand_id || '-'}</Text>
            </Space>
          )
        }
        return <Text strong>{record.evaluatee_name || '-'}</Text>
      },
    },
    {
      title: '预期上线时间',
      key: 'expected_release_date',
      width: 130,
      render: (_, record) => (record.row_type === 'demand' ? (record.expected_release_date || '-') : '-'),
    },
    {
      title: '需求数',
      dataIndex: 'demand_count',
      key: 'demand_count',
      width: 90,
      render: (_, record) => (record.row_type === 'demand' ? '-' : Number(record.demand_count || 0)),
    },
    {
      title: '综合得分',
      dataIndex: 'avg_final_score',
      key: 'avg_final_score',
      width: 110,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: rankingSortConfig.field === 'avg_final_score' ? rankingSortConfig.order : null,
      render: (_, record) => formatScore(record.row_type === 'demand' ? record.final_score : record.avg_final_score),
    },
    {
      title: renderWeightedTitle('需求负责人评分', ROLE_SCORE_TOOLTIPS.avg_demand_owner_score),
      dataIndex: 'avg_demand_owner_score',
      key: 'avg_demand_owner_score',
      width: 150,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: rankingSortConfig.field === 'avg_demand_owner_score' ? rankingSortConfig.order : null,
      render: (_, record) => formatScore(record.row_type === 'demand' ? record.demand_owner_score : record.avg_demand_owner_score),
    },
    {
      title: renderWeightedTitle('直属Owner评分', ROLE_SCORE_TOOLTIPS.avg_direct_owner_score),
      dataIndex: 'avg_direct_owner_score',
      key: 'avg_direct_owner_score',
      width: 150,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: rankingSortConfig.field === 'avg_direct_owner_score' ? rankingSortConfig.order : null,
      render: (_, record) => formatScore(record.row_type === 'demand' ? record.direct_owner_score : record.avg_direct_owner_score),
    },
    {
      title: renderWeightedTitle('协作方评分', ROLE_SCORE_TOOLTIPS.avg_collaborator_score),
      dataIndex: 'avg_collaborator_score',
      key: 'avg_collaborator_score',
      width: 140,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: rankingSortConfig.field === 'avg_collaborator_score' ? rankingSortConfig.order : null,
      render: (_, record) => formatScore(record.row_type === 'demand' ? record.collaborator_score : record.avg_collaborator_score),
    },
    {
      title: renderWeightedTitle('项目管理评分', ROLE_SCORE_TOOLTIPS.avg_project_manager_score),
      dataIndex: 'avg_project_manager_score',
      key: 'avg_project_manager_score',
      width: 150,
      sorter: true,
      sortDirections: ['descend', 'ascend'],
      sortOrder: rankingSortConfig.field === 'avg_project_manager_score' ? rankingSortConfig.order : null,
      render: (_, record) => formatScore(record.row_type === 'demand' ? record.project_manager_score : record.avg_project_manager_score),
    },
  ]

  const rankingTreeData = useMemo(() => {
    const childFieldMap = {
      avg_final_score: 'final_score',
      avg_demand_owner_score: 'demand_owner_score',
      avg_direct_owner_score: 'direct_owner_score',
      avg_collaborator_score: 'collaborator_score',
      avg_project_manager_score: 'project_manager_score',
    }
    const sortedMembers = [...(Array.isArray(rankingRows) ? rankingRows : [])].sort((left, right) => {
      const scoreCompare = compareByOrder(left?.[rankingSortConfig.field], right?.[rankingSortConfig.field], rankingSortConfig.order)
      if (scoreCompare !== 0) return scoreCompare
      const demandCountCompare = compareByOrder(left?.demand_count, right?.demand_count, 'descend')
      if (demandCountCompare !== 0) return demandCountCompare
      return compareByOrder(left?.evaluatee_user_id, right?.evaluatee_user_id, 'ascend')
    })
    return sortedMembers.map((row) => {
      const childField = childFieldMap[rankingSortConfig.field] || 'final_score'
      const sortedChildren = [...(Array.isArray(row.demand_records) ? row.demand_records : [])].sort((left, right) => {
        const scoreCompare = compareByOrder(left?.[childField], right?.[childField], rankingSortConfig.order)
        if (scoreCompare !== 0) return scoreCompare
        const dateCompare = compareByOrder(
          dayjs(left?.expected_release_date || left?.demand_date || '').valueOf(),
          dayjs(right?.expected_release_date || right?.demand_date || '').valueOf(),
          'descend',
        )
        if (dateCompare !== 0) return dateCompare
        return compareByOrder(left?.task_id, right?.task_id, 'descend')
      })

      return {
        ...row,
        key: `member-${row.evaluatee_user_id}`,
        row_type: 'member',
        children: sortedChildren.map((item) => ({
          ...item,
          key: `member-${row.evaluatee_user_id}-task-${item.task_id}`,
          row_type: 'demand',
        })),
      }
    })
  }, [rankingRows, rankingSortConfig])

  const handleRankingTableChange = useCallback((_, __, sorter) => {
    const normalizedSorter = Array.isArray(sorter) ? sorter[0] : sorter
    const nextField = String(normalizedSorter?.field || normalizedSorter?.columnKey || '')
    const nextOrder = normalizedSorter?.order
    if (RANKING_SORT_FIELDS.includes(nextField) && (nextOrder === 'ascend' || nextOrder === 'descend')) {
      setRankingSorter({ field: nextField, order: nextOrder })
      return
    }
    setRankingSorter({ field: 'avg_final_score', order: 'descend' })
  }, [])

  const sortedDemandRows = useMemo(() => {
    const sourceRows = Array.isArray(rows) ? rows : []
    if (!demandSortConfig.order) return sourceRows
    return [...sourceRows].sort((left, right) => {
      const scoreCompare = compareByOrder(left?.avg_final_score, right?.avg_final_score, demandSortConfig.order)
      if (scoreCompare !== 0) return scoreCompare
      const completedAtCompare = compareByOrder(
        dayjs(left?.demand_completed_at || '').valueOf(),
        dayjs(right?.demand_completed_at || '').valueOf(),
        'descend',
      )
      if (completedAtCompare !== 0) return completedAtCompare
      return String(left?.demand_id || '').localeCompare(String(right?.demand_id || ''), 'zh-CN')
    })
  }, [demandSortConfig.order, rows])

  const handleDemandTableChange = useCallback((nextPagination, _, sorter) => {
    const normalizedSorter = Array.isArray(sorter) ? sorter[0] : sorter
    const nextField = String(normalizedSorter?.field || normalizedSorter?.columnKey || '')
    const nextOrder = normalizedSorter?.order
    if (nextField === 'avg_final_score' && (nextOrder === 'ascend' || nextOrder === 'descend')) {
      setDemandSorter({ field: 'avg_final_score', order: nextOrder })
    } else if (nextField === 'avg_final_score') {
      setDemandSorter({ field: 'avg_final_score', order: null })
    }

    loadDemands({
      page: nextPagination.current,
      pageSize: nextPagination.pageSize,
    })
  }, [loadDemands])

  const handleExport = useCallback(() => {
    if (activeTab === 'demands') {
      if (!Array.isArray(rows) || rows.length === 0) {
        message.warning('当前没有可导出的需求评分结果')
        return
      }
      const exportRows = [
        ['需求ID', '需求名称', '被评价人数', '综合得分', '需求负责人评分', '直属Owner评分', '协作方评分', '项目管理评分', '完整性', '完成时间'],
        ...rows.map((item) => [
          item?.demand_id || '',
          item?.demand_name || '',
          Number(item?.subject_count || 0),
          formatScore(item?.avg_final_score),
          formatScore(item?.avg_demand_owner_score),
          formatScore(item?.avg_direct_owner_score),
          formatScore(item?.avg_collaborator_score),
          formatScore(item?.avg_project_manager_score),
          Number(item?.pending_slot_count || 0) > 0
            ? (() => {
                const pendingNames = (Array.isArray(item?.pending_evaluator_names) ? item.pending_evaluator_names : []).join('、')
                return pendingNames ? `评价中（待评价：${pendingNames}）` : '评价中'
              })()
            : '完整',
          item?.demand_completed_at || '',
        ]),
      ]
      downloadCsv(
        `需求评分结果-按需求查看-${dateParams.start_date || ''}-${dateParams.end_date || ''}-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
        exportRows,
      )
      message.success('导出成功')
      return
    }

    if (!Array.isArray(rankingTreeData) || rankingTreeData.length === 0) {
      message.warning('当前没有可导出的团队排行数据')
      return
    }

    const exportRows = [
      ['层级', '排名', '成员', '需求ID', '需求名称', '预期上线时间', '需求数', '综合得分', '需求负责人评分', '直属Owner评分', '协作方评分', '项目管理评分'],
    ]
    rankingTreeData.forEach((member) => {
      exportRows.push([
        '成员汇总',
        member?.rank ?? '',
        member?.evaluatee_name || '',
        '',
        '',
        '',
        Number(member?.demand_count || 0),
        formatScore(member?.avg_final_score),
        formatScore(member?.avg_demand_owner_score),
        formatScore(member?.avg_direct_owner_score),
        formatScore(member?.avg_collaborator_score),
        formatScore(member?.avg_project_manager_score),
      ])
      ;(Array.isArray(member?.children) ? member.children : []).forEach((item) => {
        exportRows.push([
          '需求明细',
          '',
          member?.evaluatee_name || '',
          item?.demand_id || '',
          item?.demand_name || '',
          item?.expected_release_date || '',
          '',
          formatScore(item?.final_score),
          formatScore(item?.demand_owner_score),
          formatScore(item?.direct_owner_score),
          formatScore(item?.collaborator_score),
          formatScore(item?.project_manager_score),
        ])
      })
    })

    downloadCsv(
      `需求评分结果-团队排行-${dateParams.start_date || ''}-${dateParams.end_date || ''}-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      exportRows,
    )
    message.success('导出成功')
  }, [activeTab, dateParams.end_date, dateParams.start_date, rankingTreeData, rows])

  const subjectMetaMap = useMemo(() => {
    const map = new Map()
    const subjects = Array.isArray(detail?.subjects) ? detail.subjects : []
    subjects.forEach((subject) => {
      const subjectId = Number(subject?.id || 0)
      if (!Number.isInteger(subjectId) || subjectId <= 0) return
      const slotRecords = Array.isArray(subject?.slot_records) ? subject.slot_records : []
      const collaboratorSlots = slotRecords.filter((slot) => String(slot?.primary_role_key || '').trim().toUpperCase() === 'COLLABORATOR')
      const submittedCollaboratorCount = collaboratorSlots.filter((slot) => String(slot?.status || '').trim().toUpperCase() === 'SUBMITTED').length
      map.set(subjectId, {
        effectiveWeight: Number(subject?.effective_weight || 0),
        collaboratorSlotCount: collaboratorSlots.length,
        submittedCollaboratorCount,
      })
    })
    return map
  }, [detail])

  const detailColumns = [
    {
      title: '被评价人 / 评价人',
      key: 'name',
      width: 280,
      render: (_, record) => {
        if (record.row_type === 'slot') {
          return (
            <Space size={6} wrap>
              <Text>{record.evaluator_name || `用户${record.evaluator_user_id || '-'}`}</Text>
              {(Array.isArray(record.role_labels) ? record.role_labels : []).map((label) => (
                <Tag key={`${record.key}-${label}`} color="blue">
                  {label}
                </Tag>
              ))}
            </Space>
          )
        }
        return <Text strong>{record.evaluatee_name || '-'}</Text>
      },
    },
    {
      title: '综合得分',
      key: 'final_score',
      width: 100,
      render: (_, record) => (record.row_type === 'slot' ? '-' : formatScore(record.final_score)),
    },
    {
      title: renderWeightedTitle('需求负责人评分', ROLE_SCORE_TOOLTIPS.avg_demand_owner_score),
      key: 'demand_owner_score',
      width: 140,
      render: (_, record) => renderRoleScoreValue(record, 'demand_owner_score', 'DEMAND_OWNER'),
    },
    {
      title: renderWeightedTitle('直属Owner评分', ROLE_SCORE_TOOLTIPS.avg_direct_owner_score),
      key: 'direct_owner_score',
      width: 140,
      render: (_, record) => renderRoleScoreValue(record, 'direct_owner_score', 'DIRECT_OWNER'),
    },
    {
      title: renderWeightedTitle('协作方评分', ROLE_SCORE_TOOLTIPS.avg_collaborator_score),
      key: 'collaborator_score',
      width: 130,
      render: (_, record) => renderRoleScoreValue(record, 'collaborator_score', 'COLLABORATOR'),
    },
    {
      title: renderWeightedTitle('项目管理评分', ROLE_SCORE_TOOLTIPS.avg_project_manager_score),
      key: 'project_manager_score',
      width: 140,
      render: (_, record) => renderRoleScoreValue(record, 'project_manager_score', 'PROJECT_MANAGER'),
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      render: (_, record) => renderSubjectStatus(record.status, record.row_type),
    },
    {
      title: (
        <Space size={4}>
          <span>贡献说明</span>
          <Tooltip title={CONTRIBUTION_TOOLTIP}>
            <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      key: 'contribution',
      width: 250,
      render: (_, record) => {
        if (record.row_type !== 'slot') return '-'

        const subjectId = Number(record.subject_id || 0)
        const subjectMeta = subjectMetaMap.get(subjectId) || {}
        const effectiveWeight = Number(subjectMeta.effectiveWeight || 0)
        const score = Number(record.score)
        const collaboratorSlotCount = Number(subjectMeta.collaboratorSlotCount || 0)
        const isCollaborator = String(record.primary_role_key || '').trim().toUpperCase() === 'COLLABORATOR'
        const baseWeight = Number(record.base_weight || 0)
        const actualWeight = isCollaborator
          ? (collaboratorSlotCount > 0 ? baseWeight / collaboratorSlotCount : 0)
          : baseWeight
        const canCompute =
          String(record.status || '').trim().toUpperCase() === 'SUBMITTED' &&
          Number.isFinite(score) &&
          actualWeight > 0 &&
          effectiveWeight > 0

        const shareText = canCompute ? `占比：${formatPercent((actualWeight / effectiveWeight) * 100)}` : '占比：待提交后计算'
        const contributionText = canCompute
          ? `贡献：+${formatScore((score * actualWeight) / effectiveWeight)} 分`
          : '贡献：待提交后计算'

        return (
          <Space orientation="vertical" size={0}>
            <Text>{shareText}</Text>
            <Text type="secondary">{contributionText}</Text>
          </Space>
        )
      },
    },
    {
      title: (
        <Space size={4}>
          <span>缺失评分身份</span>
          <Tooltip title={MISSING_ROLE_TOOLTIP}>
            <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      key: 'missing_role_labels',
      width: 220,
      render: (_, record) =>
        record.row_type === 'slot'
          ? '-'
          : (Array.isArray(record.missing_role_labels) && record.missing_role_labels.length > 0
            ? <Text style={{ whiteSpace: 'nowrap' }}>{record.missing_role_labels.join(' / ')}</Text>
            : '-'),
    },
  ]

  const detailTreeData = useMemo(
    () =>
      (Array.isArray(detail?.subjects) ? detail.subjects : []).map((subject) => ({
        ...subject,
        key: `subject-${subject.id}`,
        row_type: 'subject',
        children: (Array.isArray(subject.slot_records) ? subject.slot_records : []).map((slot) => ({
          ...slot,
          key: `slot-${slot.id}`,
          row_type: 'slot',
        })),
      })),
    [detail],
  )

  const toolbar = (
    <Card>
      <Space wrap>
        <Space.Compact>
          <Button type={quickRangeKey === 'THIS_WEEK' ? 'primary' : 'default'} onClick={() => setRange(getWeekRange(0))}>
            本周
          </Button>
          <Button type={quickRangeKey === 'LAST_WEEK' ? 'primary' : 'default'} onClick={() => setRange(getWeekRange(-1))}>
            上周
          </Button>
        </Space.Compact>
        <RangePicker value={range} onChange={(value) => setRange(value || getDefaultRange())} />
        {activeTab === 'demands' ? (
          <Input.Search
            allowClear
            value={keyword}
            placeholder="搜索需求 ID / 名称"
            style={{ width: 260 }}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={() => loadDemands({ page: 1 })}
          />
        ) : null}
        <Button
          icon={<ReloadOutlined />}
          loading={activeTab === 'demands' ? loading : rankingLoading}
          onClick={() => (activeTab === 'demands' ? loadDemands({ page: 1 }) : loadRanking())}
        >
          刷新
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          导出
        </Button>
      </Space>
    </Card>
  )

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {toolbar}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'demands',
              label: '按需求查看',
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={demandColumns}
                  dataSource={sortedDemandRows}
                  locale={{ emptyText: <Empty description="暂无评分结果" /> }}
                  pagination={pagination}
                  onChange={handleDemandTableChange}
                />
              ),
            },
            {
              key: 'ranking',
              label: '团队排行',
              children: (
                <Table
                  rowKey="key"
                  loading={rankingLoading}
                  columns={rankingColumns}
                  dataSource={rankingTreeData}
                  onChange={handleRankingTableChange}
                  expandable={{
                    rowExpandable: (record) => record.row_type === 'member' && Array.isArray(record.children) && record.children.length > 0,
                    defaultExpandAllRows: false,
                  }}
                  locale={{ emptyText: <Empty description="暂无团队评分排行" /> }}
                  pagination={false}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={detail?.task?.demand_name || '评分详情'}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false)
          setDetailExpandedRowKeys([])
        }}
        footer={
          <Button
            onClick={() => {
              setDetailOpen(false)
              setDetailExpandedRowKeys([])
            }}
          >
            关闭
          </Button>
        }
        width={1080}
      >
        <Table
          rowKey="key"
          loading={detailLoading}
          columns={detailColumns}
          dataSource={detailTreeData}
          expandable={{
            expandedRowKeys: detailExpandedRowKeys,
            onExpandedRowsChange: (expandedKeys) => setDetailExpandedRowKeys(Array.isArray(expandedKeys) ? expandedKeys : []),
          }}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无成员评分结果" /> }}
        />
      </Modal>
    </Space>
  )
}

export default DemandScoreResultsPage
