import {
  BoldOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  SendOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Mentions,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDictItemsApi } from '../../api/configDict'
import { getOptionsApi } from '../../api/options'
import { getUsersApi } from '../../api/users'
import {
  createNotificationRuleApi,
  deleteNotificationRuleApi,
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
  { label: '角色', value: 'role' },
  { label: '用户', value: 'user' },
  { label: '字段映射', value: 'field' },
]

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

const DEDUP_KEY_FIELD_OPTIONS = [
  { label: '业务线', value: 'business_line_id' },
  { label: '事件类型', value: 'event_type' },
  { label: '需求', value: 'demand_id' },
  { label: '节点', value: 'node_id' },
  { label: '任务', value: 'task_id' },
]

const EVENT_TYPE_OPTIONS = [
  { label: '节点指派', value: 'node_assign' },
  { label: '节点驳回', value: 'node_reject' },
  { label: '节点完成', value: 'node_complete' },
  { label: '任务指派', value: 'task_assign' },
  { label: '任务截止提醒', value: 'task_deadline' },
  { label: '任务完成', value: 'task_complete' },
  { label: '周报发送', value: 'weekly_report_send' },
  { label: 'Bug指派', value: 'bug_assign' },
  { label: 'Bug状态变更', value: 'bug_status_change' },
  { label: 'Bug已修复', value: 'bug_fixed' },
  { label: 'Bug重新打开', value: 'bug_reopen' },
]

const EVENT_TYPE_LABEL_MAP = EVENT_TYPE_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const CHANNEL_LABEL_MAP = {
  feishu: '飞书',
  in_app: '站内消息',
}

const RECEIVER_TYPE_LABEL_MAP = {
  user: '用户',
  role: '角色',
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
  user_id: '成员ID',
  priority: '优先级',
  status: '状态',
  remaining_hours: '剩余小时',
  task_id: '任务ID',
  bug_id: '缺陷ID',
  severity: '严重级别',
  from_status: '旧状态',
  to_status: '新状态',
  reopen_reason: '重开原因',
  operator_id: '操作人ID',
  reject_reason: '驳回原因',
  task_title: '任务标题',
  bug_no: '缺陷编号',
  bug_title: '缺陷标题',
  bug_content: '缺陷内容',
  bug_status: '缺陷状态',
  reporter_name: '提交人姓名',
  user_name: '成员姓名',
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

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function markdownToEditorHtml(value) {
  const lines = String(value || '').split('\n')
  let html = ''
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) html += '</ul>'
    if (inOl) html += '</ol>'
    inUl = false
    inOl = false
  }

  const renderInline = (text) =>
    escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  lines.forEach((rawLine) => {
    const line = String(rawLine || '')
    const ulMatch = line.match(/^\s*-\s+(.+)$/)
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/)

    if (ulMatch) {
      if (inOl) {
        html += '</ol>'
        inOl = false
      }
      if (!inUl) {
        html += '<ul style="margin:0 0 8px 20px;padding:0;">'
        inUl = true
      }
      html += `<li>${renderInline(ulMatch[1])}</li>`
      return
    }

    if (olMatch) {
      if (inUl) {
        html += '</ul>'
        inUl = false
      }
      if (!inOl) {
        html += '<ol style="margin:0 0 8px 20px;padding:0;">'
        inOl = true
      }
      html += `<li>${renderInline(olMatch[1])}</li>`
      return
    }

    closeLists()
    if (!line.trim()) {
      html += '<div><br/></div>'
    } else {
      html += `<div>${renderInline(line)}</div>`
    }
  })

  closeLists()
  return html || '<div><br/></div>'
}

function normalizeInlineFromElement(node) {
  if (!node) return ''
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const tagName = (node.tagName || '').toLowerCase()
  if (tagName === 'br') return '\n'

  const childrenText = Array.from(node.childNodes || []).map((child) => normalizeInlineFromElement(child)).join('')

  if (tagName === 'strong' || tagName === 'b') return `**${childrenText}**`
  if (tagName === 'em' || tagName === 'i') return `*${childrenText}*`
  if (tagName === 'del' || tagName === 's' || tagName === 'strike') return `~~${childrenText}~~`

  return childrenText
}

function editorHtmlToMarkdown(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  const lines = []

  Array.from(container.childNodes || []).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue || '').trim()
      if (text) lines.push(text)
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tagName = (node.tagName || '').toLowerCase()

    if (tagName === 'ul' || tagName === 'ol') {
      const isOrdered = tagName === 'ol'
      Array.from(node.querySelectorAll(':scope > li')).forEach((li, index) => {
        const line = normalizeInlineFromElement(li).replace(/\n/g, ' ').trim()
        if (!line) return
        lines.push(`${isOrdered ? `${index + 1}.` : '-'} ${line}`)
      })
      return
    }

    const line = normalizeInlineFromElement(node).replace(/\n/g, '').trim()
    lines.push(line)
  })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 10000)
}

function getCaretTextOffset(rootEl) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(rootEl)
  range.setEnd(selection.anchorNode, selection.anchorOffset)
  return range.toString().length
}

function setCaretAtTextOffset(rootEl, targetOffset) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  let offset = Math.max(0, targetOffset)
  let positioned = false

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = (node.nodeValue || '').length
    if (offset <= length) {
      range.setStart(node, offset)
      range.collapse(true)
      positioned = true
      break
    }
    offset -= length
  }

  if (!positioned) {
    range.selectNodeContents(rootEl)
    range.collapse(false)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

function normalizeEditorListStyle(editorEl) {
  if (!editorEl) return
  editorEl.querySelectorAll('ol, ul').forEach((list) => {
    list.style.margin = '6px 0 10px 24px'
    list.style.paddingLeft = '14px'
  })
}

function RichMentionsEditor({ value, onChange, options, placeholder, maxLength = 300 }) {
  const wrapperRef = useRef(null)
  const editorRef = useRef(null)
  const content = String(value || '')
  const lastMarkdownRef = useRef(content)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [caretOffset, setCaretOffset] = useState(0)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    // Avoid resetting caret while user is typing. Repaint only when value changes externally.
    if (content === lastMarkdownRef.current) return

    const wasFocused = document.activeElement === editor
    const cursor = wasFocused ? getCaretTextOffset(editor) : 0
    editor.innerHTML = markdownToEditorHtml(content)
    normalizeEditorListStyle(editor)
    lastMarkdownRef.current = content

    if (wasFocused) {
      setCaretAtTextOffset(editor, cursor)
    }
  }, [content])

  const syncToForm = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    normalizeEditorListStyle(editor)
    const markdown = editorHtmlToMarkdown(editor.innerHTML)
    lastMarkdownRef.current = markdown
    onChange?.(markdown.slice(0, maxLength))

    const offset = getCaretTextOffset(editor)
    setCaretOffset(offset)
    const prefix = markdown.slice(0, offset)
    const match = prefix.match(/@([\u4e00-\u9fa5A-Za-z0-9_]*)$/)
    if (match) {
      setShowMentionMenu(true)
      setMentionQuery(match[1] || '')
      setMentionStart(offset - match[0].length)
    } else {
      setShowMentionMenu(false)
      setMentionQuery('')
      setMentionStart(-1)
    }
  }, [maxLength, onChange])

  const execCommand = useCallback(
    (command) => {
      const editor = editorRef.current
      if (!editor) return
      editor.focus()
      document.execCommand(command, false, null)
      syncToForm()
    },
    [syncToForm],
  )

  const insertMention = useCallback(
    (label) => {
      const source = String(value || '')
      const start = mentionStart >= 0 ? mentionStart : caretOffset
      const next = `${source.slice(0, start)}@${label} ${source.slice(caretOffset)}`
      onChange?.(next.slice(0, maxLength))
      setShowMentionMenu(false)
      setMentionQuery('')
      requestAnimationFrame(() => {
        const editor = editorRef.current
        if (!editor) return
        editor.focus()
        setCaretAtTextOffset(editor, Math.min(start + label.length + 2, next.length))
      })
    },
    [caretOffset, maxLength, mentionStart, onChange, value],
  )

  const filteredOptions = useMemo(() => {
    const query = String(mentionQuery || '').trim()
    if (!query) return options.slice(0, 12)
    return options.filter((item) => String(item.label || '').includes(query)).slice(0, 12)
  }, [mentionQuery, options])

  const toolbarButtonStyle = {
    border: 'none',
    background: 'transparent',
    color: '#1f2329',
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        border: '1px solid #2f54eb',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid #e6e8eb',
          background: '#fff',
        }}
      >
        <Button size="small" type="text" icon={<UndoOutlined />} style={toolbarButtonStyle} onClick={() => execCommand('undo')} />
        <Button size="small" type="text" icon={<RedoOutlined />} style={toolbarButtonStyle} onClick={() => execCommand('redo')} />
        <div style={{ width: 1, height: 20, background: '#e6e8eb', margin: '0 4px' }} />
        <Button size="small" type="text" disabled icon={<FontColorsOutlined />} style={toolbarButtonStyle} />
        <Button size="small" type="text" icon={<BoldOutlined />} style={toolbarButtonStyle} onClick={() => execCommand('bold')} />
        <Button size="small" type="text" icon={<ItalicOutlined />} style={toolbarButtonStyle} onClick={() => execCommand('italic')} />
        <Button
          size="small"
          type="text"
          icon={<StrikethroughOutlined />}
          style={toolbarButtonStyle}
          onClick={() => execCommand('strikeThrough')}
        />
        <div style={{ width: 1, height: 20, background: '#e6e8eb', margin: '0 4px' }} />
        <Button
          size="small"
          type="text"
          icon={<OrderedListOutlined />}
          style={toolbarButtonStyle}
          onClick={() => execCommand('insertOrderedList')}
        />
        <Button
          size="small"
          type="text"
          icon={<UnorderedListOutlined />}
          style={toolbarButtonStyle}
          onClick={() => execCommand('insertUnorderedList')}
        />
        <Button size="small" type="text" disabled icon={<EllipsisOutlined />} style={toolbarButtonStyle} />
      </div>

      <div style={{ position: 'relative', padding: '10px 12px 0' }}>
        {!content ? (
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: 14,
              color: '#b8bfc8',
              pointerEvents: 'none',
            }}
          >
            {placeholder}
          </div>
        ) : null}
        <div
          style={{
            minHeight: 210,
            border: 'none',
            outline: 'none',
            color: '#1f2329',
            lineHeight: 1.7,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
          contentEditable
          suppressContentEditableWarning
          ref={editorRef}
          onInput={syncToForm}
          onKeyUp={syncToForm}
          onClick={syncToForm}
          data-placeholder={placeholder}
        />

        {showMentionMenu && filteredOptions.length > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: 12,
              bottom: 10,
              zIndex: 30,
              maxHeight: 220,
              overflowY: 'auto',
              width: 240,
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            }}
          >
            {filteredOptions.map((item) => (
              <div
                key={item.value}
                role="button"
                tabIndex={0}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(item.value)
                }}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ textAlign: 'right', color: '#8f959e', fontSize: 12, padding: '2px 12px 10px' }}>
        {content.length}/{maxLength}
      </div>
    </div>
  )
}

function parseConditionFromJson(conditionConfigJson) {
  const condition = safeParseJson(conditionConfigJson, null)
  const first = condition?.items?.[0]
  if (!first || typeof first !== 'object') {
    return {
      condition_enabled: false,
      condition_field: undefined,
      condition_operator: 'eq',
      condition_value: '',
    }
  }

  const operator = String(first.operator || 'eq')
  const value =
    operator === 'in' || operator === 'nin'
      ? (Array.isArray(first.value) ? first.value.join(', ') : '')
      : first.value === undefined || first.value === null
        ? ''
        : String(first.value)

  return {
    condition_enabled: true,
    condition_field: first.field || undefined,
    condition_operator: operator,
    condition_value: value,
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
  const roleValues = Array.isArray(receiver?.roles)
    ? receiver.roles.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
    : []
  const userValues = Array.isArray(receiver?.user_ids)
    ? receiver.user_ids.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
    : Array.isArray(receiver?.users)
      ? receiver.users.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
      : []

  return {
    receiver_roles: roleValues,
    receiver_users: userValues,
  }
}

function normalizeRuleFormValue(rule) {
  const receiverForm = parseReceiverFromJson(rule?.receiver_config_json || {})
  const conditionForm = parseConditionFromJson(rule?.condition_config_json)
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

  if (sceneCode === 'bug_status_change') {
    return {
      ...base,
      bug_id: 10002,
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
      assignee_name: '测试用户',
      operator_name: '管理员',
      reject_reason: sceneCode === 'node_reject' ? '信息不完整' : undefined,
      operator_id: 1,
    }
  }

  return base
}

function NotificationRulesPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState([])
  const [businessLineOptions, setBusinessLineOptions] = useState([])
  const [roleOptions, setRoleOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [keyword, setKeyword] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [sendingRuleId, setSendingRuleId] = useState(null)
  const [togglingRuleId, setTogglingRuleId] = useState(null)
  const [sendControlLoading, setSendControlLoading] = useState(false)
  const [sendControlSaving, setSendControlSaving] = useState(false)
  const [sendControlMode, setSendControlMode] = useState('shadow')
  const [sendControlOpenIds, setSendControlOpenIds] = useState('')
  const [sendControlChatIds, setSendControlChatIds] = useState('')
  const [form] = Form.useForm()
  const selectedEventType = Form.useWatch('scene_code', form)
  const selectedReceiverType = Form.useWatch('receiver_type', form)
  const selectedConditionOperator = Form.useWatch('condition_operator', form)
  const isConditionValueRequired = !CONDITION_OPERATORS_WITHOUT_VALUE.has(String(selectedConditionOperator || ''))

  const activeConditionFieldOptions = useMemo(
    () => CONDITION_FIELD_OPTIONS_BY_EVENT[selectedEventType] || DEFAULT_CONDITION_FIELD_OPTIONS,
    [selectedEventType],
  )
  const variableMentionOptions = useMemo(() => {
    const eventVars = EVENT_VARIABLE_OPTIONS_BY_EVENT[selectedEventType] || []
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
  }, [selectedEventType])

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
      setSendControlOpenIds(Array.isArray(data.whitelist_open_ids) ? data.whitelist_open_ids.join(',') : '')
      setSendControlChatIds(Array.isArray(data.whitelist_chat_ids) ? data.whitelist_chat_ids.join(',') : '')
    } catch (error) {
      message.error(error?.message || '获取发送控制配置失败')
    } finally {
      setSendControlLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSendControl()
  }, [loadSendControl])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const result = await getDictItemsApi('business_group', { enabledOnly: true })
        if (!active || !result?.success) return

        const options = (result.data || [])
          .map((item) => ({
            label: item?.item_name || item?.label || '',
            value: Number(item?.id || 0),
          }))
          .filter((item) => item.label && Number.isInteger(item.value) && item.value > 0)

        setBusinessLineOptions(options)
      } catch {
        // keep page available even when dictionary service is temporarily unavailable
      }
    })()

    return () => {
      active = false
    }
  }, [])

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
    const currentField = form.getFieldValue('condition_field')
    if (!currentField) return

    const exists = activeConditionFieldOptions.some((item) => item.value === currentField)
    if (!exists) {
      form.setFieldValue('condition_field', undefined)
    }
  }, [activeConditionFieldOptions, form])

  useEffect(() => {
    if (isConditionValueRequired) return
    form.setFieldValue('condition_value', undefined)
  }, [form, isConditionValueRequired])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const result = await getOptionsApi('roles')
        if (!active || !result?.success) return

        const options = (result.data || [])
          .map((item) => ({
            label: item?.name || '',
            value: item?.id,
          }))
          .filter((item) => item.label && (typeof item.value === 'number' || typeof item.value === 'string'))

        setRoleOptions(options)
      } catch {
        // keep page usable even if role options fail
      }
    })()

    return () => {
      active = false
    }
  }, [])

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
    const receiverConfig = {
      roles: selectedRoles,
      user_ids: selectedUsers,
    }

    let conditionConfig = null
    if (values.condition_enabled) {
      if (!values.condition_field) {
        message.error('请先选择条件字段')
        return
      }
      if (!values.condition_operator) {
        message.error('请先选择条件运算符')
        return
      }
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

      conditionConfig = {
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
      business_line_id: values.business_line_id ?? null,
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
    const payload = {
      eventType: String(rule.scene_code),
      data: buildMockEventData(String(rule.scene_code), rule.business_line_id, now),
    }

    const result = await triggerNotificationEventApi(payload)
    setSendingRuleId(null)

    if (!result?.success) {
      message.error(result?.message || '试发失败')
      return
    }

    const processed = Number(result?.data?.processed_count || 0)
    const matched = Number(result?.data?.matched_count || 0)
    const failedItems = Array.isArray(result?.data?.results)
      ? result.data.results.filter((item) => item?.status !== 'success')
      : []

    if (processed === 0 || matched === 0) {
      message.warning('已触发事件，但未命中可执行规则')
      return
    }

    if (failedItems.length > 0) {
      message.error(`已触发 ${processed} 条，失败 ${failedItems.length} 条，请检查接收人或规则文案配置`)
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
          onChange={(checked) => handleToggleEnabled(row, checked)}
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

  return (
    <div style={{ padding: 12 }}>
      <Card variant="borderless" style={{ marginBottom: 12 }} loading={sendControlLoading} title="发送控制（当前环境）">
        <Row gutter={12}>
          <Col span={8}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>发送模式</div>
            <Select
              style={{ width: '100%' }}
              value={sendControlMode}
              options={[
                { label: 'shadow（只记录，不真实发送）', value: 'shadow' },
                { label: 'whitelist（仅白名单发送）', value: 'whitelist' },
                { label: 'live（全量真实发送）', value: 'live' },
              ]}
              onChange={(value) => setSendControlMode(value)}
            />
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>用户白名单 OpenID（逗号分隔）</div>
            <Input
              value={sendControlOpenIds}
              onChange={(e) => setSendControlOpenIds(e.target.value)}
              placeholder="ou_xxx,ou_yyy"
              disabled={sendControlMode === 'shadow' || sendControlMode === 'live'}
            />
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>群白名单 ChatID（逗号分隔）</div>
            <Input
              value={sendControlChatIds}
              onChange={(e) => setSendControlChatIds(e.target.value)}
              placeholder="oc_xxx,oc_yyy"
              disabled={sendControlMode === 'shadow' || sendControlMode === 'live'}
            />
          </Col>
        </Row>
        <Row style={{ marginTop: 12 }}>
          <Col span={24}>
            <Space>
              <Button type="primary" loading={sendControlSaving} onClick={handleSaveSendControl}>
                保存发送控制
              </Button>
              <Text type="secondary">建议日常联调用 `shadow`，灰度联调用 `whitelist`，上线后再切 `live`。</Text>
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
            columns={columns}
            dataSource={rules}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1200 }}
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
            <Col span={12}>
              <Form.Item
                name="scene_code"
                label="事件类型"
                rules={[{ required: true, message: '请选择事件类型' }]}
                extra="事件类型用于匹配触发时机。系统收到同类型事件时，才会执行该规则。"
              >
                <Select
                  showSearch
                  placeholder="请选择事件类型"
                  options={EVENT_TYPE_OPTIONS}
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="business_line_id" label="业务线（可选）">
                <Select
                  allowClear
                  showSearch
                  placeholder="为空表示全局"
                  optionFilterProp="label"
                  options={businessLineOptions}
                />
              </Form.Item>
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
                  <RichMentionsEditor
                    options={variableMentionOptions}
                    maxLength={300}
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
                  <Form.Item name="receiver_users" label="接收用户（可选）">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="选择接收用户"
                      options={userOptions}
                    />
                  </Form.Item>
                ) : (
                  <Form.Item name="receiver_roles" label="接收角色（可选）">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="选择接收角色"
                      options={roleOptions}
                    />
                  </Form.Item>
                )}
              </Col>
            </Row>
            <Text type="secondary">系统将自动使用后台内置的飞书应用发送，无需填写技术参数。</Text>
          </Card>

          <Card size="small" title="条件配置（可选）" style={{ marginTop: 12 }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="condition_enabled" label="启用条件" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={16} />
            </Row>
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
          </Card>

          <Card size="small" title="去重配置（可选）" style={{ marginTop: 12 }}>
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

          <Row gutter={12}>
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

          <Text type="secondary">提示：页面配置会自动转换为系统内部 JSON，无需手写。</Text>
        </Form>
      </Drawer>
    </div>
  )
}

export default NotificationRulesPage
