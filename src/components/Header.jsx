import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Space, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { clearAuthStorage, getCurrentUser } from '../utils/access'

const { Header: AntHeader } = Layout
const { Text } = Typography

function Header({ route }) {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()

  const handleLogout = () => {
    clearAuthStorage()
    navigate('/login', { replace: true })
  }

  return (
    <AntHeader className="app-header">
      <div className="header-main">
        <h2 className="header-title">{route?.page?.title || route?.menu?.label || ''}</h2>
        {route?.page?.subtitle ? <Text className="header-subtitle">{route.page.subtitle}</Text> : null}
      </div>
      <Space className="header-user">
        <Text>{currentUser?.username || '未登录用户'}</Text>
        <Avatar size={40} icon={<UserOutlined />} />
        <Button icon={<LogoutOutlined />} onClick={handleLogout}>
          退出登录
        </Button>
      </Space>
    </AntHeader>
  )
}

export default Header
