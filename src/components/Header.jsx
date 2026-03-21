import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Space, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { clearAuthStorage, getCurrentUser } from '../utils/access'

const { Header: AntHeader } = Layout
const { Text } = Typography

function Header({ route }) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()
  const currentUserName = currentUser?.real_name || currentUser?.username || '未登录用户'

  const handleLogout = () => {
    clearAuthStorage()
    navigate('/login', { replace: true })
  }

  return (
    <AntHeader className="app-header">
      <div className="header-main">
        <div className="header-title-row">
          <h2 className="header-title">{route?.page?.title || route?.menu?.label || ''}</h2>
          {route?.page?.subtitle ? <Text className="header-subtitle">{route.page.subtitle}</Text> : null}
        </div>
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
