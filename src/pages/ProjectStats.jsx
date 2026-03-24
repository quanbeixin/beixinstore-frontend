import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Select, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getProjectsApi } from '../api/projects'
import {
  getProjectStatsMembersApi,
  getProjectStatsOverviewApi,
  getProjectStatsProjectsApi,
} from '../api/projectStats'
import { getUsersApi } from '../api/users'
import './ProjectManagement.css'

function getProjectStatusLabel(value) {
  if (value === 'COMPLETED') return '已完成'
  if (value === 'IN_PROGRESS') return '进行中'
  return value || '-'
}

function ProjectStats() {
  const [overview, setOverview] = useState(null)
  const [projectStats, setProjectStats] = useState([])
  const [memberStats, setMemberStats] = useState([])
  const [projects, setProjects] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState()
  const [projectFilter, setProjectFilter] = useState()
  const [userFilter, setUserFilter] = useState()

  const loadOptions = useCallback(async () => {
    try {
      const [projectResult, userResult] = await Promise.all([
        getProjectsApi({ page: 1, pageSize: 200 }),
        getUsersApi({ page: 1, pageSize: 200 }),
      ])
      if (projectResult?.success) setProjects(projectResult.data?.list || [])
      if (userResult?.success) setUsers(userResult.data?.list || [])
    } catch (error) {
      console.error('Load project stats options failed:', error)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewResult, projectResult, memberResult] = await Promise.all([
        getProjectStatsOverviewApi(),
        getProjectStatsProjectsApi({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(ownerFilter ? { owner_user_id: ownerFilter } : {}),
        }),
        getProjectStatsMembersApi({
          ...(projectFilter ? { project_id: projectFilter } : {}),
          ...(userFilter ? { user_id: userFilter } : {}),
        }),
      ])

      if (!overviewResult?.success || !projectResult?.success || !memberResult?.success) {
        message.error(
          overviewResult?.message || projectResult?.message || memberResult?.message || '获取统计数据失败',
        )
        return
      }

      setOverview(overviewResult.data || null)
      setProjectStats(projectResult.data || [])
      setMemberStats(memberResult.data || [])
    } catch (error) {
      message.error(error?.message || '获取统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [ownerFilter, projectFilter, statusFilter, userFilter])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  useEffect(() => {
    loadData()
  }, [loadData])

  const projectColumns = [
    { title: '业务线名称', dataIndex: 'project_name', key: 'project_name', width: 220 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => <Tag color={value === 'COMPLETED' ? 'success' : 'processing'}>{getProjectStatusLabel(value)}</Tag>,
    },
    { title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 140, render: (value) => value || '-' },
    { title: '需求数', dataIndex: 'requirement_count', key: 'requirement_count', width: 100 },
    { title: 'Bug 数', dataIndex: 'bug_count', key: 'bug_count', width: 100 },
    { title: '预计工时', dataIndex: 'estimated_hours', key: 'estimated_hours', width: 120 },
    { title: '实际工时', dataIndex: 'actual_hours', key: 'actual_hours', width: 120 },
    { title: '投入人天', dataIndex: 'person_days', key: 'person_days', width: 120 },
  ]

  const memberColumns = [
    {
      title: '成员',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 140,
      render: (value, row) => value || row.username || '-',
    },
    { title: '账号', dataIndex: 'username', key: 'username', width: 140 },
    { title: '业务线数', dataIndex: 'project_count', key: 'project_count', width: 100 },
    { title: '需求数', dataIndex: 'requirement_count', key: 'requirement_count', width: 100 },
    { title: 'Bug 数', dataIndex: 'bug_count', key: 'bug_count', width: 100 },
    { title: '预计工时', dataIndex: 'estimated_hours', key: 'estimated_hours', width: 120 },
    { title: '实际工时', dataIndex: 'actual_hours', key: 'actual_hours', width: 120 },
    { title: '投入人天', dataIndex: 'person_days', key: 'person_days', width: 120 },
  ]

  return (
    <div className="pm-page">
      <Card className="pm-hero" variant="borderless">
        <div className="pm-hero-head">
          <div>
            <h1 className="pm-hero-title">业务线统计</h1>
            <p className="pm-hero-subtitle">从业务线、成员两个视角查看需求与缺陷的工时、人天和任务投入统计。</p>
          </div>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新统计
          </Button>
        </div>

        <div className="pm-hero-stats">
          <div className="pm-stat-card">
            <div className="pm-stat-label">业务线总数</div>
            <div className="pm-stat-value">{overview?.total_projects || 0}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">需求总数</div>
            <div className="pm-stat-value">{overview?.total_requirements || 0}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">Bug 总数</div>
            <div className="pm-stat-value">{overview?.total_bugs || 0}</div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-label">实际人天</div>
            <div className="pm-stat-value">{overview?.person_days || 0}</div>
          </div>
        </div>
      </Card>

      <Card className="pm-panel" variant="borderless" title="按业务线统计">
        <div className="pm-toolbar" style={{ marginBottom: 16 }}>
          <div className="pm-toolbar-left">
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder="业务线状态"
              value={statusFilter || undefined}
              options={[
                { label: '进行中', value: 'IN_PROGRESS' },
                { label: '已完成', value: 'COMPLETED' },
              ]}
              onChange={(value) => setStatusFilter(value || '')}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              placeholder="业务线负责人"
              value={ownerFilter}
              options={users.map((user) => ({
                value: user.id,
                label: user.real_name || user.username,
              }))}
              onChange={(value) => setOwnerFilter(value)}
            />
          </div>
        </div>
        <Table
          rowKey="project_id"
          loading={loading}
          columns={projectColumns}
          dataSource={projectStats}
          scroll={{ x: 1080 }}
          pagination={false}
        />
      </Card>

      <Card className="pm-panel" variant="borderless" title="按成员统计">
        <div className="pm-toolbar" style={{ marginBottom: 16 }}>
          <div className="pm-toolbar-left">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              placeholder="所属业务线"
              value={projectFilter}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              onChange={(value) => setProjectFilter(value)}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              placeholder="成员"
              value={userFilter}
              options={users.map((user) => ({
                value: user.id,
                label: user.real_name || user.username,
              }))}
              onChange={(value) => setUserFilter(value)}
            />
          </div>
        </div>
        <Table
          rowKey="user_id"
          loading={loading}
          columns={memberColumns}
          dataSource={memberStats}
          scroll={{ x: 1080 }}
          pagination={false}
        />
      </Card>
    </div>
  )
}

export default ProjectStats
