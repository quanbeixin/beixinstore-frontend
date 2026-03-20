import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Space, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { clearAuthStorage, getCurrentUser } from '../utils/access'

const { Header: AntHeader } = Layout
const { Text } = Typography

function Header() {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()

  const handleLogout = () => {
    clearAuthStorage()
    navigate('/login', { replace: true })
  }

  return (
    <AntHeader className="app-header">
      <h2 className="header-title">管理后台</h2>
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
