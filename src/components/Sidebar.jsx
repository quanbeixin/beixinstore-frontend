import {
  ApartmentOutlined,
  DashboardOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { hasPermission } from '../utils/access'

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const systemChildren = [
    hasPermission('user.view')
      ? {
          key: '/users',
          icon: <UserOutlined />,
          label: '用户管理',
        }
      : null,
    hasPermission('dept.view')
      ? {
          key: '/departments',
          icon: <ApartmentOutlined />,
          label: '部门管理',
        }
      : null,
    hasPermission('dept.view')
      ? {
          key: '/user-departments',
          icon: <ApartmentOutlined />,
          label: '用户部门分配',
        }
      : null,
    hasPermission('option.view')
      ? {
          key: '/options',
          icon: <ToolOutlined />,
          label: '角色管理',
        }
      : null,
    hasPermission('dict.view')
      ? {
          key: '/dict-center',
          icon: <ToolOutlined />,
          label: '字典中心',
        }
      : null,
  ].filter(Boolean)

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    ...(systemChildren.length > 0
      ? [
          {
            key: 'system',
            icon: <SettingOutlined />,
            label: '系统设置',
            children: systemChildren,
          },
        ]
      : []),
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
