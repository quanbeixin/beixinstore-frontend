import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Input, Select, Space, Spin, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProfileApi } from '../../api/auth'
import { getHumanGanttApi } from '../../api/work'
import { getCurrentUser } from '../../utils/access'
import { formatBeijingDate } from '../../utils/datetime'
import './HumanGanttPage.css'

const { Text } = Typography
const DAY_WIDTH = 90
const EMPTY_DATA = {
  scope: 'all',
  range: {
    start_date: '',
    end_date: '',
    total_days: 0,
  },
  view_scope: {
    mode: 'DEPARTMENT',
    department_id: null,
    department_name: '',
  },
  summary: {
    user_count: 0,
    item_count: 0,
    conflict_user_count: 0,
    empty_user_count: 0,
  },
  department_options: [],
  calendar_dates: [],
  users: [],
}

function toDateText(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateText(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function getDefaultTwoWeekRange() {
  const today = new Date()
  const weekDay = today.getDay()
  const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay
  const startDate = new Date(today)
  startDate.setDate(today.getDate() + mondayOffset)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 13)

  return {
    startDate: toDateText(startDate),
    endDate: toDateText(endDate),
  }
}

function getDefaultMonthRange() {
  const today = new Date()
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return {
    startDate: toDateText(startDate),
    endDate: toDateText(endDate),
  }
}

function buildDayList(startDateText, endDateText) {
  const startDate = parseDateText(startDateText)
  const endDate = parseDateText(endDateText)
  if (!startDate || !endDate || endDate < startDate) return []

  const result = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    result.push(toDateText(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

function assignLanes(items = []) {
  const sortedItems = [...items].sort((a, b) => {
    const aOffset = Number(a.start_offset_days || 0)
    const bOffset = Number(b.start_offset_days || 0)
    if (aOffset !== bOffset) return aOffset - bOffset

    const aDuration = Number(a.duration_days || 1)
    const bDuration = Number(b.duration_days || 1)
    if (aDuration !== bDuration) return bDuration - aDuration
    return Number(a.log_id || 0) - Number(b.log_id || 0)
  })

  const laneEndOffsets = []
  return sortedItems.map((item) => {
    const startOffset = Number(item.start_offset_days || 0)
    const duration = Math.max(1, Number(item.duration_days || 1))
    const endOffset = startOffset + duration - 1

    let laneIndex = laneEndOffsets.findIndex((laneEnd) => startOffset > laneEnd)
    if (laneIndex < 0) laneIndex = laneEndOffsets.length
    laneEndOffsets[laneIndex] = endOffset

    return {
      ...item,
      lane_index: laneIndex,
    }
  })
}

function getBarClassName(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'DONE') return 'human-gantt-bar human-gantt-bar--done'
  if (normalized === 'TODO') return 'human-gantt-bar human-gantt-bar--todo'
  return 'human-gantt-bar human-gantt-bar--progress'
}

function formatStatusLabel(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'DONE') return '已完成'
  if (normalized === 'TODO') return '待开始'
  return '进行中'
}

function getDayLabel(dateText) {
  const date = parseDateText(dateText)
  if (!date) return '--'
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${dateText.slice(5)} 周${weekday}`
}

function getDayMetaClass(dayMeta) {
  if (dayMeta?.is_holiday) return 'human-gantt-day-meta--holiday'
  if (dayMeta?.is_weekend && !dayMeta?.is_adjusted_workday) return 'human-gantt-day-meta--weekend'
  return ''
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function HumanGanttPage() {
  const defaultRange = useMemo(() => getDefaultTwoWeekRange(), [])
  const defaultDepartmentId = useMemo(() => toPositiveInt(getCurrentUser()?.department_id), [])
  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    departmentId: defaultDepartmentId,
    userIds: [],
  })
  const [query, setQuery] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    departmentId: defaultDepartmentId,
    userIds: [],
  })
  const [profileInitDone, setProfileInitDone] = useState(Boolean(defaultDepartmentId))
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  const loadData = useCallback(async (queryState, { force = false } = {}) => {
    setLoading(true)
    setErrorText('')
    try {
      const params = {
        scope: 'all',
        start_date: queryState.startDate,
        end_date: queryState.endDate,
      }
      if (toPositiveInt(queryState.departmentId)) {
        params.department_id = toPositiveInt(queryState.departmentId)
      }
      if (Array.isArray(queryState.userIds) && queryState.userIds.length > 0) {
        params.user_ids = queryState.userIds.join(',')
      }

      const result = await getHumanGanttApi(params, { force })
      if (!result?.success) {
        throw new Error(result?.message || '获取人力甘特图数据失败')
      }
      setData(result?.data || EMPTY_DATA)
    } catch (err) {
      const messageText = err?.message || '获取人力甘特图数据失败'
      setErrorText(messageText)
      message.error(messageText)
      setData(EMPTY_DATA)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (profileInitDone) return
    let active = true

    const bootstrapDefaultDepartment = async () => {
      try {
        const result = await getProfileApi()
        if (!active || !result?.success) return
        const profileDepartmentId = toPositiveInt(result?.data?.department_id)
        if (!profileDepartmentId) return

        setFilters((prev) =>
          toPositiveInt(prev?.departmentId) ? prev : { ...prev, departmentId: profileDepartmentId },
        )
        setQuery((prev) =>
          toPositiveInt(prev?.departmentId) ? prev : { ...prev, departmentId: profileDepartmentId },
        )
      } catch {
        // 忽略默认部门补齐失败，继续按当前筛选加载页面
      } finally {
        if (active) setProfileInitDone(true)
      }
    }

    bootstrapDefaultDepartment()
    return () => {
      active = false
    }
  }, [profileInitDone])

  useEffect(() => {
    if (!profileInitDone) return
    loadData(query)
  }, [loadData, profileInitDone, query])

  const dayList = useMemo(() => {
    const startDate = data?.range?.start_date || query.startDate
    const endDate = data?.range?.end_date || query.endDate
    return buildDayList(startDate, endDate)
  }, [data?.range?.end_date, data?.range?.start_date, query.endDate, query.startDate])

  const calendarDateMap = useMemo(() => {
    const calendarDates = Array.isArray(data?.calendar_dates) ? data.calendar_dates : []
    return new Map(calendarDates.map((item) => [String(item?.date || ''), item]))
  }, [data?.calendar_dates])

  const userRows = useMemo(() => {
    const users = Array.isArray(data?.users) ? data.users : []
    return users.map((user) => {
      const laneItems = assignLanes(Array.isArray(user?.items) ? user.items : [])
      const laneCount = laneItems.reduce((max, item) => Math.max(max, Number(item.lane_index || 0) + 1), 1)
      return {
        ...user,
        laneCount,
        laneItems,
      }
    })
  }, [data?.users])

  const userOptions = useMemo(
    () =>
      userRows.map((user) => ({
        value: user.user_id,
        label: `${user.user_name}${user.department_name ? `（${user.department_name}）` : ''}`,
      })),
    [userRows],
  )

  const departmentOptions = useMemo(() => {
    const fromApi = Array.isArray(data?.department_options) ? data.department_options : []
    return fromApi
      .map((item) => ({
        value: toPositiveInt(item.department_id),
        label: String(item.department_name || '').trim(),
      }))
      .filter((item) => item.value && item.label)
  }, [data?.department_options])

  useEffect(() => {
    const currentDepartmentId = toPositiveInt(query.departmentId)
    if (!currentDepartmentId) return
    if (loading) return
    if (!Array.isArray(departmentOptions) || departmentOptions.length === 0) return

    const exists = departmentOptions.some((item) => Number(item.value) === Number(currentDepartmentId))
    if (exists) return

    setFilters((prev) => ({
      ...prev,
      departmentId: null,
      userIds: [],
    }))
    setQuery((prev) => ({
      ...prev,
      departmentId: null,
      userIds: [],
    }))
    message.info(`所属部门（ID: ${currentDepartmentId}）当前无可展示成员，已切换为全部部门`)
  }, [departmentOptions, loading, query.departmentId])

  const timelineWidth = Math.max(dayList.length * DAY_WIDTH, 420)
  const gridColumns = `repeat(${Math.max(dayList.length, 1)}, ${DAY_WIDTH}px)`
  const selectedDepartmentLabel = useMemo(() => {
    const departmentId = toPositiveInt(query.departmentId)
    if (!departmentId) return ''
    const selected = departmentOptions.find((item) => Number(item.value) === departmentId)
    return String(selected?.label || `部门#${departmentId}`)
  }, [departmentOptions, query.departmentId])

  const scopeLabel = selectedDepartmentLabel || '全部部门'

  const handleSearch = () => {
    if (!parseDateText(filters.startDate) || !parseDateText(filters.endDate)) {
      message.warning('请选择正确的开始/结束日期')
      return
    }
    if (filters.endDate < filters.startDate) {
      message.warning('结束日期不能早于开始日期')
      return
    }

    setQuery({
      startDate: filters.startDate,
      endDate: filters.endDate,
      departmentId: toPositiveInt(filters.departmentId),
      userIds: Array.isArray(filters.userIds) ? filters.userIds : [],
    })
  }

  function applyQuickFilter(nextPatch = {}) {
    setFilters((prev) => {
      const next = {
        ...prev,
        ...nextPatch,
      }
      setQuery({
        startDate: next.startDate,
        endDate: next.endDate,
        departmentId: toPositiveInt(next.departmentId),
        userIds: Array.isArray(next.userIds) ? next.userIds : [],
      })
      return next
    })
  }

  const handleResetToWeek = () => {
    const nextRange = getDefaultTwoWeekRange()
    applyQuickFilter({
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
    })
  }

  const handleResetToMonth = () => {
    const nextRange = getDefaultMonthRange()
    applyQuickFilter({
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
    })
  }

  return (
    <div className="human-gantt-page">
      <Card className="human-gantt-filter-card" styles={{ body: { padding: 14 } }}>
        <div className="human-gantt-filter-row">
          <Space size={10} wrap>
            <Select
              allowClear
              value={filters.departmentId}
              options={departmentOptions}
              placeholder="选择部门（默认本部门）"
              onChange={(value) => {
                applyQuickFilter({
                  departmentId: toPositiveInt(value),
                  userIds: [],
                })
              }}
              style={{ width: 220 }}
            />
            <Text type="secondary">开始</Text>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  startDate: String(event?.target?.value || ''),
                }))
              }
              style={{ width: 150 }}
            />
            <Text type="secondary">结束</Text>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  endDate: String(event?.target?.value || ''),
                }))
              }
              style={{ width: 150 }}
            />
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              value={filters.userIds}
              options={userOptions}
              placeholder="筛选成员（可选）"
              onChange={(values) => {
                applyQuickFilter({
                  userIds: values,
                })
              }}
              style={{ minWidth: 260 }}
            />
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <Button onClick={handleResetToWeek}>本周</Button>
            <Button onClick={handleResetToMonth}>本月</Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadData(query, { force: true })}>
              刷新
            </Button>
          </Space>
        </div>
        <div className="human-gantt-summary-row">
          <Tag color="blue">范围：{scopeLabel}</Tag>
          <Tag color="processing">
            时间：{formatBeijingDate(data?.range?.start_date || query.startDate)} -{' '}
            {formatBeijingDate(data?.range?.end_date || query.endDate)}
          </Tag>
          <Tag color="purple">成员：{Number(data?.summary?.user_count || 0)}</Tag>
          <Tag color="cyan">事项：{Number(data?.summary?.item_count || 0)}</Tag>
          <Tag color="warning">冲突成员：{Number(data?.summary?.conflict_user_count || 0)}</Tag>
          <Tag color="default">空档成员：{Number(data?.summary?.empty_user_count || 0)}</Tag>
        </div>
      </Card>

      {errorText ? (
        <Alert
          style={{ marginTop: 12 }}
          type="error"
          showIcon
          message="加载失败"
          description={errorText}
        />
      ) : null}

      <Card className="human-gantt-board-card" styles={{ body: { padding: 0 } }}>
        <Spin spinning={loading}>
          {userRows.length === 0 ? (
            <div className="human-gantt-empty-wrap">
              <Empty description="当前筛选范围暂无可展示的数据" />
            </div>
          ) : (
            <div className="human-gantt-scroll">
              <div className="human-gantt-table" style={{ minWidth: 280 + timelineWidth }}>
                <div className="human-gantt-header-row">
                  <div className="human-gantt-user-col human-gantt-user-col--header">成员</div>
                  <div
                    className="human-gantt-days-row human-gantt-days-row--header"
                    style={{ width: timelineWidth, gridTemplateColumns: gridColumns }}
                  >
                    {dayList.map((day) => {
                      const dayMeta = calendarDateMap.get(day) || null
                      const dayMetaClass = getDayMetaClass(dayMeta)
                      const dayNote = String(dayMeta?.holiday_name || dayMeta?.note || '').trim()
                      return (
                        <div
                          key={day}
                          className={`human-gantt-day-cell human-gantt-day-cell--header ${dayMetaClass}`.trim()}
                        >
                          <span>{getDayLabel(day)}</span>
                          {dayMeta?.is_holiday ? (
                            <Tooltip title={dayNote || '节假日'}>
                              <span className="human-gantt-day-subtle-mark">节</span>
                            </Tooltip>
                          ) : null}
                          {!dayMeta?.is_holiday && dayMeta?.is_weekend && !dayMeta?.is_adjusted_workday ? (
                            <span className="human-gantt-day-subtle-mark">休</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {userRows.map((user) => {
                  const conflictDaySet = new Set(Array.isArray(user.conflict_days) ? user.conflict_days : [])
                  const trackHeight = Math.max(46, user.laneCount * 26 + 10)
                  return (
                    <div key={user.user_id} className="human-gantt-data-row">
                      <div className="human-gantt-user-col">
                        <div className="human-gantt-user-name">{user.user_name || `成员#${user.user_id}`}</div>
                        <div className="human-gantt-user-dept">{user.department_name || '未分配部门'}</div>
                        <div className="human-gantt-user-metas">
                          <Tag variant="filled" className="human-gantt-meta-tag">
                            {Number(user.item_count || 0)} 项
                          </Tag>
                          {conflictDaySet.size > 0 ? (
                            <Tag variant="filled" color="warning" className="human-gantt-meta-tag">
                              冲突 {conflictDaySet.size} 天
                            </Tag>
                          ) : null}
                        </div>
                      </div>
                      <div className="human-gantt-track-wrap" style={{ width: timelineWidth, height: trackHeight }}>
                        <div className="human-gantt-grid-lines" style={{ gridTemplateColumns: gridColumns }}>
                          {dayList.map((day) => {
                            const dayMeta = calendarDateMap.get(day) || null
                            const dayMetaClass = getDayMetaClass(dayMeta)
                            const classes = [
                              'human-gantt-grid-cell',
                              dayMetaClass,
                              conflictDaySet.has(day) ? 'human-gantt-grid-cell--conflict' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')
                            return <div key={`${user.user_id}-${day}`} className={classes} />
                          })}
                        </div>
                        {user.laneItems.map((item) => {
                          const left = Number(item.start_offset_days || 0) * DAY_WIDTH + 2
                          const width = Math.max(Number(item.duration_days || 1) * DAY_WIDTH - 4, 14)
                          const top = Number(item.lane_index || 0) * 26 + 5
                          const tooltipTitle = (
                            <div className="human-gantt-tooltip">
                              <div>事项：{item.item_title || '-'}</div>
                              <div>类型：{item.item_type_name || '-'}</div>
                              <div>状态：{formatStatusLabel(item.log_status)}</div>
                              <div>
                                时间：{formatBeijingDate(item.start_date)} - {formatBeijingDate(item.end_date)}
                              </div>
                              <div>需求：{item.demand_title || item.demand_id || '-'}</div>
                              <div>
                                工时：预估 {Number(item.estimate_hours || 0)}h / 实际 {Number(item.actual_hours || 0)}h
                              </div>
                            </div>
                          )
                          return (
                            <Tooltip key={`${user.user_id}-${item.log_id}`} title={tooltipTitle} mouseEnterDelay={0.2}>
                              <div
                                className={getBarClassName(item.log_status)}
                                style={{
                                  left,
                                  width,
                                  top,
                                }}
                              >
                                <span className="human-gantt-bar__text">{item.item_title || `事项#${item.log_id}`}</span>
                              </div>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Spin>
      </Card>
    </div>
  )
}

export default HumanGanttPage
