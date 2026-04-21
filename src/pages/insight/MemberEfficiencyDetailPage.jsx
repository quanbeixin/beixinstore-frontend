import {
  DownloadOutlined,
  EditOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Modal,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getMemberEfficiencyDetailApi, updateWorkLogOwnerEstimateApi } from '../../api/work'
import { getAccessSnapshot, hasPermission } from '../../utils/access'
import { formatBeijingDate } from '../../utils/datetime'
import WorkTypeDistributionChart from './components/WorkTypeDistributionChart'
import './EfficiencyDetailPages.css'

const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_NET_EFFICIENCY_FORMULA_EXPRESSION = [
  'OWNER_BASELINE_HOURS',
  'SUB',
  'OWNER_COMPARABLE_ACTUAL_HOURS',
  'MUL',
  'TASK_DIFFICULTY_COEFF',
  'DIV',
  'JOB_LEVEL_COEFF',
]
const NET_EFFICIENCY_OPERATORS = {
  ADD: 'ADD',
  SUB: 'SUB',
  MUL: 'MUL',
  DIV: 'DIV',
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatNetEfficiencyValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toFixed(2)
}

function getNetEfficiencyTextColor(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '#344054'
  if (num > 0) return '#039855'
  if (num < 0) return '#d92d20'
  return '#344054'
}

function formatHours(value) {
  return toNumber(value, 0).toFixed(1)
}

function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${num.toFixed(2)}%`
}

function getVarianceTextColor(value, mode = 'owner') {
  if (mode === 'personal') return '#344054'
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '#344054'
  const palette = {
    severePositive: '#d92d20',
    mildPositive: '#f04438',
    neutral: '#344054',
    mildNegative: '#039855',
    severeNegative: '#0f766e',
  }
  if (num > 4) return palette.severePositive
  if (num > 1) return palette.mildPositive
  if (num >= -1) return palette.neutral
  if (num >= -4) return palette.mildNegative
  return palette.severeNegative
}

function getComparableTagColor(covered, required) {
  const coveredCount = toNumber(covered, 0)
  const requiredCount = toNumber(required, 0)
  if (requiredCount <= 0) return 'default'
  const rate = coveredCount / requiredCount
  if (rate >= 1) return 'success'
  if (rate >= 0.5) return 'warning'
  return 'error'
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function getDefaultDateRange() {
  return [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')]
}

function toDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = dayjs(text, 'YYYY-MM-DD', true)
  return parsed.isValid() ? parsed : null
}

function buildDemandFollowUpTaskLabel(item) {
  const description = String(item?.description || '').trim()
  const demandName = String(item?.demand_name || item?.demand_id || '').trim()
  const phaseName = String(item?.phase_name || item?.phase_key || '').trim()

  if (description) return description
  if (demandName && phaseName) return `${demandName} / ${phaseName}`
  if (demandName) return demandName
  if (phaseName) return phaseName
  return '未命名任务'
}

function normalizeNetEfficiencyExpression(expression = []) {
  const tokens = Array.isArray(expression)
    ? expression.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : []
  return tokens.length >= 3 && tokens.length % 2 === 1 ? tokens : [...DEFAULT_NET_EFFICIENCY_FORMULA_EXPRESSION]
}

function evaluateNetEfficiencyValue(expression, context = {}) {
  const tokens = normalizeNetEfficiencyExpression(expression)
  const resolveValue = (token) => {
    const value = Number(context?.[token] || 0)
    return Number.isFinite(value) ? value : 0
  }

  let result = resolveValue(tokens[0])
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index]
    const rightValue = resolveValue(tokens[index + 1])
    if (operator === NET_EFFICIENCY_OPERATORS.ADD) result += rightValue
    if (operator === NET_EFFICIENCY_OPERATORS.SUB) result -= rightValue
    if (operator === NET_EFFICIENCY_OPERATORS.MUL) result *= rightValue
    if (operator === NET_EFFICIENCY_OPERATORS.DIV) {
      if (rightValue === 0) return null
      result /= rightValue
    }
  }
  return Number.isFinite(result) ? Number(result.toFixed(2)) : null
}

function calcWeightedCoefficient(rows = [], coefficientKey, hoursKey = 'actual_hours') {
  const weighted = (Array.isArray(rows) ? rows : []).reduce(
    (acc, item) => {
      const hours = toNumber(item?.[hoursKey], 0)
      const coefficient = toNumber(item?.[coefficientKey], 0)
      if (hours <= 0 || coefficient <= 0) return acc
      acc.totalHours += hours
      acc.totalValue += hours * coefficient
      return acc
    },
    { totalHours: 0, totalValue: 0 },
  )
  if (weighted.totalHours <= 0) return 1
  return Number((weighted.totalValue / weighted.totalHours).toFixed(4))
}

function buildNetEfficiencyContext({
  totalOwnerEstimateHours = 0,
  totalPersonalEstimateHours = 0,
  totalActualHours = 0,
  totalOwnerBaselineHours = 0,
  totalOwnerComparableActualHours = 0,
  taskDifficultyCoefficient = 1,
  jobLevelWeightCoefficient = 1,
} = {}) {
  return {
    OWNER_HOURS: toNumber(totalOwnerEstimateHours, 0),
    PERSONAL_HOURS: toNumber(totalPersonalEstimateHours, 0),
    ACTUAL_HOURS: toNumber(totalActualHours, 0),
    OWNER_BASELINE_HOURS: toNumber(totalOwnerBaselineHours, 0),
    OWNER_COMPARABLE_ACTUAL_HOURS: toNumber(totalOwnerComparableActualHours, 0),
    TASK_DIFFICULTY_COEFF: toNumber(taskDifficultyCoefficient, 1) || 1,
    JOB_LEVEL_COEFF: toNumber(jobLevelWeightCoefficient, 1) || 1,
  }
}

function downloadCsv(filename, rows = []) {
  const content = rows.map((columns) => columns.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function getLogStatusTag(status) {
  if (status === 'DONE') return <Tag color="success">已完成</Tag>
  if (status === 'TODO') return <Tag color="default">待开始</Tag>
  return <Tag color="processing">进行中</Tag>
}

function MemberEfficiencyDetailPage() {
  const navigate = useNavigate()
  const { userId: routeUserId } = useParams()
  const [searchParams] = useSearchParams()
  const [ownerEstimateForm] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [savingOwnerEstimate, setSavingOwnerEstimate] = useState(false)
  const [userId, setUserId] = useState()
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [ownerEstimateModal, setOwnerEstimateModal] = useState({
    open: false,
    item: null,
  })
  const [data, setData] = useState({
    summary: {
      username: '-',
      department_name: '-',
      job_level_name: '-',
      filled_days: 0,
      total_item_count: 0,
      total_owner_required_item_count: 0,
      total_owner_estimate_covered_item_count: 0,
      total_owner_estimate_missing_item_count: 0,
      total_owner_estimate_non_owner_item_count: 0,
      owner_estimate_coverage_rate: 0,
      total_raw_owner_estimate_hours: 0,
      total_owner_baseline_hours: 0,
      total_owner_comparable_actual_hours: 0,
      variance_owner_baseline_hours: 0,
      total_personal_estimate_item_count: 0,
      personal_estimate_coverage_rate: 0,
      total_owner_estimate_hours: 0,
      total_personal_estimate_hours: 0,
      total_actual_hours: 0,
      avg_actual_hours_per_day: 0,
      net_efficiency_formula_expression: [...DEFAULT_NET_EFFICIENCY_FORMULA_EXPRESSION],
      net_efficiency_formula_text: '',
    },
    work_type_distribution: [],
    demand_summary_list: [],
    work_item_list: [],
    trend: [],
    phase_distribution: [],
  })
  const access = useMemo(() => getAccessSnapshot() || {}, [])
  const canEditOwnerEstimate = hasPermission('workbench.view.owner') || Boolean(access?.is_super_admin)

  useEffect(() => {
    const startDate = toDateValue(searchParams.get('start_date'))
    const endDate = toDateValue(searchParams.get('end_date'))
    setDateRange(startDate && endDate && !startDate.isAfter(endDate) ? [startDate, endDate] : getDefaultDateRange())
    setUserId(toPositiveInt(routeUserId) || undefined)
  }, [routeUserId, searchParams])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const result = await getMemberEfficiencyDetailApi({
        user_id: userId,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
        end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
      })
      if (!result?.success) {
        message.error(result?.message || '获取个人人效详情失败')
        return
      }
      setData(result.data || {})
    } catch (error) {
      message.error(error?.message || '获取个人人效详情失败')
    } finally {
      setLoading(false)
    }
  }, [dateRange, userId])

  useEffect(() => {
    if (!userId) return
    loadData()
  }, [loadData, userId])

  const navigateWithState = useCallback(
    (nextRange = dateRange) => {
      if (!userId) return
      const params = new URLSearchParams()
      if (nextRange?.[0]) params.set('start_date', nextRange[0].format('YYYY-MM-DD'))
      if (nextRange?.[1]) params.set('end_date', nextRange[1].format('YYYY-MM-DD'))
      navigate(`/efficiency/member/${userId}/detail?${params.toString()}`)
    },
    [dateRange, navigate, userId],
  )

  const summary = data.summary || {}
  const workItemList = useMemo(
    () => (Array.isArray(data.work_item_list) ? data.work_item_list : []),
    [data.work_item_list],
  )
  const phaseDistribution = useMemo(
    () => (Array.isArray(data.phase_distribution) ? data.phase_distribution : []),
    [data.phase_distribution],
  )
  const demandFollowUpDetailRows = useMemo(() => {
    const detailMap = new Map()
    workItemList.forEach((item) => {
      const typeName = String(item?.item_type_name || '').trim()
      if (typeName !== '需求跟进') return
      const label = buildDemandFollowUpTaskLabel(item)
      if (!detailMap.has(label)) {
        detailMap.set(label, {
          label,
          task_count: 0,
          actual_hours: 0,
        })
      }
      const current = detailMap.get(label)
      current.task_count += 1
      current.actual_hours += toNumber(item?.actual_hours, 0)
    })
    return Array.from(detailMap.values())
      .map((item) => ({
        ...item,
        actual_hours: toNumber(item.actual_hours, 0),
      }))
      .sort((a, b) => Number(b.actual_hours || 0) - Number(a.actual_hours || 0))
  }, [workItemList])
  const totalPhaseHours = phaseDistribution.reduce((sum, item) => sum + toNumber(item.actual_hours, 0), 0)

  const workItemTreeData = useMemo(() => {
    const groupedMap = new Map()
    const netEfficiencyExpression = normalizeNetEfficiencyExpression(summary.net_efficiency_formula_expression)
    const memberJobLevelWeightCoefficient = toNumber(summary.job_level_weight_coefficient, 1) || 1

    workItemList.forEach((item, index) => {
      const typeName = String(item.item_type_name || '').trim() || '未分类'
      if (!groupedMap.has(typeName)) {
        groupedMap.set(typeName, {
          key: `type-${typeName}-${groupedMap.size + 1}`,
          __isTypeGroup: true,
          item_type_name: typeName,
          log_status: null,
          job_level_name: summary.job_level_name || summary.job_level || '-',
          task_difficulty_name: null,
          self_task_difficulty_name: null,
          demand_name: null,
          phase_name: null,
          owner_required_item_count: 0,
          owner_estimate_covered_item_count: 0,
          owner_estimate_missing_item_count: 0,
          owner_estimate_non_owner_item_count: 0,
          total_raw_owner_estimate_hours: 0,
          total_owner_baseline_hours: 0,
          total_owner_comparable_actual_hours: 0,
          owner_estimate_hours: 0,
          personal_estimate_hours: 0,
          actual_hours: 0,
          net_efficiency_value: null,
          expected_start_date: null,
          expected_completion_date: null,
          description: '',
          item_count: 0,
          latest_log_date: null,
          children: [],
        })
      }

      const group = groupedMap.get(typeName)
      const logDate = String(item.log_date || '').trim()
      group.item_count += 1
      group.owner_required_item_count += toNumber(item.owner_estimate_required, 0)
      group.owner_estimate_covered_item_count += toNumber(item.owner_estimate_covered, 0)
      group.owner_estimate_missing_item_count += toNumber(item.owner_estimate_missing, 0)
      group.owner_estimate_non_owner_item_count += toNumber(item.owner_estimate_non_owner, 0)
      group.total_raw_owner_estimate_hours += toNumber(item.raw_owner_estimate_hours, 0)
      group.total_owner_baseline_hours += toNumber(item.owner_baseline_hours, 0)
      group.total_owner_comparable_actual_hours += toNumber(item.owner_comparable_actual_hours, 0)
      group.owner_estimate_hours += toNumber(item.owner_estimate_hours, 0)
      group.personal_estimate_hours += toNumber(item.personal_estimate_hours, 0)
      group.actual_hours += toNumber(item.actual_hours, 0)
      if (!group.latest_log_date || (logDate && dayjs(logDate).isAfter(dayjs(group.latest_log_date)))) {
        group.latest_log_date = logDate || group.latest_log_date
      }
      group.children.push({
        ...item,
        key: `log-${item.log_id || index + 1}`,
        __isTypeGroup: false,
      })
    })

    return Array.from(groupedMap.values())
      .map((group) => {
        const children = [...group.children].sort((a, b) => String(b.log_date || '').localeCompare(String(a.log_date || '')))
        const totalOwnerEstimateHours = toNumber(group.owner_estimate_hours, 0)
        const totalPersonalEstimateHours = toNumber(group.personal_estimate_hours, 0)
        const totalActualHours = toNumber(group.actual_hours, 0)
        const totalOwnerBaselineHours = toNumber(group.total_owner_baseline_hours, 0)
        const totalOwnerComparableActualHours = toNumber(group.total_owner_comparable_actual_hours, 0)
        const taskDifficultyCoefficient = calcWeightedCoefficient(children, 'task_difficulty_coefficient', 'actual_hours')

        return {
          ...group,
          total_raw_owner_estimate_hours: toNumber(group.total_raw_owner_estimate_hours, 0),
          total_owner_baseline_hours: totalOwnerBaselineHours,
          total_owner_comparable_actual_hours: totalOwnerComparableActualHours,
          owner_estimate_hours: totalOwnerEstimateHours,
          personal_estimate_hours: totalPersonalEstimateHours,
          actual_hours: totalActualHours,
          task_difficulty_coefficient: taskDifficultyCoefficient,
          job_level_weight_coefficient: memberJobLevelWeightCoefficient,
          net_efficiency_value: evaluateNetEfficiencyValue(
            netEfficiencyExpression,
            buildNetEfficiencyContext({
              totalOwnerEstimateHours,
              totalPersonalEstimateHours,
              totalActualHours,
              totalOwnerBaselineHours,
              totalOwnerComparableActualHours,
              taskDifficultyCoefficient,
              jobLevelWeightCoefficient: memberJobLevelWeightCoefficient,
            }),
          ),
          variance_owner_baseline_hours: totalOwnerComparableActualHours - totalOwnerBaselineHours,
          variance_personal_hours: totalActualHours - totalPersonalEstimateHours,
          children,
        }
      })
      .sort((a, b) => String(b.latest_log_date || '').localeCompare(String(a.latest_log_date || '')))
  }, [summary.job_level, summary.job_level_name, summary.job_level_weight_coefficient, summary.net_efficiency_formula_expression, workItemList])

  const handleExport = () => {
    if (workItemList.length === 0) {
      message.warning('当前没有可导出的事项明细')
      return
    }
    const rows = [
      ['日期', '事项类型', '事项状态', '职级', '关联需求', '阶段', '可比/应评估', 'Owner评估(h)', 'Owner偏差(h)', '个人预估(h)', '实际工时(h)', '个人偏差(h)', '净效率值', '描述'],
      ...workItemList.map((item) => [
        item.log_date || '-',
        item.item_type_name || '-',
        item.log_status || '-',
        summary.job_level_name || summary.job_level || '-',
        item.demand_name || item.demand_id || '-',
        item.phase_name || item.phase_key || '-',
        `${toNumber(item.owner_estimate_covered, 0)}/${toNumber(item.owner_estimate_required, 0)}`,
        formatHours(item.raw_owner_estimate_hours),
        formatHours(item.variance_owner_baseline_hours),
        formatHours(item.personal_estimate_hours),
        formatHours(item.actual_hours),
        formatHours(item.variance_personal_hours),
        formatNetEfficiencyValue(item.net_efficiency_value),
        item.description || '-',
      ]),
    ]
    downloadCsv(`${summary.username || '成员'}-${data.filters?.start_date || ''}-${data.filters?.end_date || ''}.csv`, rows)
    message.success('导出成功')
  }

  const renderComparableCell = (row) => {
    const covered = toNumber(row.owner_estimate_covered_item_count ?? row.owner_estimate_covered, 0)
    const required = toNumber(row.owner_required_item_count ?? row.owner_estimate_required, 0)
    const missing = toNumber(row.owner_estimate_missing_item_count ?? row.owner_estimate_missing, 0)
    return (
      <Tooltip
        title={
          <Space direction="vertical" size={2}>
            <span>{`可比事项：${covered} 个`}</span>
            <span>{`应评估事项：${required} 个`}</span>
            <span>{`缺失评估：${missing} 个`}</span>
            <span>{`非 Owner 事项：${toNumber(row.owner_estimate_non_owner_item_count ?? row.owner_estimate_non_owner, 0)} 个`}</span>
          </Space>
        }
      >
        <Space size={6}>
          <Tag color={getComparableTagColor(covered, required)}>{`${covered}/${required}`}</Tag>
          {missing > 0 ? <Tag color="warning">缺 {missing}</Tag> : null}
        </Space>
      </Tooltip>
    )
  }

  const renderVarianceValue = (value, mode = 'owner') => {
    const num = toNumber(value, 0)
    return (
      <Text style={{ color: getVarianceTextColor(num, mode), fontWeight: 600 }}>
        {num > 0 ? '+' : ''}
        {formatHours(num)}
      </Text>
    )
  }

  const openOwnerEstimateModal = useCallback((item) => {
    if (!item?.log_id) return
    ownerEstimateForm.setFieldsValue({
      owner_estimate_hours:
        item?.raw_owner_estimate_hours === null || item?.raw_owner_estimate_hours === undefined
          ? 0
          : toNumber(item.raw_owner_estimate_hours, 0),
    })
    setOwnerEstimateModal({
      open: true,
      item,
    })
  }, [ownerEstimateForm])

  const closeOwnerEstimateModal = useCallback(() => {
    setOwnerEstimateModal({
      open: false,
      item: null,
    })
    ownerEstimateForm.resetFields()
  }, [ownerEstimateForm])

  const handleSaveOwnerEstimate = useCallback(async () => {
    const logId = Number(ownerEstimateModal?.item?.log_id || 0)
    if (!Number.isInteger(logId) || logId <= 0) return
    try {
      const values = await ownerEstimateForm.validateFields()
      setSavingOwnerEstimate(true)
      const result = await updateWorkLogOwnerEstimateApi(logId, {
        owner_estimate_hours: values.owner_estimate_hours,
      })
      if (!result?.success) {
        message.error(result?.message || 'Owner 原始评估补填失败')
        return
      }
      message.success('Owner 原始评估已更新')
      closeOwnerEstimateModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查 Owner 原始评估输入')
      } else {
        message.error(error?.message || 'Owner 原始评估补填失败')
      }
    } finally {
      setSavingOwnerEstimate(false)
    }
  }, [closeOwnerEstimateModal, loadData, ownerEstimateForm, ownerEstimateModal?.item?.log_id])

  const renderEditableOwnerEstimateCell = (
    value,
    row,
    totalValue,
    {
      parentValueClassName = '',
      childValueClassName = '',
    } = {},
  ) => {
    const displayValue = row.__isTypeGroup ? totalValue : value
    const valueClassName = row.__isTypeGroup ? parentValueClassName : childValueClassName
    const valueNode = <span className={valueClassName}>{formatHours(displayValue)}</span>
    if (row.__isTypeGroup || !canEditOwnerEstimate) {
      return (
        <span className="efficiency-owner-estimate-cell">
          {valueNode}
          {!row.__isTypeGroup && toNumber(row.owner_estimate_required, 0) <= 0 ? (
            <Tag color="default" className="efficiency-owner-estimate-cell__tag">无需评估</Tag>
          ) : null}
        </span>
      )
    }
    return (
      <span className="efficiency-owner-estimate-cell">
        {valueNode}
        {toNumber(row.owner_estimate_required, 0) <= 0 ? (
          <Tag color="default" className="efficiency-owner-estimate-cell__tag">无需评估</Tag>
        ) : null}
        <Button
          type="text"
          size="small"
          className="efficiency-owner-estimate-cell__edit"
          icon={<EditOutlined />}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            openOwnerEstimateModal(row)
          }}
        />
      </span>
    )
  }

  const workItemColumns = [
    {
      title: '日期',
      dataIndex: 'log_date',
      key: 'log_date',
      width: 200,
      render: (value, row) =>
        row.__isTypeGroup ? (
          <Text type="secondary">{row.latest_log_date ? `最近：${formatBeijingDate(row.latest_log_date)}` : '-'}</Text>
        ) : (
          formatBeijingDate(value)
        ),
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 160,
      render: (value, row) =>
        row.__isTypeGroup ? (
          <Space size={8}>
            <Text strong>{value || '未分类'}</Text>
            <Tag color="blue">{`${toNumber(row.item_count, 0)} 条事项`}</Tag>
          </Space>
        ) : (
          value || '-'
        ),
    },
    {
      title: '状态',
      dataIndex: 'log_status',
      key: 'log_status',
      width: 100,
      render: (value, row) => (row.__isTypeGroup ? '-' : getLogStatusTag(value)),
    },
    {
      title: '关联需求',
      key: 'demand',
      width: 220,
      render: (_, row) =>
        row.__isTypeGroup ? (
          <Text type="secondary">该类型下共 {toNumber(row.item_count, 0)} 条事项</Text>
        ) : (
          <Space orientation="vertical" size={2}>
            <Text strong>{row.demand_name || '-'}</Text>
            <Text type="secondary">{row.phase_name || row.phase_key || '未分阶段'}</Text>
          </Space>
        ),
    },
    {
      title: '可比/应评估',
      key: 'owner_item_ratio',
      width: 150,
      render: (_, row) =>
        row.__isTypeGroup
          ? renderComparableCell(row)
          : renderComparableCell({
              owner_estimate_covered: row.owner_estimate_covered,
              owner_estimate_required: row.owner_estimate_required,
              owner_estimate_missing: row.owner_estimate_missing,
              owner_estimate_non_owner: row.owner_estimate_non_owner,
            }),
    },
    {
      title: (
        <Space size={4}>
          <span className="efficiency-highlight-title efficiency-highlight-title--owner">Owner评估/基线(h)</span>
          <Tooltip title="事项行展示 Owner 原始评估；分组行展示 Owner 真实基线（净效率口径）。">
            <QuestionCircleOutlined className="efficiency-highlight-title__icon efficiency-highlight-title__icon--owner" />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'raw_owner_estimate_hours',
      key: 'raw_owner_estimate_hours',
      width: 172,
      render: (value, row) =>
        renderEditableOwnerEstimateCell(
          value,
          row,
          row.__isTypeGroup ? row.total_owner_baseline_hours : row.total_raw_owner_estimate_hours,
          {
            parentValueClassName: 'efficiency-highlight-value efficiency-highlight-value--owner',
            childValueClassName: 'efficiency-emphasis-value efficiency-emphasis-value--owner',
          },
        ),
    },
    {
      title: 'Owner偏差(h)',
      dataIndex: 'variance_owner_baseline_hours',
      key: 'variance_owner_baseline_hours',
      width: 120,
      render: (value, row) => renderVarianceValue(row.__isTypeGroup ? row.variance_owner_baseline_hours : value, 'owner'),
    },
    {
      title: '个人预估(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 120,
      render: (value, row) => (row.__isTypeGroup ? formatHours(row.personal_estimate_hours) : formatHours(value)),
    },
    {
      title: '个人偏差(h)',
      dataIndex: 'variance_personal_hours',
      key: 'variance_personal_hours',
      width: 120,
      render: (value, row) => renderVarianceValue(row.__isTypeGroup ? row.variance_personal_hours : value, 'personal'),
    },
    {
      title: (
        <Space size={4}>
          <span className="efficiency-highlight-title efficiency-highlight-title--actual">实际/可比实际(h)</span>
          <Tooltip title="事项行展示实际工时；分组行展示 Owner 可比实际（净效率口径）。">
            <QuestionCircleOutlined className="efficiency-highlight-title__icon efficiency-highlight-title__icon--actual" />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 172,
      render: (value, row) =>
        row.__isTypeGroup
          ? (
            <Text strong>
              <span className="efficiency-highlight-value efficiency-highlight-value--actual">
                {formatHours(row.total_owner_comparable_actual_hours)}
              </span>
            </Text>
            )
          : (
            <Text strong>
              <span className="efficiency-emphasis-value efficiency-emphasis-value--actual">{formatHours(value)}</span>
            </Text>
            ),
    },
    {
      title: (
        <Space size={4}>
          <span className="efficiency-highlight-title efficiency-highlight-title--net">净效率值</span>
          <Tooltip title="净效率 = (Owner真实基线 - Owner可比实际) × 任务难度系数 ÷ 职级权重系数。">
            <QuestionCircleOutlined className="efficiency-highlight-title__icon efficiency-highlight-title__icon--net" />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'net_efficiency_value',
      key: 'net_efficiency_value',
      width: 146,
      render: (value, row) =>
        value === null || value === undefined
            ? <Text type="secondary">-</Text>
            : row.__isTypeGroup ? (
              <Text strong>
                <span
                  className="efficiency-highlight-value efficiency-highlight-value--net"
                  style={{ color: getNetEfficiencyTextColor(value) }}
                >
                  {formatNetEfficiencyValue(value)}
                </span>
              </Text>
              ) : (
                <Text strong>
                  <span className="efficiency-emphasis-value" style={{ color: getNetEfficiencyTextColor(value) }}>
                    {formatNetEfficiencyValue(value)}
                  </span>
                </Text>
              ),
    },
    {
      title: '排期',
      key: 'schedule',
      width: 200,
      render: (_, row) =>
        row.__isTypeGroup ? '-' : `${row.expected_start_date || '-'} ~ ${row.expected_completion_date || '-'}`,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value, row) => (row.__isTypeGroup ? '-' : value || '-'),
    },
  ]

  const summaryItems = [
    { label: '事项数', value: toNumber(summary.total_item_count, 0), note: '当前筛选范围内的事项总数，口径对齐个人工作台历史记录的按事项视图' },
    {
      label: '可比/应评估',
      valueNode: renderComparableCell(summary),
      note: 'Owner 真实分析口径先看这一项，缺失评估会直接暴露出来',
    },
    {
      label: 'Owner评估覆盖率',
      value: formatPercent(summary.owner_estimate_coverage_rate),
      note: '只统计应由 Owner 评估的事项；非 Owner 事项不计入分母',
    },
    {
      label: 'Owner原始评估(h)',
      value: formatHours(summary.total_raw_owner_estimate_hours),
      note: '直接汇总原始 Owner 评估字段，方便校准是否存在未填、填 0 或口径差异',
    },
    {
      label: 'Owner真实基线(h)',
      value: formatHours(summary.total_owner_baseline_hours),
      note: '只累计存在真实 Owner 评估值的事项',
    },
    {
      label: 'Owner可比实际(h)',
      value: formatHours(summary.total_owner_comparable_actual_hours),
      note: '只累计进入 Owner 可比口径的实际工时',
    },
    {
      label: 'Owner偏差(h)',
      valueNode: renderVarianceValue(summary.variance_owner_baseline_hours, 'owner'),
      note: 'Owner偏差 = Owner可比实际 - Owner真实基线',
    },
    {
      label: '个人预估覆盖率',
      value: formatPercent(summary.personal_estimate_coverage_rate),
      note: '当前成员个人预估填写完整度',
    },
    { label: '实际总工时(h)', value: formatHours(summary.total_actual_hours), note: '当前周期事项实际投入汇总' },
    {
      label: '个人偏差(h)',
      valueNode: renderVarianceValue(summary.variance_personal_hours, 'personal'),
      note: '个人偏差 = 实际工时 - 个人预估工时',
    },
    {
      label: '净效率值',
      valueNode:
        summary.net_efficiency_value === null || summary.net_efficiency_value === undefined ? (
          '-'
        ) : (
          <span style={{ color: getNetEfficiencyTextColor(summary.net_efficiency_value) }}>
            {formatNetEfficiencyValue(summary.net_efficiency_value)}
          </span>
        ),
      note: `当前按公式口径计算，任务难度系数 ${toNumber(summary.task_difficulty_coefficient, 1).toFixed(2)}，职级权重系数 ${toNumber(summary.job_level_weight_coefficient, 1).toFixed(2)}`,
    },
  ]

  return (
    <div className="efficiency-detail-page">
      <div className="efficiency-detail-page__layout">
        <Card variant="borderless" className="efficiency-detail-hero">
          <div className="efficiency-detail-hero__row">
            <div className="efficiency-detail-hero__main">
              <span className="efficiency-detail-hero__eyebrow">个人人效详情</span>
              <div className="efficiency-detail-hero__title">{summary.username || '个人人效详情'}</div>
              <div className="efficiency-detail-hero__subtitle">
                聚焦当前成员在周期内全部事项的可比/应评估、Owner真实基线与偏差表现，便于从整体判断快速下钻到具体需求和事项。
              </div>
              <div className="efficiency-detail-hero__meta">
                <span className="efficiency-detail-meta-pill">部门：{summary.department_name || '-'}</span>
                <span className="efficiency-detail-meta-pill">职级：{summary.job_level_name || summary.job_level || '-'}</span>
                <span className="efficiency-detail-meta-pill">时间范围：{data.filters?.start_date || '-'} ~ {data.filters?.end_date || '-'}</span>
              </div>
            </div>
            <div className="efficiency-detail-hero__actions">
              <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>刷新</Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </div>
          </div>
          <div className="efficiency-detail-toolbar">
            <RangePicker
              allowClear={false}
              value={dateRange}
              onChange={(values) => {
                const nextRange = values && values.length === 2 ? values : getDefaultDateRange()
                setDateRange(nextRange)
                navigateWithState(nextRange)
              }}
            />
            <span className="efficiency-detail-toolbar__hint">切换统计周期后，将同步刷新事项明细与阶段分布，口径对齐个人工作台历史记录的按事项视图。</span>
          </div>
        </Card>

        <Row gutter={[16, 16]} className="efficiency-summary-grid">
          {summaryItems.map((item) => (
            <Col xs={24} sm={12} xl={6} key={item.label}>
              <div className="efficiency-summary-card">
                <div className="efficiency-summary-card__label">{item.label}</div>
                <div className="efficiency-summary-card__value">{item.valueNode || item.value}</div>
                <div className="efficiency-summary-card__note">{item.note}</div>
              </div>
            </Col>
          ))}
        </Row>

        {!userId ? (
          <Card variant="borderless" className="efficiency-detail-card">
            <Empty description="当前成员不存在或尚未选择成员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Card>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={14}>
                <Card variant="borderless" className="efficiency-detail-section">
                  <WorkTypeDistributionChart
                    data={data.work_type_distribution}
                    detailRows={demandFollowUpDetailRows}
                    detailTitle="需求跟进任务细分"
                    loading={loading}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card title="阶段分布" variant="borderless" className="efficiency-detail-section">
                  <div className="efficiency-insight-stack">
                    <div className="efficiency-phase-summary">
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">阶段数</div>
                        <div className="efficiency-phase-summary__value">{phaseDistribution.length}</div>
                      </div>
                      <div className="efficiency-phase-summary__item">
                        <div className="efficiency-phase-summary__label">阶段总工时(h)</div>
                        <div className="efficiency-phase-summary__value">{toNumber(totalPhaseHours, 0).toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="efficiency-insight-block">
                      <div className="efficiency-insight-block__title">主要投入阶段</div>
                      <div className="efficiency-insight-block__subtle">按实际工时倒序展示当前周期内的阶段分布</div>
                      <div className="efficiency-note-row">
                        {phaseDistribution.slice(0, 10).map((item) => (
                          <span key={`${item.phase_key || 'none'}-${item.phase_name}`} className="efficiency-note-chip">
                            {`${item.phase_name} · ${toNumber(item.actual_hours, 0).toFixed(1)}h`}
                          </span>
                        ))}
                        {phaseDistribution.length === 0 ? <Text type="secondary">当前范围暂无阶段分布</Text> : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            <Card
              title="事项明细"
              extra={<span className="efficiency-detail-toolbar__hint">按事项类型分组展示，数据口径对齐个人工作台历史记录的按事项视图，重点查看哪些事项进入 Owner 可比口径、哪些事项缺失评估</span>}
              variant="borderless"
              className="efficiency-detail-section"
            >
              <Table
                rowKey="key"
                loading={loading}
                columns={workItemColumns}
                dataSource={workItemTreeData}
                size="small"
                className="efficiency-detail-table"
                rowClassName={(record) => (record?.__isTypeGroup ? 'efficiency-table-parent-row' : '')}
                scroll={{ x: 1450 }}
                expandable={{
                  defaultExpandAllRows: true,
                  rowExpandable: (record) => Array.isArray(record.children) && record.children.length > 0,
                }}
                pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 类事项` }}
                locale={{ emptyText: '当前范围暂无事项明细' }}
              />
            </Card>

          </>
        )}
      </div>
      <Modal
        title={ownerEstimateModal.item ? `补填 Owner 原始评估：#${ownerEstimateModal.item.log_id}` : '补填 Owner 原始评估'}
        open={ownerEstimateModal.open}
        onCancel={closeOwnerEstimateModal}
        onOk={handleSaveOwnerEstimate}
        confirmLoading={savingOwnerEstimate}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        forceRender
      >
        <Form form={ownerEstimateForm} layout="vertical">
          <Form.Item
            label="Owner原始评估(h)"
            name="owner_estimate_hours"
            rules={[{ required: true, message: '请输入 Owner 原始评估用时' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          {ownerEstimateModal.item ? (
            <div className="efficiency-owner-estimate-modal__meta">
              <div>事项类型：{ownerEstimateModal.item.item_type_name || '-'}</div>
              <div>关联需求：{ownerEstimateModal.item.demand_name || ownerEstimateModal.item.demand_id || '-'}</div>
              <div>阶段：{ownerEstimateModal.item.phase_name || ownerEstimateModal.item.phase_key || '-'}</div>
              {ownerEstimateModal.item.description ? <div>描述：{ownerEstimateModal.item.description}</div> : null}
            </div>
          ) : null}
        </Form>
      </Modal>
    </div>
  )
}

export default MemberEfficiencyDetailPage
