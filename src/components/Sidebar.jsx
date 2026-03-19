import { DashboardOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons'
import { Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统设置',
      children: [
        {
          key: '/users',
          icon: <UserOutlined />,
          label: '用户管理',
        },
      ],
    },
  ]

  return (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      defaultOpenKeys={['system']}
      items={menuItems}
      onClick={({ key }) => {
        if (key !== 'system') {
          navigate(key)
        }
      }}
    />
  )
}

export default Sidebar
