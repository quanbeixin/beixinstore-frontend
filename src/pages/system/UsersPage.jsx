import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDictItemsApi } from '../../api/configDict'
import { getDepartmentsApi } from '../../api/org'
import { getOptionsApi } from '../../api/options'
import {
  createUserApi,
  deleteUserApi,
  getFeishuContactsApi,
  getUserChangeLogsApi,
  getUserByIdApi,
  getUsersApi,
  saveFeishuSyncScopesApi,
  syncUsersFromFeishuApi,
  updateUserApi,
} from '../../api/users'
import { getCurrentUser } from '../../utils/access'

const { Search } = Input
const { RangePicker } = DatePicker
const USERS_FULL_LIST_PAGE_SIZE = 5000
const USER_CHANGE_LOG_PAGE_SIZE = 10
const USER_CHANGE_ACTION_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '新增用户', value: 'CREATE' },
  { label: '编辑用户', value: 'UPDATE' },
  { label: '删除用户', value: 'DELETE' },
  { label: '查看详情', value: 'VIEW' },
  { label: '新用户注册', value: 'REGISTER' },
]
const USER_CHANGE_SOURCE_LABELS = {
  ADMIN: '后台操作',
  SELF_REGISTER: '用户注册',
}

function highlightText(text, keyword) {
  const source = String(text || '')
  const key = String(keyword || '').trim()
  if (!key) return source

  const lowerSource = source.toLowerCase()
  const lowerKey = key.toLowerCase()
  const parts = []
  let cursor = 0

  while (cursor < source.length) {
    const matchedIndex = lowerSource.indexOf(lowerKey, cursor)
    if (matchedIndex < 0) {
      parts.push(source.slice(cursor))
      break
    }

    if (matchedIndex > cursor) {
      parts.push(source.slice(cursor, matchedIndex))
    }
    parts.push(
      <mark key={`${matchedIndex}-${lowerKey}`} style={{ padding: 0, background: '#fff3bf' }}>
        {source.slice(matchedIndex, matchedIndex + key.length)}
      </mark>,
    )
    cursor = matchedIndex + key.length
  }

  return <>{parts}</>
}

function getUserChangeSnapshotRows(snapshot, statusOptions = [], jobLevelOptions = []) {
  if (!snapshot || typeof snapshot !== 'object') return []

  const statusMap = new Map((statusOptions || []).map((item) => [item.item_code, item.item_name]))
  const jobLevelMap = new Map((jobLevelOptions || []).map((item) => [item.item_code, item.item_name]))
  const roleNames = Array.isArray(snapshot.role_names)
    ? snapshot.role_names
    : String(snapshot.role_names || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

  return [
    { key: 'username', label: '用户名', value: snapshot.username || '-' },
    { key: 'real_name', label: '真实姓名', value: snapshot.real_name || '-' },
    { key: 'email', label: '邮箱', value: snapshot.email || '-' },
    { key: 'department_name', label: '部门', value: snapshot.department_name || '-' },
    { key: 'job_level', label: '职级', value: jobLevelMap.get(snapshot.job_level) || snapshot.job_level || '-' },
    { key: 'status_code', label: '状态', value: statusMap.get(snapshot.status_code) || snapshot.status_code || '-' },
    {
      key: 'include_in_metrics',
      label: '纳入考核',
      value: Number(snapshot.include_in_metrics ?? 1) === 1 ? '纳入' : '不纳入',
    },
    { key: 'role_names', label: '角色', value: roleNames.length > 0 ? roleNames.join('、') : '-' },
  ]
}

function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState('real_name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [roles, setRoles] = useState([])
  const [jobLevelOptions, setJobLevelOptions] = useState([])
  const [statusOptions, setStatusOptions] = useState([
    { item_code: 'ACTIVE', item_name: '正常', color: 'success' },
    { item_code: 'DISABLED', item_name: '停用', color: 'default' },
  ])
  const [isLogModalVisible, setIsLogModalVisible] = useState(false)
  const [isLogDetailVisible, setIsLogDetailVisible] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [userChangeLogs, setUserChangeLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(USER_CHANGE_LOG_PAGE_SIZE)
  const [logTotal, setLogTotal] = useState(0)
  const [logActionType, setLogActionType] = useState('')
  const [logOperatorUserId, setLogOperatorUserId] = useState(undefined)
  const [logKeyword, setLogKeyword] = useState('')
  const [logDateRange, setLogDateRange] = useState([])

  const [form] = Form.useForm()
  const [syncForm] = Form.useForm()
  const [syncModalVisible, setSyncModalVisible] = useState(false)
  const [syncingFeishuUsers, setSyncingFeishuUsers] = useState(false)
  const [savingFeishuScopes, setSavingFeishuScopes] = useState(false)
  const [loadingFeishuContacts, setLoadingFeishuContacts] = useState(false)
  const [feishuContacts, setFeishuContacts] = useState([])
  const [feishuKeyword, setFeishuKeyword] = useState('')
  const [selectedFeishuOpenIds, setSelectedFeishuOpenIds] = useState([])

  const getCurrentUserId = () => {
    const user = getCurrentUser()
    return user?.id || null
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getUsersApi({
        page: 1,
        pageSize: USERS_FULL_LIST_PAGE_SIZE,
        ...(keyword ? { keyword } : {}),
        sort_by: sortBy,
        sort_order: sortOrder,
      })

      if (result.success) {
        setUsers(result.data.list)
      } else {
        message.error(result.message || '获取用户列表失败')
      }
    } catch (error) {
      message.error('网络请求失败')
      console.error('Fetch users error:', error)
    } finally {
      setLoading(false)
    }
  }, [keyword, sortBy, sortOrder])

  const fetchOptions = useCallback(async () => {
    try {
      const [departmentResult, roleResult] = await Promise.all([
        getDepartmentsApi({ mode: 'flat' }),
        getOptionsApi('roles'),
      ])

      if (departmentResult.success) {
        setDepartments(departmentResult.data)
      } else {
        message.error(departmentResult.message || '获取部门选项失败')
      }

      if (roleResult.success) {
        setRoles(roleResult.data)
      } else {
        message.error(roleResult.message || '获取角色选项失败')
      }
    } catch (error) {
      message.error(error?.message || '获取系统选项失败')
    }
  }, [])

  const fetchStatusOptions = useCallback(async () => {
    try {
      const [statusResult, jobLevelResult] = await Promise.all([
        getDictItemsApi('user_status', { enabledOnly: true }),
        getDictItemsApi('job_level', { enabledOnly: true }),
      ])

      if (statusResult.success && Array.isArray(statusResult.data) && statusResult.data.length > 0) {
        setStatusOptions(statusResult.data)
      }
      if (jobLevelResult.success && Array.isArray(jobLevelResult.data)) {
        setJobLevelOptions(jobLevelResult.data)
      }
    } catch (error) {
      console.warn('Fetch user_status options failed, fallback to defaults:', error)
    }
  }, [])

  const fetchUserChangeLogs = useCallback(async () => {
    if (!isLogModalVisible) return
    setLogLoading(true)
    try {
      const result = await getUserChangeLogsApi({
        page: logPage,
        pageSize: logPageSize,
        ...(logActionType ? { action_type: logActionType } : {}),
        ...(logOperatorUserId ? { operator_user_id: logOperatorUserId } : {}),
        ...(logKeyword ? { keyword: logKeyword } : {}),
        ...(logDateRange?.[0] ? { start_date: logDateRange[0].format('YYYY-MM-DD') } : {}),
        ...(logDateRange?.[1] ? { end_date: logDateRange[1].format('YYYY-MM-DD') } : {}),
      })

      if (result.success) {
        setUserChangeLogs(result.data?.list || [])
        setLogTotal(result.data?.total || 0)
      } else {
        message.error(result.message || '获取操作记录失败')
      }
    } catch (error) {
      message.error(error?.message || '获取操作记录失败')
      console.error('Fetch user change logs error:', error)
    } finally {
      setLogLoading(false)
    }
  }, [isLogModalVisible, logActionType, logDateRange, logKeyword, logOperatorUserId, logPage, logPageSize])

  useEffect(() => {
    setCurrentUserId(getCurrentUserId())
    fetchUsers()
    fetchOptions()
    fetchStatusOptions()
  }, [fetchUsers, fetchOptions, fetchStatusOptions])

  useEffect(() => {
    fetchUserChangeLogs()
  }, [fetchUserChangeLogs])

  const handleSearch = (value) => {
    setKeyword(value)
  }

  const handleTableChange = (_pagination, _filters, sorter) => {
    const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter
    const nextColumnKey = String(nextSorter?.columnKey || '')
    if ((nextColumnKey === 'username' || nextColumnKey === 'real_name') && nextSorter?.order) {
      setSortBy(nextColumnKey)
      setSortOrder(nextSorter.order === 'ascend' ? 'asc' : 'desc')
      return
    }
    setSortBy('real_name')
    setSortOrder('asc')
  }

  const refreshUsersAfterMutation = () => {
    fetchUsers()
  }

  const handleCreate = () => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({
      status_code: 'ACTIVE',
      include_in_metrics: true,
    })
    setIsModalVisible(true)
  }

  const handleEdit = async (user) => {
    setEditingUser(user)
    setIsModalVisible(true)
    try {
      const result = await getUserByIdApi(user.id)
      if (!result.success) {
        message.error(result.message || '获取用户详情失败')
        return
      }

      const detail = result.data
      const roleIds = detail.role_ids ? String(detail.role_ids).split(',').map(Number) : []
      form.setFieldsValue({
        real_name: detail.real_name || '',
        email: detail.email,
        department_id: detail.department_id,
        job_level: detail.job_level || undefined,
        status_code: detail.status_code || 'ACTIVE',
        include_in_metrics: Number(detail.include_in_metrics ?? 1) === 1,
        role_ids: roleIds,
      })
    } catch (error) {
      message.error(error?.message || '获取用户详情失败')
      console.error('Fetch user detail error:', error)
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setEditingUser(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      const values = await form.validateFields()
      const payload = {
        real_name: values.real_name || '',
        email: values.email || null,
        department_id: values.department_id ?? null,
        job_level: values.job_level || null,
        status_code: values.status_code || 'ACTIVE',
        include_in_metrics: values.include_in_metrics ? 1 : 0,
        role_ids: values.role_ids || [],
      }

      let result
      if (editingUser) {
        result = await updateUserApi(editingUser.id, payload)
      } else {
        result = await createUserApi({
          ...payload,
          username: values.username,
          password: values.password,
        })
      }

      if (result.success) {
        message.success(editingUser ? '更新成功' : '新增成功')
        handleCancel()
        refreshUsersAfterMutation()
      } else {
        message.error(result.message || (editingUser ? '更新失败' : '新增失败'))
      }
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查表单输入')
      } else {
        message.error(error?.message || '网络请求失败')
        console.error('Submit user error:', error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (user) => {
    if (user.id === currentUserId) {
      message.warning('不能删除当前登录用户')
      return
    }

    try {
      const result = await deleteUserApi(user.id)

      if (result.success) {
        message.success('删除成功')
        refreshUsersAfterMutation()
      } else {
        message.error(result.message || '删除失败')
      }
    } catch (error) {
      message.error('网络请求失败')
      console.error('Delete user error:', error)
    }
  }

  const handleRefresh = () => {
    setKeyword('')
    setSortBy('real_name')
    setSortOrder('asc')
    fetchUsers()
  }

  const openSyncFeishuModal = () => {
    syncForm.setFieldsValue({
      default_password: 'Beixin123',
      username_prefix: 'fs_',
      dry_run: false,
    })
    setFeishuKeyword('')
    setSelectedFeishuOpenIds([])
    setSyncModalVisible(true)
    void loadFeishuContacts('', { initializeSelection: true })
  }

  const loadFeishuContacts = async (keyword = '', options = {}) => {
    const initializeSelection = options.initializeSelection === true
    try {
      setLoadingFeishuContacts(true)
      const result = await getFeishuContactsApi({ keyword })
      if (!result?.success) {
        message.error(result?.message || '获取飞书通讯录失败')
        return
      }
      const rows = Array.isArray(result.data) ? result.data : []
      setFeishuContacts(rows)
      if (initializeSelection) {
        const preselected = rows.filter((item) => item.selected).map((item) => item.open_id)
        setSelectedFeishuOpenIds(preselected)
      }
    } catch (error) {
      message.error(error?.message || '获取飞书通讯录失败')
    } finally {
      setLoadingFeishuContacts(false)
    }
  }

  const persistFeishuScopes = async () => {
    const selectedUsers = feishuContacts
      .filter((item) => selectedFeishuOpenIds.includes(item.open_id))
      .map((item) => ({
        open_id: item.open_id,
        name: item.name,
        email: item.email,
        mobile: item.mobile,
      }))

    const saveScopeResult = await saveFeishuSyncScopesApi({
      selected_open_ids: selectedFeishuOpenIds,
      selected_users: selectedUsers,
    })
    if (!saveScopeResult?.success) {
      throw new Error(saveScopeResult?.message || '保存同步名单失败')
    }
    return saveScopeResult
  }

  const handleSaveFeishuScopesOnly = async () => {
    try {
      setSavingFeishuScopes(true)
      const result = await persistFeishuScopes()
      message.success(result?.message || '飞书同步名单已保存')
    } catch (error) {
      message.error(error?.message || '保存同步名单失败')
    } finally {
      setSavingFeishuScopes(false)
    }
  }

  const handleSyncFeishuUsers = async () => {
    try {
      const values = await syncForm.validateFields()
      if (!selectedFeishuOpenIds.length) {
        message.warning('请先选择需要同步的人员')
        return
      }
      setSyncingFeishuUsers(true)
      await persistFeishuScopes()

      const result = await syncUsersFromFeishuApi({
        default_password: values.default_password,
        username_prefix: values.username_prefix,
        dry_run: values.dry_run === true,
        selected_open_ids: selectedFeishuOpenIds,
      })

      if (!result?.success) {
        message.error(result?.message || '同步失败')
        return
      }

      const stats = result?.data || {}
      message.success(
        `同步完成：通讯录总${stats.total || 0}，选中${stats.selected || selectedFeishuOpenIds.length}，新增${stats.created || 0}，更新${stats.updated || 0}`,
      )
      setSyncModalVisible(false)
      fetchUsers()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '同步失败')
      }
    } finally {
      setSyncingFeishuUsers(false)
    }
  }

  const openLogModal = () => {
    setLogPage(1)
    setLogPageSize(USER_CHANGE_LOG_PAGE_SIZE)
    setIsLogModalVisible(true)
  }

  const closeLogModal = () => {
    setIsLogModalVisible(false)
    handleCloseLogDetail()
  }

  const handleResetLogFilters = () => {
    setLogActionType('')
    setLogOperatorUserId(undefined)
    setLogKeyword('')
    setLogDateRange([])
    setLogPage(1)
    setLogPageSize(USER_CHANGE_LOG_PAGE_SIZE)
  }

  const handleLogTableChange = (pagination) => {
    setLogPage(pagination.current || 1)
    setLogPageSize(pagination.pageSize || USER_CHANGE_LOG_PAGE_SIZE)
  }

  const handleOpenLogDetail = (record) => {
    setSelectedLog(record)
    setIsLogDetailVisible(true)
  }

  const handleCloseLogDetail = () => {
    setSelectedLog(null)
    setIsLogDetailVisible(false)
  }

  const groupedUsers = useMemo(() => {
    const deptMetaMap = new Map(
      departments.map((dept, index) => [
        Number(dept.id),
        { name: dept.name || `部门#${dept.id}`, sortIndex: index },
      ]),
    )
    const groups = new Map()

    const getOrCreateGroup = (groupKey, groupName, departmentId, sortIndex) => {
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          row_type: 'department_group',
          department_id: departmentId,
          department_name: groupName,
          user_count: 0,
          __sort_index: sortIndex,
          children: [],
        })
      }
      return groups.get(groupKey)
    }

    ;(users || []).forEach((user) => {
      const deptId = Number(user.department_id)
      const hasDepartment = Number.isInteger(deptId) && deptId > 0
      const groupKey = hasDepartment ? `dept-${deptId}` : 'dept-unassigned'
      const deptMeta = hasDepartment ? deptMetaMap.get(deptId) : null
      const groupName = hasDepartment
        ? String(user.department_name || deptMeta?.name || `部门#${deptId}`)
        : '未分配'
      const sortIndex = hasDepartment ? Number(deptMeta?.sortIndex ?? 9999) : Number.MAX_SAFE_INTEGER
      const group = getOrCreateGroup(groupKey, groupName, hasDepartment ? deptId : null, sortIndex)

      group.children.push({
        ...user,
        key: `user-${user.id}`,
        row_type: 'user',
      })
      group.user_count += 1
    })

    return Array.from(groups.values())
      .sort((a, b) => {
        if (a.__sort_index !== b.__sort_index) return a.__sort_index - b.__sort_index
        return String(a.department_name || '').localeCompare(String(b.department_name || ''), 'zh-Hans-CN')
      })
      .map((group) => {
        const sortedChildren = [...group.children].sort((a, b) =>
          String(a.real_name || a.username || '').localeCompare(String(b.real_name || b.username || ''), 'zh-Hans-CN'),
        )
        return {
          ...group,
          children: sortedChildren,
        }
      })
  }, [users, departments])

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (value, record) => (record?.row_type === 'department_group' ? <Tag color="blue">部门</Tag> : value),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      sorter: true,
      sortOrder: sortBy === 'username' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (value, record) =>
        record?.row_type === 'department_group' ? (
          <Space size={8}>
            <span style={{ fontWeight: 600 }}>{record.department_name || '-'}</span>
            <Tag>{`${Number(record.user_count || 0)} 人`}</Tag>
          </Space>
        ) : (
          highlightText(value, keyword)
        ),
    },
    {
      title: '真实姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 160,
      sorter: true,
      sortOrder: sortBy === 'real_name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (value, record) =>
        record?.row_type === 'department_group' ? '-' : highlightText(value || record.username || '-', keyword),
    },
    {
      title: '职级',
      dataIndex: 'job_level',
      key: 'job_level',
      width: 100,
      render: (value, record) => {
        if (record?.row_type === 'department_group') return '-'
        const option = jobLevelOptions.find((item) => item.item_code === value)
        return option?.item_name || value || '-'
      },
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (value, record) => (record?.row_type === 'department_group' ? '-' : highlightText(value, keyword)),
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 120,
      render: (value, record) =>
        record?.row_type === 'department_group' ? record.department_name || '-' : value || '未分配',
    },
    {
      title: '角色',
      dataIndex: 'role_names',
      key: 'role_names',
      width: 200,
      render: (roleNames, record) =>
        record?.row_type === 'department_group' ? (
          '-'
        ) : (
        <>
          {roleNames?.split(',').map((role, index) => (
            <Tag color="blue" key={index}>
              {role}
            </Tag>
          ))}
        </>
        ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => {
        if (record?.row_type === 'department_group') return '-'
        const option = statusOptions.find((item) => item.item_code === record.status_code)
        const label = option?.item_name || record.status_code || '未知'
        const color = option?.color || 'default'
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: '纳入考核',
      key: 'include_in_metrics',
      width: 110,
      render: (_, record) => {
        if (record?.row_type === 'department_group') return '-'
        return Number(record.include_in_metrics ?? 1) === 1 ? <Tag color="green">纳入</Tag> : <Tag>不纳入</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) =>
        record?.row_type === 'department_group' ? null : (
          <Space size="small">
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="确认删除"
              description={`确定要删除用户 "${record.real_name || record.username}" 吗？`}
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
              disabled={record.id === currentUserId}
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                disabled={record.id === currentUserId}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ]

  const logColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
    {
      title: '操作类型',
      dataIndex: 'action_label',
      key: 'action_label',
      width: 120,
      render: (_, record) => {
        const colorMap = {
          CREATE: 'green',
          UPDATE: 'blue',
          DELETE: 'red',
          VIEW: 'default',
          REGISTER: 'gold',
        }
        return <Tag color={colorMap[record.action_type] || 'default'}>{record.action_label || record.action_type}</Tag>
      },
    },
    {
      title: '目标用户',
      key: 'target_user',
      width: 220,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.target_real_name || '-'}</div>
          <div style={{ fontSize: 12, color: '#667085' }}>{record.target_username || '-'}</div>
        </div>
      ),
    },
    {
      title: '操作人',
      key: 'operator_name',
      width: 160,
      render: (_, record) => record.operator_name || '系统',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (value) => USER_CHANGE_SOURCE_LABELS[value] || value || '-',
    },
    {
      title: '变更摘要',
      dataIndex: 'change_summary',
      key: 'change_summary',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleOpenLogDetail(record)}>
          详情
        </Button>
      ),
    },
  ]

  const operatorOptions = useMemo(
    () =>
      (users || []).map((user) => ({
        value: user.id,
        label: user.real_name || user.username || `用户#${user.id}`,
      })),
    [users],
  )

  const selectedLogBeforeRows = useMemo(
    () => getUserChangeSnapshotRows(selectedLog?.before_data, statusOptions, jobLevelOptions),
    [jobLevelOptions, selectedLog?.before_data, statusOptions],
  )
  const selectedLogAfterRows = useMemo(
    () => getUserChangeSnapshotRows(selectedLog?.after_data, statusOptions, jobLevelOptions),
    [jobLevelOptions, selectedLog?.after_data, statusOptions],
  )

  return (
    <div style={{ padding: '12px' }}>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Search
            placeholder="搜索用户名/真实姓名/邮箱"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ width: 300 }}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
        <Space>
          <Button icon={<SyncOutlined />} onClick={openSyncFeishuModal}>
            同步飞书通讯录
          </Button>
          <Button icon={<FileSearchOutlined />} onClick={openLogModal}>
            操作记录
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增用户
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={groupedUsers}
        rowKey={(record) => record.key || String(record.id)}
        loading={loading}
        expandable={{ defaultExpandAllRows: true }}
        pagination={false}
        onChange={handleTableChange}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="同步飞书通讯录到用户管理"
        open={syncModalVisible}
        onCancel={() => setSyncModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setSyncModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="save-scopes"
            loading={savingFeishuScopes}
            onClick={() => void handleSaveFeishuScopesOnly()}
          >
            仅保存名单
          </Button>,
          <Button
            key="sync"
            type="primary"
            loading={syncingFeishuUsers}
            onClick={() => void handleSyncFeishuUsers()}
          >
            开始同步
          </Button>,
        ]}
      >
        <Form form={syncForm} layout="vertical">
          <Form.Item
            label="默认初始密码"
            name="default_password"
            rules={[
              { required: true, message: '请输入默认初始密码' },
              { min: 6, message: '密码至少6位' },
            ]}
            extra="新创建的飞书用户将使用该默认密码，建议同步后强制修改。"
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="用户名前缀"
            name="username_prefix"
            rules={[{ required: true, message: '请输入用户名前缀' }]}
            extra="系统会自动拼接飞书邮箱/手机号等生成用户名，例如 fs_zhangsan。"
          >
            <Input maxLength={10} />
          </Form.Item>
          <Form.Item label="试运行（不落库）" name="dry_run" valuePropName="checked">
            <Switch checkedChildren="试运行" unCheckedChildren="正式同步" />
          </Form.Item>
          <Form.Item label="通讯录筛选">
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Input
                placeholder="按姓名/邮箱/手机号搜索"
                value={feishuKeyword}
                onChange={(event) => setFeishuKeyword(event.target.value)}
                onPressEnter={() => void loadFeishuContacts(feishuKeyword)}
                style={{ width: 260 }}
              />
              <Button loading={loadingFeishuContacts} onClick={() => void loadFeishuContacts(feishuKeyword)}>
                拉取通讯录
              </Button>
            </Space>
          </Form.Item>
          <Form.Item label={`选择同步人员（已选 ${selectedFeishuOpenIds.length} 人）`}>
            <Table
              rowKey="open_id"
              size="small"
              loading={loadingFeishuContacts}
              dataSource={feishuContacts}
              pagination={{ pageSize: 8 }}
              rowSelection={{
                selectedRowKeys: selectedFeishuOpenIds,
                onChange: (keys) => setSelectedFeishuOpenIds(keys.map((item) => String(item))),
              }}
              columns={[
                {
                  title: '姓名',
                  dataIndex: 'name',
                  key: 'name',
                  width: 140,
                  render: (value) => value || '-',
                },
                {
                  title: '邮箱',
                  dataIndex: 'email',
                  key: 'email',
                  width: 180,
                  render: (value) => value || '-',
                },
                {
                  title: '手机号',
                  dataIndex: 'mobile',
                  key: 'mobile',
                  width: 120,
                  render: (value) => value || '-',
                },
                {
                  title: 'open_id',
                  dataIndex: 'open_id',
                  key: 'open_id',
                  ellipsis: true,
                  render: (value) => value || '-',
                },
              ]}
              scroll={{ y: 280 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="用户操作记录"
        open={isLogModalVisible}
        onCancel={closeLogModal}
        footer={null}
        width={1120}
        destroyOnHidden={false}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Space wrap size={10}>
            <Select
              style={{ width: 150 }}
              value={logActionType}
              options={USER_CHANGE_ACTION_OPTIONS}
              onChange={(value) => {
                setLogActionType(value)
                setLogPage(1)
              }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 180 }}
              placeholder="筛选操作人"
              value={logOperatorUserId}
              options={operatorOptions}
              onChange={(value) => {
                setLogOperatorUserId(value)
                setLogPage(1)
              }}
            />
            <Input
              allowClear
              style={{ width: 220 }}
              placeholder="搜索操作人/目标用户/摘要"
              value={logKeyword}
              onChange={(event) => {
                setLogKeyword(event.target.value)
                setLogPage(1)
              }}
            />
            <RangePicker
              allowEmpty={[true, true]}
              value={logDateRange}
              onChange={(dates) => {
                setLogDateRange(dates || [])
                setLogPage(1)
              }}
            />
            <Button onClick={handleResetLogFilters}>重置</Button>
          </Space>

          <Table
            rowKey="id"
            size="small"
            loading={logLoading}
            columns={logColumns}
            dataSource={userChangeLogs}
            pagination={{
              current: logPage,
              pageSize: logPageSize,
              total: logTotal,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
            onChange={handleLogTableChange}
            scroll={{ x: 980 }}
          />
        </div>
      </Modal>

      <Modal
        title="操作记录详情"
        open={isLogDetailVisible}
        onCancel={handleCloseLogDetail}
        footer={null}
        width={900}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="操作类型">
              {selectedLog?.action_label || selectedLog?.action_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="操作时间">{selectedLog?.created_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="目标用户">
              {selectedLog?.target_real_name || '-'} / {selectedLog?.target_username || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="操作人">{selectedLog?.operator_name || '系统'}</Descriptions.Item>
            <Descriptions.Item label="来源">
              {USER_CHANGE_SOURCE_LABELS[selectedLog?.source] || selectedLog?.source || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="变更摘要">{selectedLog?.change_summary || '-'}</Descriptions.Item>
          </Descriptions>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <div style={{ marginBottom: 12, fontWeight: 600 }}>变更前</div>
              <Descriptions bordered size="small" column={1}>
                {selectedLogBeforeRows.length > 0 ? (
                  selectedLogBeforeRows.map((item) => (
                    <Descriptions.Item key={item.key} label={item.label}>
                      {item.value}
                    </Descriptions.Item>
                  ))
                ) : (
                  <Descriptions.Item label="数据">-</Descriptions.Item>
                )}
              </Descriptions>
            </div>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <div style={{ marginBottom: 12, fontWeight: 600 }}>变更后</div>
              <Descriptions bordered size="small" column={1}>
                {selectedLogAfterRows.length > 0 ? (
                  selectedLogAfterRows.map((item) => (
                    <Descriptions.Item key={item.key} label={item.label}>
                      {item.value}
                    </Descriptions.Item>
                  ))
                ) : (
                  <Descriptions.Item label="数据">-</Descriptions.Item>
                )}
              </Descriptions>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
        width={500}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" style={{ marginTop: '24px' }}>
          {!editingUser && (
            <>
              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, message: '用户名至少 2 个字符' },
                  { max: 20, message: '用户名最多 20 个字符' },
                  {
                    pattern: /^[a-zA-Z0-9_]+$/,
                    message: '用户名只能包含字母、数字和下划线',
                  },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 8, message: '密码至少 8 个字符' },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                    message: '密码需同时包含字母和数字',
                  },
                ]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>

              <Form.Item
                label="确认密码"
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: '请再次输入密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="请再次输入密码" />
              </Form.Item>
            </>
          )}

          <Form.Item
            label="真实姓名"
            name="real_name"
            rules={[
              { required: true, message: '请输入真实姓名' },
              { min: 2, message: '真实姓名至少 2 个字符' },
              { max: 32, message: '真实姓名最多 32 个字符' },
            ]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item label="部门" name="department_id">
            <Select
              placeholder="请选择部门"
              allowClear
              options={departments.map((dept) => ({ value: dept.id, label: dept.name }))}
            />
          </Form.Item>

          <Form.Item label="职级" name="job_level">
            <Select
              placeholder="请选择职级"
              allowClear
              options={jobLevelOptions.map((item) => ({
                value: item.item_code,
                label: item.item_name,
              }))}
            />
          </Form.Item>

          <Form.Item label="角色" name="role_ids">
            <Select
              mode="multiple"
              placeholder="请选择角色"
              allowClear
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
            />
          </Form.Item>

          <Form.Item
            label="状态"
            name="status_code"
            rules={[{ required: true, message: '请选择用户状态' }]}
            initialValue="ACTIVE"
          >
            <Select
              placeholder="请选择状态"
              options={statusOptions.map((item) => ({
                value: item.item_code,
                label: item.item_name,
              }))}
            />
          </Form.Item>

          <Form.Item label="纳入考核" name="include_in_metrics" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="纳入" unCheckedChildren="不纳入" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Users
