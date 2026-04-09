import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  Mentions,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getUsersApi } from '../../api/users'
import {
  createNotificationRuleApi,
  deleteNotificationRuleApi,
  getFeishuChatOptionsApi,
  getNotificationSendControlApi,
  getNotificationRulesApi,
  triggerNotificationEventApi,
  updateNotificationSendControlApi,
  updateNotificationRuleApi,
} from '../../api/notification'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

const CHANNEL_OPTIONS = [{ label: '飞书', value: 'feishu' }]
const RECEIVER_TYPE_OPTIONS = [
  { label: '业务角色', value: 'role' },
  { label: '用户', value: 'user' },
  { label: '飞书群', value: 'chat' },
  { label: '需求绑定群', value: 'demand_group' },
  { label: '字段映射', value: 'field' },
]
const BASE_BUSINESS_ROLE_OPTIONS = [
  { label: '需求处理人', value: 'demand_owner' },
  { label: '节点负责人', value: 'node_owner' },
]
const DAILY_REPORT_BUSINESS_ROLE_OPTIONS = [
  { label: '团队人数', value: 'daily_report_team_all' },
  { label: '今日有安排', value: 'daily_report_scheduled' },
  { label: '有安排已填报', value: 'daily_report_filled' },
  { label: '有安排待填报', value: 'daily_report_unfilled' },
  { label: '今日未安排', value: 'daily_report_unscheduled' },
]
const BUSINESS_ROLE_OPTIONS = [...BASE_BUSINESS_ROLE_OPTIONS, ...DAILY_REPORT_BUSINESS_ROLE_OPTIONS]
const BUSINESS_ROLE_LABEL_MAP = BUSINESS_ROLE_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const CONDITION_FIELD_OPTIONS_BY_EVENT = {
  node_assign: [
    { label: '需求ID', value: 'demand_id' },
    { label: '节点ID', value: 'node_id' },
    { label: '优先级', value: 'priority' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  node_reject: [
    { label: '需求ID', value: 'demand_id' },
    { label: '节点ID', value: 'node_id' },
    { label: '驳回原因', value: 'reject_reason' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  node_complete: [
    { label: '需求ID', value: 'demand_id' },
    { label: '节点ID', value: 'node_id' },
    { label: '完成人ID', value: 'operator_id' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  task_assign: [
    { label: '任务ID', value: 'task_id' },
    { label: '任务优先级', value: 'priority' },
    { label: '任务状态', value: 'status' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  task_deadline: [
    { label: '任务ID', value: 'task_id' },
    { label: '剩余小时', value: 'remaining_hours' },
    { label: '任务优先级', value: 'priority' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  task_complete: [
    { label: '任务ID', value: 'task_id' },
    { label: '完成人ID', value: 'operator_id' },
    { label: '任务状态', value: 'status' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  demand_create: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求状态', value: 'status' },
    { label: '优先级', value: 'priority' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  demand_assign: [
    { label: '需求ID', value: 'demand_id' },
    { label: '原负责人', value: 'from_owner_name' },
    { label: '新负责人', value: 'to_owner_name' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  demand_status_change: [
    { label: '需求ID', value: 'demand_id' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  worklog_create: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项状态', value: 'status' },
    { label: '事项类型', value: 'item_type_name' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  worklog_assign: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '原接收人', value: 'from_assignee_name' },
    { label: '新接收人', value: 'to_assignee_name' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  worklog_status_change: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  worklog_deadline_remind: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项状态', value: 'status' },
    { label: '距到期小时', value: 'hours_to_deadline' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  bug_create: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '严重级别', value: 'severity' },
    { label: '优先级', value: 'priority' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  bug_assign: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '严重级别', value: 'severity' },
    { label: '优先级', value: 'priority' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  bug_status_change: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  bug_fixed: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '修复人ID', value: 'operator_id' },
    { label: '严重级别', value: 'severity' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  bug_reopen: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '重开原因', value: 'reopen_reason' },
    { label: '严重级别', value: 'severity' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
  weekly_report_send: [
    { label: '周报文案全文', value: 'weekly_summary_text' },
    { label: '周报周期', value: 'week_range' },
    { label: '部门ID', value: 'department_id' },
    { label: '成员ID', value: 'user_id' },
    { label: '业务线ID', value: 'business_line_id' },
  ],
}

const DEFAULT_CONDITION_FIELD_OPTIONS = [
  { label: '优先级', value: 'priority' },
  { label: '状态', value: 'status' },
  { label: '业务线ID', value: 'business_line_id' },
]

const CONDITION_OPERATOR_OPTIONS = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '包含', value: 'contains' },
  { label: '为空', value: 'is_empty' },
  { label: '不为空', value: 'is_not_empty' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '在集合中（逗号分隔）', value: 'in' },
  { label: '不在集合中（逗号分隔）', value: 'nin' },
]

const CONDITION_OPERATORS_WITHOUT_VALUE = new Set(['is_empty', 'is_not_empty'])

const TRIGGER_MODE_OPTIONS = [
  { label: '按字段触发', value: 'event' },
  { label: '按时间触发', value: 'schedule' },
  { label: '按到期触发', value: 'deadline' },
]

const SCHEDULE_FREQUENCY_OPTIONS = [
  { label: '每小时', value: 'hourly' },
  { label: '每日', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
]

const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
]

const DEADLINE_TARGET_OPTIONS = [{ label: '事项到期', value: 'worklog' }]
const DEADLINE_OFFSET_TYPE_OPTIONS = [
  { label: '到期前', value: 'before' },
  { label: '到期后', value: 'after' },
]
const DEADLINE_OFFSET_UNIT_OPTIONS = [
  { label: '小时', value: 'hour' },
  { label: '天', value: 'day' },
]

const DEDUP_KEY_FIELD_OPTIONS = [
  { label: '业务线', value: 'business_line_id' },
  { label: '事件类型', value: 'event_type' },
  { label: '需求', value: 'demand_id' },
  { label: '节点', value: 'node_id' },
  { label: '任务', value: 'task_id' },
]

const EVENT_TYPE_GROUPED_OPTIONS = [
  {
    label: '需求',
    options: [
      { label: '需求创建', value: 'demand_create' },
      { label: '需求指派', value: 'demand_assign' },
      { label: '需求状态变更', value: 'demand_status_change' },
      { label: '节点指派', value: 'node_assign' },
      { label: '节点驳回', value: 'node_reject' },
      { label: '节点完成', value: 'node_complete' },
      { label: '任务指派', value: 'task_assign' },
      { label: '任务截止提醒', value: 'task_deadline' },
      { label: '任务完成', value: 'task_complete' },
    ],
  },
  {
    label: '人效',
    options: [
      { label: '事项创建', value: 'worklog_create' },
      { label: '事项指派', value: 'worklog_assign' },
      { label: '事项状态变更', value: 'worklog_status_change' },
      { label: '事项到期提醒', value: 'worklog_deadline_remind' },
      { label: '周报发送', value: 'weekly_report_send' },
      { label: '日报通知', value: 'daily_report_notify' },
    ],
  },
  {
    label: '缺陷',
    options: [
      { label: 'Bug创建', value: 'bug_create' },
      { label: 'Bug指派', value: 'bug_assign' },
      { label: 'Bug状态变更', value: 'bug_status_change' },
      { label: 'Bug已修复', value: 'bug_fixed' },
      { label: 'Bug重新打开', value: 'bug_reopen' },
    ],
  },
]

const EVENT_TYPE_OPTIONS = EVENT_TYPE_GROUPED_OPTIONS.flatMap((group) => group.options || [])
const SCHEDULE_SCENE_CODE_BY_FREQUENCY = {
  hourly: 'schedule_hourly',
  daily: 'schedule_daily',
  weekly: 'schedule_weekly',
  monthly: 'schedule_monthly',
}
const EVENT_TYPE_LABEL_MAP = {
  ...EVENT_TYPE_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.label
    return acc
  }, {}),
  schedule_hourly: '每小时定时',
  schedule_daily: '每日定时',
  schedule_weekly: '每周定时',
  schedule_monthly: '每月定时',
}

const CHANNEL_LABEL_MAP = {
  feishu: '飞书',
  in_app: '站内消息',
}

const RECEIVER_TYPE_LABEL_MAP = {
  user: '用户',
  role: '业务角色',
  chat: '飞书群',
  demand_group: '需求绑定群',
  field: '字段映射',
}

const RECEIVER_FIELD_LABEL_MAP = {
  assignee_id: '被指派人',
  operator_id: '操作人',
  reporter_id: '提交人',
  user_id: '成员',
  owner_user_id: '负责人',
  to_owner_user_id: '新负责人',
  from_owner_user_id: '原负责人',
  project_manager_id: '项目经理',
  to_assignee_id: '新接收人',
  from_assignee_id: '原接收人',
}

const RECEIVER_FIELD_CANDIDATE_KEYS = new Set(Object.keys(RECEIVER_FIELD_LABEL_MAP))

function getReceiverFieldLabel(fieldKey) {
  const key = String(fieldKey || '').trim()
  if (!key) return ''
  return RECEIVER_FIELD_LABEL_MAP[key] || key
}

const DEFAULT_RECEIVER_FIELD_BY_EVENT = {
  demand_create: 'owner_user_id',
  demand_assign: 'to_owner_user_id',
  demand_status_change: 'owner_user_id',
  worklog_create: 'user_id',
  worklog_assign: 'to_assignee_id',
  worklog_status_change: 'user_id',
  worklog_deadline_remind: 'user_id',
  bug_assign: 'assignee_id',
  bug_create: 'assignee_id',
  bug_status_change: 'assignee_id',
  bug_fixed: 'assignee_id',
  bug_reopen: 'assignee_id',
}

const BASE_VARIABLE_OPTIONS = [
  { label: '业务线ID', value: 'business_line_id' },
  { label: '事件ID', value: 'event_id' },
  { label: '追踪ID', value: 'trace_id' },
]

const EVENT_VARIABLE_OPTIONS_BY_EVENT = {
  node_assign: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '节点ID', value: 'node_id' },
    { label: '节点名称', value: 'node_name' },
    { label: '接收人姓名', value: 'assignee_name' },
    { label: '优先级', value: 'priority' },
  ],
  node_reject: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '节点ID', value: 'node_id' },
    { label: '节点名称', value: 'node_name' },
    { label: '驳回原因', value: 'reject_reason' },
    { label: '操作人姓名', value: 'operator_name' },
  ],
  node_complete: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '节点ID', value: 'node_id' },
    { label: '节点名称', value: 'node_name' },
    { label: '完成人ID', value: 'operator_id' },
    { label: '操作人姓名', value: 'operator_name' },
  ],
  task_assign: [
    { label: '任务ID', value: 'task_id' },
    { label: '任务标题', value: 'task_title' },
    { label: '任务状态', value: 'status' },
    { label: '任务优先级', value: 'priority' },
    { label: '接收人姓名', value: 'assignee_name' },
  ],
  task_deadline: [
    { label: '任务ID', value: 'task_id' },
    { label: '任务标题', value: 'task_title' },
    { label: '剩余小时', value: 'remaining_hours' },
    { label: '任务优先级', value: 'priority' },
    { label: '接收人姓名', value: 'assignee_name' },
  ],
  task_complete: [
    { label: '任务ID', value: 'task_id' },
    { label: '任务标题', value: 'task_title' },
    { label: '任务状态', value: 'status' },
    { label: '完成人ID', value: 'operator_id' },
    { label: '操作人姓名', value: 'operator_name' },
  ],
  demand_create: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '需求状态', value: 'status' },
    { label: '优先级', value: 'priority' },
    { label: '负责人ID', value: 'owner_user_id' },
    { label: '负责人姓名', value: 'owner_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  worklog_deadline_remind: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项标题', value: 'task_title' },
    { label: '事项内容', value: 'task_content' },
    { label: '事项状态', value: 'status' },
    { label: '接收人ID', value: 'user_id' },
    { label: '接收人姓名', value: 'user_name' },
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '预计完成日期', value: 'expected_completion_date' },
    { label: '距到期小时', value: 'hours_to_deadline' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  schedule_hourly: [
    { label: '触发时间', value: 'schedule_bucket' },
  ],
  schedule_daily: [
    { label: '触发时间', value: 'schedule_bucket' },
  ],
  schedule_weekly: [
    { label: '触发时间', value: 'schedule_bucket' },
  ],
  schedule_monthly: [
    { label: '触发时间', value: 'schedule_bucket' },
  ],
  demand_assign: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '原负责人ID', value: 'from_owner_user_id' },
    { label: '原负责人姓名', value: 'from_owner_name' },
    { label: '新负责人ID', value: 'to_owner_user_id' },
    { label: '新负责人姓名', value: 'to_owner_name' },
    { label: '操作人姓名', value: 'operator_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  demand_status_change: [
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '负责人姓名', value: 'owner_name' },
    { label: '操作人姓名', value: 'operator_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  worklog_create: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项标题', value: 'task_title' },
    { label: '事项内容', value: 'task_content' },
    { label: '事项状态', value: 'status' },
    { label: '事项类型', value: 'item_type_name' },
    { label: '接收人ID', value: 'user_id' },
    { label: '接收人姓名', value: 'user_name' },
    { label: '需求ID', value: 'demand_id' },
    { label: '需求名称', value: 'demand_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  worklog_assign: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项标题', value: 'task_title' },
    { label: '原接收人ID', value: 'from_assignee_id' },
    { label: '原接收人姓名', value: 'from_assignee_name' },
    { label: '新接收人ID', value: 'to_assignee_id' },
    { label: '新接收人姓名', value: 'to_assignee_name' },
    { label: '指派人姓名', value: 'assigned_by_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  worklog_status_change: [
    { label: '事项ID', value: 'worklog_id' },
    { label: '事项标题', value: 'task_title' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '接收人姓名', value: 'user_name' },
    { label: '操作人姓名', value: 'operator_name' },
    { label: '业务线名称', value: 'business_line_name' },
  ],
  bug_create: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '缺陷编号', value: 'bug_no' },
    { label: '缺陷标题', value: 'bug_title' },
    { label: '缺陷内容', value: 'bug_content' },
    { label: '严重级别', value: 'severity' },
    { label: '优先级', value: 'priority' },
    { label: '提交人姓名', value: 'reporter_name' },
    { label: '接收人姓名', value: 'assignee_name' },
  ],
  bug_assign: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '缺陷编号', value: 'bug_no' },
    { label: '缺陷标题', value: 'bug_title' },
    { label: '缺陷内容', value: 'bug_content' },
    { label: '缺陷状态', value: 'bug_status' },
    { label: '严重级别', value: 'severity' },
    { label: '优先级', value: 'priority' },
    { label: '接收人姓名', value: 'assignee_name' },
    { label: '提交人姓名', value: 'reporter_name' },
  ],
  bug_status_change: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '缺陷编号', value: 'bug_no' },
    { label: '缺陷标题', value: 'bug_title' },
    { label: '缺陷内容', value: 'bug_content' },
    { label: '旧状态', value: 'from_status' },
    { label: '新状态', value: 'to_status' },
    { label: '操作人姓名', value: 'operator_name' },
  ],
  bug_fixed: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '缺陷编号', value: 'bug_no' },
    { label: '缺陷标题', value: 'bug_title' },
    { label: '缺陷内容', value: 'bug_content' },
    { label: '修复人ID', value: 'operator_id' },
    { label: '操作人姓名', value: 'operator_name' },
    { label: '严重级别', value: 'severity' },
  ],
  bug_reopen: [
    { label: '缺陷ID', value: 'bug_id' },
    { label: '缺陷编号', value: 'bug_no' },
    { label: '缺陷标题', value: 'bug_title' },
    { label: '缺陷内容', value: 'bug_content' },
    { label: '重开原因', value: 'reopen_reason' },
    { label: '操作人姓名', value: 'operator_name' },
    { label: '严重级别', value: 'severity' },
  ],
  weekly_report_send: [
    { label: '周报正文', value: 'weekly_summary_text' },
    { label: '周报周期', value: 'week_range' },
    { label: '部门ID', value: 'department_id' },
    { label: '成员ID', value: 'user_id' },
    { label: '成员姓名', value: 'user_name' },
  ],
  daily_report_notify: [
    { label: '提醒日期', value: 'today_date' },
    { label: '提醒分类', value: 'category_label' },
    { label: '提醒分类标识', value: 'category_key' },
    { label: '成员数量', value: 'member_count' },
    { label: '部门名称', value: 'department_name' },
    { label: '晨会视图名称', value: 'tab_label' },
    { label: '日报@块', value: 'mention_block' },
    { label: '日报@文本', value: 'mention_plain_text' },
    { label: '团队人数', value: 'summary_team_size' },
    { label: '今日有安排', value: 'summary_scheduled_users_today' },
    { label: '有安排已填报', value: 'summary_filled_users_today' },
    { label: '有安排待填报', value: 'summary_unfilled_users_today' },
    { label: '今日未安排', value: 'summary_unscheduled_users_today' },
    { label: '计划用时', value: 'summary_total_planned_hours_today' },
    { label: '实际用时', value: 'summary_total_actual_hours_today' },
  ],
}

const VARIABLE_ALIAS_BY_KEY = {
  demand_name: '需求名称',
  node_name: '节点名称',
  assignee_name: '接收人姓名',
  operator_name: '操作人姓名',
  business_line_id: '业务线ID',
  event_id: '事件ID',
  trace_id: '追踪ID',
  week_range: '周报周期',
  weekly_summary_text: '周报正文',
  department_id: '部门ID',
  department_name: '部门名称',
  user_id: '成员ID',
  tab_label: '晨会视图名称',
  priority: '优先级',
  status: '状态',
  remaining_hours: '剩余小时',
  task_id: '任务ID',
  bug_id: '缺陷ID',
  owner_user_id: '负责人ID',
  owner_name: '负责人姓名',
  from_owner_user_id: '原负责人ID',
  from_owner_name: '原负责人姓名',
  to_owner_user_id: '新负责人ID',
  to_owner_name: '新负责人姓名',
  business_line_name: '业务线名称',
  worklog_id: '事项ID',
  task_title: '标题',
  task_content: '事项内容',
  item_type_name: '事项类型',
  from_assignee_id: '原接收人ID',
  from_assignee_name: '原接收人姓名',
  to_assignee_id: '新接收人ID',
  to_assignee_name: '新接收人姓名',
  assigned_by_name: '指派人姓名',
  expected_completion_date: '预计完成日期',
  hours_to_deadline: '距到期小时',
  schedule_bucket: '触发时间',
  severity: '严重级别',
  from_status: '旧状态',
  to_status: '新状态',
  reopen_reason: '重开原因',
  operator_id: '操作人ID',
  reject_reason: '驳回原因',
  bug_no: '缺陷编号',
  bug_title: '缺陷标题',
  bug_content: '缺陷内容',
  bug_status: '缺陷状态',
  reporter_name: '提交人姓名',
  user_name: '成员姓名',
  category_key: '提醒分类标识',
  category_label: '提醒分类',
  member_count: '成员数量',
  mention_block: '日报@块',
  mention_plain_text: '日报@文本',
  summary_team_size: '团队人数',
  summary_scheduled_users_today: '今日有安排',
  summary_filled_users_today: '有安排已填报',
  summary_unfilled_users_today: '有安排待填报',
  summary_unscheduled_users_today: '今日未安排',
  summary_total_planned_hours_today: '计划用时',
  summary_total_actual_hours_today: '实际用时',
  today_date: '提醒日期',
}

const VARIABLE_KEY_BY_ALIAS = Object.entries(VARIABLE_ALIAS_BY_KEY).reduce((acc, [key, alias]) => {
  if (alias && !acc[alias]) acc[alias] = key
  return acc
}, {})

function safeParseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function splitCommaValues(input) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function storageTextToMentionsText(value) {
  return String(value || '').replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_, key) => {
    return `@${VARIABLE_ALIAS_BY_KEY[key] || key}`
  })
}

function mentionsTextToStorageText(value) {
  return String(value || '').replace(/@([A-Za-z0-9_.\u4e00-\u9fa5]+)/g, (_, token) => {
    const normalizedToken = String(token || '').trim()
    const fieldKey = VARIABLE_KEY_BY_ALIAS[normalizedToken] || normalizedToken
    return `\${${fieldKey}}`
  })
}

function parseConditionFromJson(conditionConfigJson, sceneCode = '') {
  const condition = safeParseJson(conditionConfigJson, null)
  const normalized = condition && typeof condition === 'object' ? condition : {}
  const triggerMode = String(normalized.trigger_mode || '').trim().toLowerCase() || 'event'
  const fieldCondition = normalized.field_condition && typeof normalized.field_condition === 'object'
    ? normalized.field_condition
    : normalized

  const first = fieldCondition?.items?.[0]
  const hasFieldCondition = Boolean(first && typeof first === 'object')
  const operator = String(first?.operator || 'eq')
  const value =
    operator === 'in' || operator === 'nin'
      ? (Array.isArray(first?.value) ? first.value.join(', ') : '')
      : first?.value === undefined || first?.value === null
        ? ''
        : String(first.value)

  const scheduleConfig = normalized.schedule && typeof normalized.schedule === 'object' ? normalized.schedule : {}
  const deadlineConfig = normalized.deadline && typeof normalized.deadline === 'object' ? normalized.deadline : {}
  const normalizedSceneCode = String(sceneCode || '').toLowerCase()
  const fallbackScheduleFrequency = normalizedSceneCode === 'schedule_hourly'
    ? 'hourly'
    : normalizedSceneCode === 'schedule_weekly'
      ? 'weekly'
      : normalizedSceneCode === 'schedule_monthly'
        ? 'monthly'
        : 'daily'

  return {
    trigger_mode: triggerMode,
    schedule_event_type: String(scheduleConfig.event_type || ''),
    condition_enabled: hasFieldCondition,
    condition_field: first?.field || undefined,
    condition_operator: operator,
    condition_value: value,
    schedule_frequency: String(scheduleConfig.frequency || fallbackScheduleFrequency),
    schedule_interval_hours: Number(scheduleConfig.interval_hours || 1),
    schedule_hour: Number(scheduleConfig.hour || 9),
    schedule_minute: Number(scheduleConfig.minute || 0),
    schedule_weekdays: Array.isArray(scheduleConfig.weekdays) && scheduleConfig.weekdays.length > 0 ? scheduleConfig.weekdays : [1],
    schedule_day_of_month: Number(scheduleConfig.day_of_month || 1),
    schedule_timezone: String(scheduleConfig.timezone || 'Asia/Shanghai'),
    deadline_target: String(deadlineConfig.target || 'worklog'),
    deadline_offset_type: String(deadlineConfig.offset_type || 'before'),
    deadline_offset_value: Number(deadlineConfig.offset_value || 2),
    deadline_offset_unit: String(deadlineConfig.offset_unit || 'hour'),
    deadline_window_minutes: Number(deadlineConfig.window_minutes || 5),
  }
}

function parseDedupFromJson(dedupConfigJson) {
  const dedup = safeParseJson(dedupConfigJson, null)
  if (!dedup || typeof dedup !== 'object') {
    return {
      dedup_enabled: false,
      dedup_window_sec: 300,
      dedup_key_fields: ['event_type'],
    }
  }

  return {
    dedup_enabled: true,
    dedup_window_sec: Number(dedup.window_sec || 300),
    dedup_key_fields: Array.isArray(dedup.key_fields) && dedup.key_fields.length > 0 ? dedup.key_fields : ['event_type'],
  }
}

function parseReceiverFromJson(receiverConfigJson) {
  const receiver = safeParseJson(receiverConfigJson, {})
  const roleValues = Array.isArray(receiver?.business_roles)
    ? receiver.business_roles.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const legacyRoleValues = Array.isArray(receiver?.roles)
    ? receiver.roles.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
    : []
  const userValues = Array.isArray(receiver?.user_ids)
    ? receiver.user_ids.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
    : Array.isArray(receiver?.users)
      ? receiver.users.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
      : []

  const chatValues = Array.isArray(receiver?.chat_ids)
    ? receiver.chat_ids.map((item) => String(item || '').trim()).filter(Boolean)
    : []

  return {
    receiver_roles: legacyRoleValues.length > 0 ? legacyRoleValues : roleValues,
    receiver_users: userValues,
    receiver_chat_ids: chatValues,
    receiver_use_demand_bound_chat: receiver?.use_demand_bound_chat === true,
    receiver_field_user_id: String(receiver?.user_id_field || '').trim(),
  }
}

function normalizeRuleFormValue(rule) {
  const receiverForm = parseReceiverFromJson(rule?.receiver_config_json || {})
  const conditionForm = parseConditionFromJson(rule?.condition_config_json, rule?.scene_code)
  const dedupForm = parseDedupFromJson(rule?.dedup_config_json)

  return {
    rule_name: rule?.rule_name || '',
    scene_code: rule?.scene_code || '',
    message_title: storageTextToMentionsText(rule?.message_title || ''),
    message_content: storageTextToMentionsText(rule?.message_content || ''),
    business_line_id: rule?.business_line_id ?? undefined,
    channel_type: rule?.channel_type || 'feishu',
    receiver_type: rule?.receiver_type || 'role',
    ...receiverForm,
    ...conditionForm,
    ...dedupForm,
    retry_count: Number(rule?.retry_count || 0),
    retry_interval_sec: rule?.retry_interval_sec ?? undefined,
    priority: Number(rule?.priority || 0),
    remark: rule?.remark || '',
    is_enabled: Number(rule?.is_enabled) === 1,
  }
}

function generateRuleCode(sceneCode) {
  const scene = String(sceneCode || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'event'
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).slice(2, 8)
  return `n_rule_${scene}_${timestamp}_${randomPart}`.slice(0, 64)
}

function buildMockEventData(sceneCode, businessLineId, now) {
  const base = {
    trace_id: `trace_${now}`,
    event_id: `evt_${now}`,
    business_line_id: businessLineId || undefined,
  }

  if (sceneCode === 'bug_assign') {
    return {
      ...base,
      bug_id: 10001,
      demand_id: 'REQ20260407001',
      assignee_id: 96,
      bug_no: 'BUG-10001',
      bug_title: '登录后偶发白屏',
      bug_content: '用户点击“工作台”后页面偶发白屏，需要刷新恢复。',
      bug_status: '待处理',
      severity: 'high',
      priority: 'P1',
      assignee_name: '张三',
      reporter_name: '李四',
    }
  }

  if (sceneCode === 'demand_create') {
    return {
      ...base,
      demand_id: 'REQ20260403001',
      demand_name: '通知中心联通需求',
      status: 'TODO',
      priority: 'P1',
      owner_user_id: 80,
      owner_name: '权贝鑫',
      operator_name: '管理员',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'demand_assign') {
    return {
      ...base,
      demand_id: 'REQ20260403002',
      demand_name: '飞书通知接入',
      from_owner_user_id: 80,
      from_owner_name: '权贝鑫',
      to_owner_user_id: 96,
      to_owner_name: 'bpf',
      operator_name: '管理员',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'demand_status_change') {
    return {
      ...base,
      demand_id: 'REQ20260403003',
      demand_name: '需求状态流转联调',
      from_status: 'TODO',
      to_status: 'IN_PROGRESS',
      owner_name: '权贝鑫',
      operator_name: '管理员',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'worklog_create') {
    return {
      ...base,
      worklog_id: 9001,
      task_title: '补充需求评审纪要',
      task_content: '梳理本周需求评审结论并更新文档',
      status: 'IN_PROGRESS',
      item_type_name: '需求开发',
      user_id: 96,
      user_name: 'bpf',
      demand_id: 'REQ20260403005',
      demand_name: '通知中心优化',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'worklog_assign') {
    return {
      ...base,
      worklog_id: 9002,
      task_title: '补齐通知联调',
      from_assignee_id: 80,
      from_assignee_name: '权贝鑫',
      to_assignee_id: 96,
      to_assignee_name: 'bpf',
      assigned_by_name: '管理员',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'worklog_status_change') {
    return {
      ...base,
      worklog_id: 9003,
      task_title: '修复消息发送异常',
      from_status: 'TODO',
      to_status: 'DONE',
      user_name: 'bpf',
      operator_name: '管理员',
      business_line_name: '零售业务线',
    }
  }

  if (sceneCode === 'worklog_deadline_remind') {
    return {
      ...base,
      worklog_id: 9004,
      task_title: '本周回归测试',
      task_content: '完成本周核心流程回归',
      status: 'IN_PROGRESS',
      user_id: 96,
      user_name: 'bpf',
      demand_id: 'REQ20260403008',
      demand_name: '通知中心稳定性优化',
      expected_completion_date: '2026-04-05',
      hours_to_deadline: 2,
      business_line_name: '零售业务线',
    }
  }

  if (
    sceneCode === 'schedule_hourly' ||
    sceneCode === 'schedule_daily' ||
    sceneCode === 'schedule_weekly' ||
    sceneCode === 'schedule_monthly'
  ) {
    return {
      ...base,
      schedule_bucket: new Date(now).toISOString(),
    }
  }

  if (sceneCode === 'bug_create') {
    return {
      ...base,
      bug_id: 10000,
      demand_id: 'REQ20260407001',
      bug_no: 'BUG-10000',
      bug_title: '提交后提示成功但数据未落库',
      bug_content: '在创建需求时，页面提示成功，但刷新后记录不存在。',
      severity: 'high',
      priority: 'P1',
      reporter_name: '李四',
      assignee_name: '张三',
    }
  }

  if (sceneCode === 'bug_status_change') {
    return {
      ...base,
      bug_id: 10002,
      demand_id: 'REQ20260407001',
      bug_no: 'BUG-10002',
      bug_title: '筛选条件切换后数据未刷新',
      bug_content: '切换业务线筛选条件后，列表仍显示旧数据。',
      from_status: '处理中',
      to_status: '待验证',
      operator_name: '王五',
    }
  }

  if (sceneCode === 'bug_fixed') {
    return {
      ...base,
      bug_id: 10003,
      demand_id: 'REQ20260407001',
      bug_no: 'BUG-10003',
      bug_title: '导出按钮无响应',
      bug_content: '点击导出后无下载动作，控制台无报错。',
      severity: 'medium',
      operator_id: 12,
      operator_name: '赵六',
    }
  }

  if (sceneCode === 'bug_reopen') {
    return {
      ...base,
      bug_id: 10004,
      demand_id: 'REQ20260407001',
      bug_no: 'BUG-10004',
      bug_title: '详情页评论重复展示',
      bug_content: '同一条评论在详情页出现两次。',
      severity: 'medium',
      reopen_reason: '回归测试复现',
      operator_name: '钱七',
    }
  }

  if (sceneCode === 'weekly_report_send') {
    return {
      ...base,
      week_range: '2026-03-30 ~ 2026-04-02',
      department_id: 2,
      user_id: 1,
      user_name: '权贝鑫',
      weekly_summary_text: [
        '【个人周报】2026-03-30 ~ 2026-04-02',
        '事项总数: 6（待开始 1 / 进行中 3 / 已完成 2）',
        '计划用时: 18.5h',
        '实际用时: 17.0h',
        '偏差: -1.5h（-8.1%）',
      ].join('\n'),
    }
  }

  if (sceneCode === 'task_assign' || sceneCode === 'task_deadline' || sceneCode === 'task_complete') {
    return {
      ...base,
      task_id: 8801,
      task_title: '通知中心联调',
      status: sceneCode === 'task_complete' ? '已完成' : '进行中',
      priority: 'high',
      remaining_hours: 8,
      assignee_name: '测试用户',
      operator_name: '管理员',
    }
  }

  if (sceneCode === 'node_assign' || sceneCode === 'node_reject' || sceneCode === 'node_complete') {
    return {
      ...base,
      demand_id: 'D-2026-001',
      demand_name: '通知中心测试需求',
      node_id: 321,
      node_name: '测试节点',
      assignee_id: 96,
      assignee_name: '测试用户',
      operator_name: '管理员',
      reject_reason: sceneCode === 'node_reject' ? '信息不完整' : undefined,
      operator_id: 1,
    }
  }

  return base
}

function NotificationRulesPage() {
  const screens = Grid.useBreakpoint()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [chatOptionsLoading, setChatOptionsLoading] = useState(false)
  const [feishuChatOptions, setFeishuChatOptions] = useState([])
  const [keyword, setKeyword] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [sendingRuleId, setSendingRuleId] = useState(null)
  const [togglingRuleId, setTogglingRuleId] = useState(null)
  const [sendControlLoading, setSendControlLoading] = useState(false)
  const [sendControlSaving, setSendControlSaving] = useState(false)
  const [sendControlMode, setSendControlMode] = useState('shadow')
  const [sendControlOpenIds, setSendControlOpenIds] = useState([])
  const [sendControlSelectedUserIds, setSendControlSelectedUserIds] = useState([])
  const [sendControlChatIds, setSendControlChatIds] = useState([])
  const [form] = Form.useForm()
  const selectedEventType = Form.useWatch('scene_code', form)
  const selectedScheduleEventType = Form.useWatch('schedule_event_type', form)
  const selectedReceiverType = Form.useWatch('receiver_type', form)
  const selectedReceiverRoles = Form.useWatch('receiver_roles', form)
  const selectedReceiverUsers = Form.useWatch('receiver_users', form)
  const selectedReceiverChatIds = Form.useWatch('receiver_chat_ids', form)
  const selectedReceiverFieldUserId = Form.useWatch('receiver_field_user_id', form)
  const selectedTriggerMode = Form.useWatch('trigger_mode', form)
  const selectedScheduleFrequency = Form.useWatch('schedule_frequency', form)
  const effectiveEventType = useMemo(() => {
    if (String(selectedTriggerMode || 'event') === 'schedule') {
      return String(selectedScheduleEventType || '').trim()
    }
    return String(selectedEventType || '').trim()
  }, [selectedEventType, selectedScheduleEventType, selectedTriggerMode])
  const conditionEnabled = Form.useWatch('condition_enabled', form)
  const selectedConditionOperator = Form.useWatch('condition_operator', form)
  const isConditionValueRequired =
    selectedTriggerMode === 'event' && !CONDITION_OPERATORS_WITHOUT_VALUE.has(String(selectedConditionOperator || ''))

  const activeConditionFieldOptions = useMemo(
    () => CONDITION_FIELD_OPTIONS_BY_EVENT[effectiveEventType] || DEFAULT_CONDITION_FIELD_OPTIONS,
    [effectiveEventType],
  )
  const variableMentionOptions = useMemo(() => {
    const eventVars = EVENT_VARIABLE_OPTIONS_BY_EVENT[effectiveEventType] || []
    const merged = [...BASE_VARIABLE_OPTIONS, ...eventVars]
    const dedup = new Map()
    merged.forEach((item) => {
      if (!item?.value || dedup.has(item.value)) return
      dedup.set(item.value, {
        value: item.label,
        label: item.label,
      })
    })
    return Array.from(dedup.values())
  }, [effectiveEventType])
  const receiverFieldOptions = useMemo(() => {
    const eventVars = EVENT_VARIABLE_OPTIONS_BY_EVENT[effectiveEventType] || []
    const vars = eventVars.filter((item) => RECEIVER_FIELD_CANDIDATE_KEYS.has(String(item?.value || '').trim()))
    const merged = [
      ...Array.from(RECEIVER_FIELD_CANDIDATE_KEYS).map((key) => ({ label: getReceiverFieldLabel(key), value: key })),
      ...vars.map((item) => ({
        label: getReceiverFieldLabel(item.value),
        value: String(item.value || ''),
      })),
    ]
    const dedup = new Map()
    merged.forEach((item) => {
      if (!item?.value || dedup.has(item.value)) return
      dedup.set(item.value, item)
    })
    return Array.from(dedup.values())
  }, [effectiveEventType])
  const receiverRoleOptions = useMemo(() => {
    return String(effectiveEventType || '').trim().toLowerCase() === 'daily_report_notify'
      ? DAILY_REPORT_BUSINESS_ROLE_OPTIONS
      : BASE_BUSINESS_ROLE_OPTIONS
  }, [effectiveEventType])
  const filteredEventTypeOptions = useMemo(() => {
    const triggerMode = String(selectedTriggerMode || 'event')
    if (triggerMode === 'schedule') return []
    const filterOption = (option) => {
      const value = String(option?.value || '')
      if (triggerMode === 'deadline') {
        return value === 'worklog_deadline_remind'
      }
      return true
    }

    return EVENT_TYPE_GROUPED_OPTIONS.map((group) => ({
      label: group.label,
      options: (group.options || []).filter((option) => filterOption(option)),
    })).filter((group) => Array.isArray(group.options) && group.options.length > 0)
  }, [selectedTriggerMode])
  const scheduleBusinessEventTypeOptions = useMemo(
    () =>
      EVENT_TYPE_GROUPED_OPTIONS.map((group) => ({
        label: group.label,
        options: (group.options || []).filter((option) => String(option?.value || '') !== 'worklog_deadline_remind'),
      })).filter((group) => Array.isArray(group.options) && group.options.length > 0),
    [],
  )
  const selectedTriggerModeTip = useMemo(() => {
    const triggerMode = String(selectedTriggerMode || 'event')
    if (triggerMode === 'schedule') {
      return '当前为按时间触发：通过计划周期设置触发时间，并选择业务事件类型。'
    }
    if (triggerMode === 'deadline') {
      return '当前为按到期触发，仅可选择“事项到期提醒”事件。'
    }
    return '当前为按字段触发，可选择业务事件类型。'
  }, [selectedTriggerMode])

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getNotificationRulesApi({ keyword })
      if (!result?.success) {
        message.error(result?.message || '获取规则失败')
        return
      }
      setRules(Array.isArray(result?.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取规则失败')
    } finally {
      setLoading(false)
    }
  }, [keyword])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const loadSendControl = useCallback(async () => {
    setSendControlLoading(true)
    try {
      const result = await getNotificationSendControlApi()
      if (!result?.success) {
        message.error(result?.message || '获取发送控制配置失败')
        return
      }
      const data = result.data || {}
      setSendControlMode(String(data.mode || 'shadow'))
      setSendControlOpenIds(Array.isArray(data.whitelist_open_ids) ? data.whitelist_open_ids : [])
      setSendControlChatIds(Array.isArray(data.whitelist_chat_ids) ? data.whitelist_chat_ids : [])
    } catch (error) {
      message.error(error?.message || '获取发送控制配置失败')
    } finally {
      setSendControlLoading(false)
    }
  }, [])

  const loadFeishuChatOptions = useCallback(async (keywordText = '') => {
    setChatOptionsLoading(true)
    try {
      const result = await getFeishuChatOptionsApi({
        page_size: 100,
        keyword: keywordText || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取飞书群失败')
        return
      }

      const items = Array.isArray(result?.data?.items) ? result.data.items : []
      const options = items.map((item) => {
        const chatId = String(item?.chat_id || '').trim()
        const name = String(item?.name || '').trim() || chatId
        return {
          label: `${name}（${chatId}）`,
          value: chatId,
        }
      })
      setFeishuChatOptions(options)
    } catch (error) {
      message.error(error?.message || '获取飞书群失败')
    } finally {
      setChatOptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSendControl()
  }, [loadSendControl])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const result = await getUsersApi({ page: 1, pageSize: 300 })
        if (!active || !result?.success) return

        const list = Array.isArray(result?.data?.list) ? result.data.list : []
        const options = list
          .map((item) => ({
            label: item?.real_name ? `${item.real_name} (${item.username || item.id})` : String(item?.username || item?.id || ''),
            value: Number(item?.id || 0),
            openId: String(item?.feishu_open_id || item?.feishuOpenId || '').trim(),
          }))
          .filter((item) => item.label && Number.isInteger(item.value) && item.value > 0)

        setUserOptions(options)
      } catch {
        // keep page usable even if user options fail
      }
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const openIdToUserId = new Map()
    userOptions.forEach((item) => {
      const openId = String(item?.openId || '').trim()
      if (!openId) return
      openIdToUserId.set(openId, item.value)
    })

    const selected = Array.from(
      new Set(
        (sendControlOpenIds || [])
          .map((openId) => openIdToUserId.get(String(openId || '').trim()))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    )
    setSendControlSelectedUserIds(selected)
  }, [sendControlOpenIds, userOptions])

  const handleSendControlUsersChange = (userIds) => {
    const ids = Array.isArray(userIds) ? userIds : []
    setSendControlSelectedUserIds(ids)

    const userIdToOpenId = new Map()
    userOptions.forEach((item) => {
      if (!Number.isInteger(item?.value) || item.value <= 0) return
      const openId = String(item?.openId || '').trim()
      if (!openId) return
      userIdToOpenId.set(item.value, openId)
    })
    const openIds = Array.from(
      new Set(
        ids
          .map((id) => userIdToOpenId.get(id))
          .filter((item) => Boolean(item)),
      ),
    )
    setSendControlOpenIds(openIds)
  }

  const sendControlUserWhitelistOptions = useMemo(
    () =>
      userOptions
        .filter((item) => Boolean(String(item?.openId || '').trim()))
        .map((item) => ({
          label: `${item.label}（已绑定飞书账号）`,
          value: item.value,
        })),
    [userOptions],
  )

  const unmatchedWhitelistOpenIdCount = useMemo(() => {
    const matchedOpenIds = new Set(
      userOptions
        .map((item) => String(item?.openId || '').trim())
        .filter(Boolean),
    )
    return (sendControlOpenIds || []).filter((item) => !matchedOpenIds.has(String(item || '').trim())).length
  }, [sendControlOpenIds, userOptions])
  const receiverSummaryText = useMemo(() => {
    const receiverType = String(selectedReceiverType || 'role')
    if (receiverType === 'demand_group') {
      return '需求绑定群（系统自动识别）'
    }
    if (receiverType === 'field') {
      const fieldLabel = getReceiverFieldLabel(selectedReceiverFieldUserId)
      return fieldLabel ? `字段映射：${fieldLabel}` : '字段映射'
    }
    if (receiverType === 'chat') {
      const ids = Array.isArray(selectedReceiverChatIds) ? selectedReceiverChatIds : []
      return ids.length > 0 ? `飞书群 ${ids.length} 个` : '飞书群（未选择）'
    }
    if (receiverType === 'user') {
      const selectedIds = new Set(Array.isArray(selectedReceiverUsers) ? selectedReceiverUsers : [])
      const names = userOptions
        .filter((item) => selectedIds.has(item.value))
        .map((item) => item.label)
      return names.length > 0 ? `用户：${names.join('、')}` : '用户（未选择）'
    }
    const roles = Array.isArray(selectedReceiverRoles) ? selectedReceiverRoles : []
    const roleLabels = roles.map((item) => BUSINESS_ROLE_LABEL_MAP[item] || item).filter(Boolean)
    return roleLabels.length > 0 ? `业务角色：${roleLabels.join('、')}` : '业务角色（未选择）'
  }, [
    selectedReceiverType,
    selectedReceiverFieldUserId,
    selectedReceiverChatIds,
    selectedReceiverUsers,
    selectedReceiverRoles,
    userOptions,
  ])

  useEffect(() => {
    const currentField = form.getFieldValue('condition_field')
    if (!currentField) return

    const exists = activeConditionFieldOptions.some((item) => item.value === currentField)
    if (!exists) {
      form.setFieldValue('condition_field', undefined)
    }
  }, [activeConditionFieldOptions, form])

  useEffect(() => {
    if (selectedTriggerMode !== 'event') return
    if (isConditionValueRequired) return
    form.setFieldValue('condition_value', undefined)
  }, [form, isConditionValueRequired, selectedTriggerMode])

  useEffect(() => {
    const receiverType = String(selectedReceiverType || 'role')
    if (receiverType === 'field') {
      form.setFieldsValue({
        receiver_roles: [],
        receiver_users: [],
        receiver_chat_ids: [],
        receiver_use_demand_bound_chat: false,
      })
      return
    }
    if (receiverType === 'chat') {
      form.setFieldsValue({
        receiver_roles: [],
        receiver_users: [],
        receiver_field_user_id: undefined,
        receiver_use_demand_bound_chat: false,
      })
      return
    }
    if (receiverType === 'demand_group') {
      form.setFieldsValue({
        receiver_roles: [],
        receiver_users: [],
        receiver_chat_ids: [],
        receiver_field_user_id: undefined,
        receiver_use_demand_bound_chat: true,
      })
      return
    }
    if (receiverType === 'user') {
      form.setFieldsValue({
        receiver_roles: [],
        receiver_chat_ids: [],
        receiver_field_user_id: undefined,
        receiver_use_demand_bound_chat: false,
      })
      return
    }
    form.setFieldsValue({
      receiver_users: [],
      receiver_chat_ids: [],
      receiver_field_user_id: undefined,
      receiver_use_demand_bound_chat: false,
    })
  }, [form, selectedReceiverType])

  useEffect(() => {
    if (selectedReceiverType !== 'chat') return
    if (feishuChatOptions.length > 0) return
    loadFeishuChatOptions()
  }, [selectedReceiverType, feishuChatOptions.length, loadFeishuChatOptions])

  useEffect(() => {
    if (selectedReceiverType !== 'field') return
    const current = String(form.getFieldValue('receiver_field_user_id') || '').trim()
    if (current) return
    const nextDefault = DEFAULT_RECEIVER_FIELD_BY_EVENT[effectiveEventType] || 'operator_id'
    form.setFieldValue('receiver_field_user_id', nextDefault)
  }, [effectiveEventType, form, selectedReceiverType])

  const hasReceiverRoleOptions = receiverRoleOptions.length > 0

  useEffect(() => {
    if (selectedReceiverType !== 'role') return
    if (!hasReceiverRoleOptions) return
    const currentRoles = Array.isArray(form.getFieldValue('receiver_roles'))
      ? form.getFieldValue('receiver_roles')
      : []
    if (currentRoles.length === 0) return

    const normalizedEventType = String(effectiveEventType || '').trim().toLowerCase()
    if (!normalizedEventType) return

    const optionValues = new Set(receiverRoleOptions.map((item) => item.value))
    const hasMismatch = currentRoles.some((role) => !optionValues.has(role))
    if (!hasMismatch) return

    const isDailyReportEvent = normalizedEventType === 'daily_report_notify'
    const allDailyRoles = currentRoles.every((role) => String(role || '').startsWith('daily_report_'))
    if (isDailyReportEvent && allDailyRoles) {
      // 等待 daily_report 选项加载完成后再校验，避免初始化时被清空
      return
    }

    const filteredRoles = currentRoles.filter((role) => optionValues.has(role))
    form.setFieldValue('receiver_roles', filteredRoles)
  }, [receiverRoleOptions, form, selectedReceiverType, effectiveEventType, hasReceiverRoleOptions])

  useEffect(() => {
    if (String(selectedTriggerMode || 'event') !== 'schedule') return
    const currentScheduleEventType = String(form.getFieldValue('schedule_event_type') || '').trim()
    if (currentScheduleEventType) return

    const currentSceneCode = String(form.getFieldValue('scene_code') || '').trim()
    if (!currentSceneCode) return
    if (currentSceneCode.startsWith('schedule_')) return
    if (currentSceneCode === 'worklog_deadline_remind') return

    form.setFieldValue('schedule_event_type', currentSceneCode)
  }, [form, selectedTriggerMode])

  useEffect(() => {
    if (String(selectedTriggerMode || 'event') !== 'schedule') return
    const frequency = String(selectedScheduleFrequency || 'daily')
    const nextSceneCode = SCHEDULE_SCENE_CODE_BY_FREQUENCY[frequency] || 'schedule_daily'
    const currentSceneCode = String(form.getFieldValue('scene_code') || '')
    if (currentSceneCode === nextSceneCode) return
    form.setFieldValue('scene_code', nextSceneCode)
  }, [form, selectedScheduleFrequency, selectedTriggerMode])

  useEffect(() => {
    const sceneCode = String(form.getFieldValue('scene_code') || '')
    const triggerMode = String(selectedTriggerMode || 'event')
    if (!sceneCode) {
      if (triggerMode === 'event') {
        const scheduleEventType = String(form.getFieldValue('schedule_event_type') || '').trim()
        if (scheduleEventType && scheduleEventType !== 'worklog_deadline_remind') {
          form.setFieldValue('scene_code', scheduleEventType)
        }
      }
      return
    }

    if (triggerMode === 'deadline' && sceneCode !== 'worklog_deadline_remind') {
      form.setFieldValue('scene_code', undefined)
      return
    }
    if (triggerMode === 'event' && sceneCode.startsWith('schedule_')) {
      const scheduleEventType = String(form.getFieldValue('schedule_event_type') || '').trim()
      form.setFieldValue(
        'scene_code',
        scheduleEventType && scheduleEventType !== 'worklog_deadline_remind' ? scheduleEventType : undefined,
      )
    }
  }, [form, selectedTriggerMode])

  const openCreate = () => {
    setEditingRule(null)
    form.setFieldsValue(normalizeRuleFormValue(null))
    setDrawerOpen(true)
  }

  const openEdit = (rule) => {
    setEditingRule(rule)
    form.setFieldsValue(normalizeRuleFormValue(rule))
    setDrawerOpen(true)
  }

  const handleDelete = async (rule) => {
    try {
      const result = await deleteNotificationRuleApi(rule.id)
      if (!result?.success) {
        message.error(result?.message || '删除失败')
        return
      }
      message.success('删除成功')
      loadRules()
    } catch (error) {
      message.error(error?.message || '删除失败')
    }
  }

  const handleSaveSendControl = async () => {
    setSendControlSaving(true)
    const result = await updateNotificationSendControlApi({
      mode: sendControlMode,
      whitelist_open_ids: sendControlOpenIds,
      whitelist_chat_ids: sendControlChatIds,
    })
    setSendControlSaving(false)

    if (!result?.success) {
      message.error(result?.message || '保存发送控制配置失败')
      return
    }
    message.success('发送控制配置已保存')
    loadSendControl()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()

    const selectedRoles = Array.isArray(values.receiver_roles) ? values.receiver_roles : []
    const selectedUsers = Array.isArray(values.receiver_users) ? values.receiver_users : []
    const selectedChatIds = Array.isArray(values.receiver_chat_ids)
      ? values.receiver_chat_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    let receiverConfig = {}
    if (values.receiver_type === 'field') {
      receiverConfig = {
        user_id_field: String(values.receiver_field_user_id || '').trim() || 'operator_id',
      }
    } else if (values.receiver_type === 'demand_group') {
      receiverConfig = {
        use_demand_bound_chat: true,
      }
    } else if (values.receiver_type === 'chat') {
      receiverConfig = {
        chat_ids: selectedChatIds,
      }
    } else if (values.receiver_type === 'user') {
      receiverConfig = {
        user_ids: selectedUsers,
      }
    } else {
      receiverConfig = {
        business_roles: selectedRoles,
      }
    }

    if (values.receiver_type === 'role' && selectedRoles.length === 0) {
      message.error('请至少选择一个业务角色')
      return
    }
    if (values.receiver_type === 'user' && selectedUsers.length === 0) {
      message.error('请至少选择一个接收用户')
      return
    }
    if (values.receiver_type === 'chat' && selectedChatIds.length === 0) {
      message.error('请至少选择一个接收飞书群')
      return
    }

    const triggerMode = String(values.trigger_mode || 'event')

    let fieldCondition = null
    if (values.condition_enabled) {
      if (selectedTriggerMode === 'event') {
        if (!values.condition_field) {
          message.error('请先选择条件字段')
          return
        }
        if (!values.condition_operator) {
          message.error('请先选择条件运算符')
          return
        }
      }

      if (values.condition_field && values.condition_operator) {
        const operator = values.condition_operator
        const needsConditionValue = !CONDITION_OPERATORS_WITHOUT_VALUE.has(String(operator))

        if (
          needsConditionValue &&
          (values.condition_value === undefined ||
            values.condition_value === null ||
            String(values.condition_value).trim() === '')
        ) {
          message.error('请先填写条件值')
          return
        }

        const conditionValue =
          !needsConditionValue
            ? null
            : operator === 'in' || operator === 'nin'
              ? splitCommaValues(values.condition_value)
              : String(values.condition_value).trim()

        fieldCondition = {
          logic: 'and',
          items: [
            {
              field: values.condition_field,
              operator,
              value: conditionValue,
            },
          ],
        }
      }
    }

    let conditionConfig = null
    if (triggerMode === 'event') {
      conditionConfig = fieldCondition
    } else if (triggerMode === 'schedule') {
      const frequency = String(values.schedule_frequency || 'daily')
      conditionConfig = {
        trigger_mode: 'schedule',
        schedule: {
          event_type: String(values.schedule_event_type || ''),
          frequency,
          timezone: String(values.schedule_timezone || 'Asia/Shanghai'),
          interval_hours: Number(values.schedule_interval_hours || 1),
          hour: Number(values.schedule_hour || 9),
          minute: Number(values.schedule_minute || 0),
          weekdays: Array.isArray(values.schedule_weekdays) ? values.schedule_weekdays : [1],
          day_of_month: Number(values.schedule_day_of_month || 1),
        },
        field_condition: fieldCondition,
      }
    } else if (triggerMode === 'deadline') {
      conditionConfig = {
        trigger_mode: 'deadline',
        deadline: {
          target: String(values.deadline_target || 'worklog'),
          offset_type: String(values.deadline_offset_type || 'before'),
          offset_value: Number(values.deadline_offset_value || 2),
          offset_unit: String(values.deadline_offset_unit || 'hour'),
          window_minutes: Number(values.deadline_window_minutes || 5),
        },
        field_condition: fieldCondition,
      }
    }

    const dedupConfig = values.dedup_enabled
      ? {
          window_sec: Number(values.dedup_window_sec || 300),
          key_fields:
            Array.isArray(values.dedup_key_fields) && values.dedup_key_fields.length > 0
              ? values.dedup_key_fields
              : ['event_type'],
        }
      : null

    const payload = {
      rule_code: editingRule?.rule_code || generateRuleCode(values.scene_code),
      rule_name: values.rule_name,
      scene_code: values.scene_code,
      message_title: mentionsTextToStorageText(values.message_title),
      message_content: mentionsTextToStorageText(values.message_content),
      business_line_id: null,
      channel_type: values.channel_type,
      receiver_type: values.receiver_type,
      receiver_config_json: receiverConfig,
      condition_config_json: conditionConfig,
      dedup_config_json: dedupConfig,
      retry_count: Number(values.retry_count || 0),
      retry_interval_sec: values.retry_interval_sec ?? null,
      priority: Number(values.priority || 0),
      remark: values.remark || null,
      is_enabled: values.is_enabled ? 1 : 0,
    }

    const sceneCode = String(values.scene_code || '')
    if (triggerMode === 'schedule' && !sceneCode.startsWith('schedule_')) {
      message.error('按时间触发时，请选择“每小时/每日/每周/每月定时”事件类型')
      return
    }
    if (triggerMode === 'schedule' && !String(values.schedule_event_type || '').trim()) {
      message.error('按时间触发时，请选择业务事件类型')
      return
    }
    if (triggerMode === 'deadline' && sceneCode !== 'worklog_deadline_remind') {
      message.error('按到期触发时，请选择“事项到期提醒”事件类型')
      return
    }

    setSaving(true)
    const result = editingRule
      ? await updateNotificationRuleApi(editingRule.id, payload)
      : await createNotificationRuleApi(payload)

    setSaving(false)
    if (!result?.success) {
      message.error(result?.message || (editingRule ? '更新失败' : '创建失败'))
      return
    }

    message.success(editingRule ? '更新成功' : '创建成功')
    setDrawerOpen(false)
    loadRules()
  }

  const handleTestSend = async (rule) => {
    if (!rule?.scene_code) {
      message.error('当前规则缺少 scene_code，无法试发')
      return
    }

    setSendingRuleId(rule.id)
    const now = Date.now()
    const conditionConfig = safeParseJson(rule?.condition_config_json, null)
    const triggerMode = String(conditionConfig?.trigger_mode || '').toLowerCase()
    const scheduleEventType = String(conditionConfig?.schedule?.event_type || '').trim()
    const testEventType =
      triggerMode === 'schedule' && scheduleEventType ? scheduleEventType : String(rule.scene_code)
    const baseData = buildMockEventData(testEventType, rule.business_line_id, now)
    const contextData =
      triggerMode === 'schedule'
        ? {
            __schedule_context: {
              matched: true,
              trigger_time: new Date(now).toISOString(),
            },
          }
        : triggerMode === 'deadline'
          ? {
              __deadline_context: {
                matched: true,
                trigger_time: new Date(now).toISOString(),
              },
            }
          : {}
    const payload = {
      eventType: testEventType,
      data: {
        ...baseData,
        ...contextData,
      },
    }

    const result = await triggerNotificationEventApi(payload)
    setSendingRuleId(null)

    if (!result?.success) {
      message.error(result?.message || '试发失败')
      return
    }

    const processed = Number(result?.data?.processed_count || 0)
    const matched = Number(result?.data?.matched_count || 0)
    const resultItems = Array.isArray(result?.data?.results) ? result.data.results : []
    const failedItems = resultItems.filter((item) => item?.status === 'failed')
    const skippedItems = resultItems.filter((item) => item?.status === 'skipped')
    const partialItems = resultItems.filter((item) => item?.status === 'partial_success')

    if (processed === 0 || matched === 0) {
      message.warning('已触发事件，但未命中可执行规则')
      return
    }

    if (failedItems.length > 0) {
      message.error(`已触发 ${processed} 条，失败 ${failedItems.length} 条，请检查接收人或规则文案配置`)
      return
    }

    if (partialItems.length > 0 || skippedItems.length > 0) {
      const skippedCount = skippedItems.length
      const partialCount = partialItems.length

      if (partialCount > 0 && skippedCount > 0) {
        message.warning(`已触发 ${processed} 条，部分成功 ${partialCount} 条，策略跳过 ${skippedCount} 条`)
        return
      }

      if (partialCount > 0) {
        message.warning(`已触发 ${processed} 条，部分成功 ${partialCount} 条，请检查通知日志详情`)
        return
      }

      message.warning(`已触发 ${processed} 条，策略跳过 ${skippedCount} 条（当前发送模式可能为 shadow/whitelist）`)
      return
    }

    message.success(`试发成功，已处理 ${processed} 条通知`)
  }

  const handleToggleEnabled = async (rule, checked) => {
    if (!rule?.id) return

    const previousEnabled = Number(rule.is_enabled) === 1 ? 1 : 0
    const nextEnabled = checked ? 1 : 0
    if (previousEnabled === nextEnabled) return

    setRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, is_enabled: nextEnabled } : item)))
    setTogglingRuleId(rule.id)

    const payload = {
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      scene_code: rule.scene_code,
      message_title: rule.message_title || '',
      message_content: rule.message_content || '',
      business_line_id: rule.business_line_id ?? null,
      channel_type: rule.channel_type,
      receiver_type: rule.receiver_type,
      receiver_config_json: safeParseJson(rule.receiver_config_json, {}),
      condition_config_json: safeParseJson(rule.condition_config_json, null),
      dedup_config_json: safeParseJson(rule.dedup_config_json, null),
      retry_count: Number(rule.retry_count || 0),
      retry_interval_sec: rule.retry_interval_sec ?? null,
      priority: Number(rule.priority || 0),
      remark: rule.remark || null,
      is_enabled: nextEnabled,
    }

    const result = await updateNotificationRuleApi(rule.id, payload)
    setTogglingRuleId(null)

    if (!result?.success) {
      setRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, is_enabled: previousEnabled } : item)))
      message.error(result?.message || '状态切换失败')
      return
    }

    message.success(nextEnabled === 1 ? '已启用' : '已停用')
    loadRules()
  }

  const handleToggleEnabledWithConfirm = (rule, checked) => {
    const nextEnabled = checked ? 1 : 0
    const currentEnabled = Number(rule?.is_enabled) === 1 ? 1 : 0
    if (nextEnabled === currentEnabled) return

    Modal.confirm({
      title: checked ? '确认启用该规则？' : '确认停用该规则？',
      content: checked
        ? `启用后将按规则“${rule?.rule_name || '-'}”开始发送通知。`
        : `停用后规则“${rule?.rule_name || '-'}”将不再发送通知。`,
      okText: checked ? '确认启用' : '确认停用',
      cancelText: '取消',
      onOk: () => handleToggleEnabled(rule, checked),
    })
  }

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      width: 180,
    },
    {
      title: '场景',
      dataIndex: 'scene_code',
      width: 140,
      render: (value) => EVENT_TYPE_LABEL_MAP[String(value || '').toLowerCase()] || value || '-',
    },
    {
      title: '渠道',
      dataIndex: 'channel_type',
      width: 100,
      render: (value) => {
        const normalized = String(value || '').toLowerCase()
        return <Tag color="blue">{CHANNEL_LABEL_MAP[normalized] || value || '-'}</Tag>
      },
    },
    {
      title: '接收类型',
      dataIndex: 'receiver_type',
      width: 120,
      render: (value) => RECEIVER_TYPE_LABEL_MAP[String(value || '').toLowerCase()] || value || '-',
    },
    {
      title: '状态',
      dataIndex: 'is_enabled',
      width: 100,
      render: (value, row) => (
        <Switch
          checked={Number(value) === 1}
          checkedChildren="启用"
          unCheckedChildren="停用"
          loading={togglingRuleId === row.id}
          onClick={(checked) => handleToggleEnabledWithConfirm(row, checked)}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            loading={sendingRuleId === row.id}
            onClick={() => handleTestSend(row)}
          >
            试发
          </Button>
          <Popconfirm
            title="确认删除该规则？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDelete(row)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]
  const tableColumns = screens?.lg
    ? columns
    : columns.filter((item) =>
        ['rule_name', 'scene_code', 'is_enabled', 'actions'].includes(String(item.dataIndex || item.key || '')),
      )

  return (
    <div style={{ padding: 12 }}>
      <Card variant="borderless" style={{ marginBottom: 12 }} loading={sendControlLoading} title="发送控制（当前环境）">
        <Row gutter={12}>
          <Col span={8}>
            <Form layout="vertical">
              <Form.Item label="发送模式" style={{ marginBottom: 0 }}>
                <Select
                  style={{ width: '100%' }}
                  value={sendControlMode}
                  options={[
                    { label: '仅记录（不发送）', value: 'shadow' },
                    { label: '白名单发送（仅白名单）', value: 'whitelist' },
                    { label: '全量发送（正式）', value: 'live' },
                  ]}
                  onChange={(value) => setSendControlMode(value)}
                />
              </Form.Item>
            </Form>
          </Col>
          <Col span={8}>
            <Form layout="vertical">
              <Form.Item label="用户白名单" style={{ marginBottom: 0 }}>
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  value={sendControlSelectedUserIds}
                  options={sendControlUserWhitelistOptions}
                  onChange={handleSendControlUsersChange}
                  placeholder="选择白名单用户（仅展示已绑定飞书账号用户）"
                  disabled={sendControlMode === 'shadow' || sendControlMode === 'live'}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
            <div style={{ marginTop: 6 }}>
              <Text type="secondary">
                {unmatchedWhitelistOpenIdCount > 0
                  ? `当前白名单中有 ${unmatchedWhitelistOpenIdCount} 个飞书账号标识未匹配到系统用户（可在用户管理中补充绑定后再选择）`
                  : '仅可选择已绑定飞书账号的用户'}
              </Text>
            </div>
          </Col>
          <Col span={8}>
            <Form layout="vertical">
              <Form.Item label="群白名单" style={{ marginBottom: 0 }}>
                <Select
                  mode="multiple"
                  showSearch
                  filterOption={false}
                  onSearch={(value) => loadFeishuChatOptions(value)}
                  onFocus={() => loadFeishuChatOptions()}
                  notFoundContent={chatOptionsLoading ? '加载中...' : '暂无可选飞书群'}
                  value={sendControlChatIds}
                  onChange={(value) => setSendControlChatIds(Array.isArray(value) ? value : [])}
                  placeholder="选择白名单飞书群（仅显示当前应用可访问的群）"
                  disabled={sendControlMode === 'shadow' || sendControlMode === 'live'}
                  options={feishuChatOptions}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
          </Col>
        </Row>
        <Row style={{ marginTop: 12 }}>
          <Col span={24}>
            <Space>
              <Button type="primary" loading={sendControlSaving} onClick={handleSaveSendControl}>
                保存发送控制
              </Button>
              <Text type="secondary">建议：调试阶段用“仅记录”，灰度阶段用“白名单发送”，正式上线后再切“全量发送”。</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        variant="borderless"
        title="通知规则"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadRules}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建规则
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Row gutter={12}>
            <Col span={10}>
              <Input
                placeholder="搜索规则名称/场景"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={loadRules}
              />
            </Col>
            <Col span={6}>
              <Button onClick={loadRules}>查询</Button>
            </Col>
          </Row>

          <Table
            rowKey="id"
            loading={loading}
            columns={tableColumns}
            dataSource={rules}
            pagination={{ pageSize: 10 }}
            scroll={screens?.lg ? { x: 1200 } : undefined}
          />
        </Space>
      </Card>

      <Drawer
        title={editingRule ? `编辑规则：${editingRule.rule_name}` : '新建通知规则'}
        open={drawerOpen}
        width={760}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {editingRule ? (
            <Form.Item label="规则编码">
              <Input value={editingRule.rule_code || '-'} disabled />
            </Form.Item>
          ) : null}

          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="rule_name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
                <Input placeholder="例如 节点指派提醒" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={24}>
              {selectedTriggerMode === 'schedule' ? (
                <>
                  <Form.Item name="scene_code" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="schedule_event_type"
                    label="业务事件类型"
                    rules={[{ required: true, message: '请选择业务事件类型' }]}
                    extra="定时只决定触发时间；业务事件决定通知变量（例如周报正文）。"
                  >
                    <Select
                      showSearch
                      placeholder="请选择业务事件类型"
                      options={scheduleBusinessEventTypeOptions}
                      optionFilterProp="label"
                    />
                  </Form.Item>
                  <Alert
                    type="info"
                    showIcon
                    message="规则会在计划时间触发，并按“业务事件类型”解析变量。"
                    style={{ marginBottom: 8 }}
                  />
                </>
              ) : (
                <Form.Item
                  name="scene_code"
                  label="事件类型"
                  rules={[{ required: true, message: '请选择事件类型' }]}
                  extra={selectedTriggerModeTip}
                >
                  <Select
                    showSearch
                    placeholder="请选择事件类型"
                    options={filteredEventTypeOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              )}
            </Col>
          </Row>

          <Card size="small" title="通知内容" style={{ marginBottom: 12 }}>
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item name="message_title" label="通知标题（可选）">
                  <Mentions
                    prefix="@"
                    options={variableMentionOptions}
                    rows={1}
                    placeholder="例如：任务状态更新提醒（输入 @ 可插入变量）"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item
                  name="message_content"
                  label="通知内容"
                  rules={[{ required: true, message: '请输入通知内容' }]}
                  extra="输入 @ 可选择当前事件可用变量，系统会自动替换为真实值"
                >
                  <Mentions
                    prefix="@"
                    options={variableMentionOptions}
                    rows={8}
                    placeholder="请输入（输入 @ 可引用动态值）"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="channel_type" label="通知渠道" rules={[{ required: true }]}>
                <Select options={CHANNEL_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="receiver_type" label="接收类型" rules={[{ required: true }]}>
                <Select options={RECEIVER_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_enabled" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Card size="small" title="接收配置">
            <Row gutter={12}>
              <Col span={24}>
                {selectedReceiverType === 'user' ? (
                  <Form.Item
                    name="receiver_users"
                    label="接收用户"
                    rules={[{ required: true, message: '请至少选择一个接收用户' }]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="选择接收用户"
                      options={userOptions}
                    />
                  </Form.Item>
                ) : selectedReceiverType === 'chat' ? (
                  <Form.Item
                    name="receiver_chat_ids"
                    label="接收飞书群"
                    rules={[{ required: true, message: '请至少选择一个接收飞书群' }]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      filterOption={false}
                      onSearch={(value) => loadFeishuChatOptions(value)}
                      onFocus={() => loadFeishuChatOptions()}
                      notFoundContent={chatOptionsLoading ? '加载中...' : '暂无可选飞书群'}
                      placeholder="选择飞书群（只显示当前应用可访问的群）"
                      options={feishuChatOptions}
                    />
                  </Form.Item>
                ) : selectedReceiverType === 'demand_group' ? (
                  <Form.Item label="接收飞书群（自动）">
                    <Text type="secondary">
                      系统会自动识别事件所属需求（缺陷会自动回溯到关联需求），并发送到该需求“绑定现有群”设置的飞书群。
                    </Text>
                  </Form.Item>
                ) : selectedReceiverType === 'field' ? (
                  <Form.Item
                    name="receiver_field_user_id"
                    label="接收人来源"
                    rules={[{ required: true, message: '请选择通知要发给谁' }]}
                    extra="系统会根据该字段自动找到对应人员并发送通知。"
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="请选择通知接收人（如：被指派人）"
                      options={receiverFieldOptions}
                    />
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="receiver_roles"
                    label="接收业务角色"
                    rules={[{ required: true, message: '请至少选择一个业务角色' }]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="选择接收业务角色"
                      options={receiverRoleOptions}
                    />
                  </Form.Item>
                )}
              </Col>
            </Row>
          </Card>

          <Card size="small" title="条件配置（可选）" style={{ marginTop: 12 }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="trigger_mode" label="触发方式" rules={[{ required: true }]}>
                  <Select options={TRIGGER_MODE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="condition_enabled" label="启用条件" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={8} />
            </Row>

            {selectedTriggerMode === 'schedule' ? (
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="schedule_frequency" label="计划周期" rules={[{ required: true }]}>
                    <Select options={SCHEDULE_FREQUENCY_OPTIONS} />
                  </Form.Item>
                </Col>
                {selectedScheduleFrequency === 'hourly' ? (
                  <Col span={8}>
                    <Form.Item name="schedule_interval_hours" label="每隔几小时">
                      <InputNumber min={1} max={24} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                ) : (
                  <Col span={8}>
                    <Form.Item name="schedule_hour" label="小时（0-23）">
                      <InputNumber min={0} max={23} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                )}
                <Col span={8}>
                  <Form.Item name="schedule_minute" label="分钟（0-59）">
                    <InputNumber min={0} max={59} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>

                {selectedScheduleFrequency === 'weekly' ? (
                  <Col span={12}>
                    <Form.Item name="schedule_weekdays" label="每周几">
                      <Select mode="multiple" allowClear options={WEEKDAY_OPTIONS} />
                    </Form.Item>
                  </Col>
                ) : null}
                {selectedScheduleFrequency === 'monthly' ? (
                  <Col span={12}>
                    <Form.Item name="schedule_day_of_month" label="每月几号">
                      <InputNumber min={1} max={31} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                ) : null}
                <Col span={12}>
                  <Form.Item name="schedule_timezone" label="时区">
                    <Input disabled />
                  </Form.Item>
                </Col>
              </Row>
            ) : null}

            {selectedTriggerMode === 'deadline' ? (
              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item name="deadline_target" label="提醒对象">
                    <Select options={DEADLINE_TARGET_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="deadline_offset_type" label="提醒时机">
                    <Select options={DEADLINE_OFFSET_TYPE_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="deadline_offset_value" label="数值">
                    <InputNumber min={0} max={720} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="deadline_offset_unit" label="单位">
                    <Select options={DEADLINE_OFFSET_UNIT_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="deadline_window_minutes" label="触发窗口（分钟）">
                    <InputNumber min={1} max={120} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            ) : null}

            {conditionEnabled ? (
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="condition_field" label="条件字段">
                    <Select
                      allowClear
                      placeholder={selectedEventType ? '选择该事件的条件字段' : '请先选择事件类型'}
                      options={activeConditionFieldOptions}
                      disabled={!selectedEventType}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="condition_operator" label="运算符">
                    <Select allowClear placeholder="选择运算符" options={CONDITION_OPERATOR_OPTIONS} />
                  </Form.Item>
                </Col>
                {isConditionValueRequired ? (
                  <Col span={8}>
                    <Form.Item name="condition_value" label="条件值">
                      <Input placeholder="例如：high 或 urgent,high" />
                    </Form.Item>
                  </Col>
                ) : null}
              </Row>
            ) : (
              <Text type="secondary">当前未启用附加条件，规则会在触发方式命中后直接执行。</Text>
            )}
          </Card>
          <Alert
            showIcon
            type="info"
            style={{ marginTop: 12 }}
            message="保存前摘要"
            description={`事件类型：${EVENT_TYPE_LABEL_MAP[String(effectiveEventType || '').toLowerCase()] || '未选择'}；接收配置：${receiverSummaryText}`}
          />

          <Collapse
            style={{ marginTop: 12 }}
            items={[
              {
                key: 'advanced',
                label: '高级配置（去重 / 重试 / 优先级 / 备注）',
                children: (
                  <>
                    <Card size="small" title="去重配置（可选）">
                      <Row gutter={12}>
                        <Col span={8}>
                          <Form.Item name="dedup_enabled" label="启用去重" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="dedup_window_sec" label="去重时间窗（秒）">
                            <InputNumber min={60} max={86400} precision={0} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="dedup_key_fields" label="去重字段">
                            <Select
                              mode="multiple"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              placeholder="选择去重字段"
                              options={DEDUP_KEY_FIELD_OPTIONS}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>

                    <Row gutter={12} style={{ marginTop: 12 }}>
                      <Col span={8}>
                        <Form.Item name="retry_count" label="重试次数">
                          <InputNumber min={0} max={10} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="retry_interval_sec" label="重试间隔秒（可选）">
                          <InputNumber min={0} max={86400} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="priority" label="优先级">
                          <InputNumber min={0} max={99999} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="remark" label="备注（可选)">
                      <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />

          <Text type="secondary">提示：页面配置会自动转换为系统内部 JSON，无需手写。</Text>
        </Form>
      </Drawer>
    </div>
  )
}

export default NotificationRulesPage
