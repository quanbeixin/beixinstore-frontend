import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Select, Space, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAuthStorage,
  getAccessSnapshot,
  getAvailableBusinessLines,
  getCurrentUser,
  resolveCurrentBusinessLineId,
  setActiveBusinessLineId,
} from '../utils/access'

const { Header: AntHeader } = Layout
const { Text } = Typography

function Header({ route }) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const currentUserName = currentUser?.real_name || currentUser?.username || '未登录用户'
  const access = getAccessSnapshot()
  const canSwitchBusinessLine = Boolean(access?.can_switch_business_line)
  const businessLines = getAvailableBusinessLines(access)
  const initialBusinessLineId = resolveCurrentBusinessLineId(access)
  const [selectedBusinessLineId, setSelectedBusinessLineId] = useState(initialBusinessLineId)

  const currentBusinessLine = useMemo(
    () => businessLines.find((item) => Number(item.id) === Number(selectedBusinessLineId)) || businessLines[0] || null,
    [businessLines, selectedBusinessLineId],
  )

  const handleLogout = () => {
    clearAuthStorage()
    navigate('/login', { replace: true })
  }

  const handleBusinessLineChange = (value) => {
    const nextId = Number(value)
    if (!nextId || Number(nextId) === Number(selectedBusinessLineId)) return
    setActiveBusinessLineId(nextId)
    setSelectedBusinessLineId(nextId)
    window.location.reload()
  }

  return (
    <AntHeader className="app-header">
      <div className="header-main">
        <div className="header-title-row">
          <h2 className="header-title">{route?.page?.title || route?.menu?.label || ''}</h2>
          {route?.page?.subtitle ? <Text className="header-subtitle">{route.page.subtitle}</Text> : null}
        </div>
        {businessLines.length > 0 ? (
          <div className="header-business-line">
            <Text className="header-business-line-label">当前业务线</Text>
            {canSwitchBusinessLine ? (
              <Select
                size="small"
                className="header-business-line-select"
                value={selectedBusinessLineId || undefined}
                options={businessLines.map((item) => ({
                  value: item.id,
                  label: item.name || item.code || `业务线#${item.id}`,
                }))}
                onChange={handleBusinessLineChange}
              />
            ) : (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {currentBusinessLine?.name || currentBusinessLine?.code || '未绑定'}
              </Tag>
            )}
          </div>
        ) : null}
      </div>
      <Space className="header-user">
        <Text className="header-username">{currentUserName}</Text>
        <Avatar size={38} icon={<UserOutlined />} />
        <Button type="text" className="header-logout-btn" icon={<LogoutOutlined />} onClick={handleLogout}>
          退出登录
        </Button>
      </Space>
    </AntHeader>
  )
}

export default Header
