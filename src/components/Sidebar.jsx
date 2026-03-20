import {
  ApartmentOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Menu } from 'antd'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MENU_SECTIONS } from '../config/menu.config'
import { canAccessRoute } from '../utils/access'

const iconMap = {
  apartment: <ApartmentOutlined />,
  dashboard: <DashboardOutlined />,
  safety: <SafetyCertificateOutlined />,
  setting: <SettingOutlined />,
  tool: <ToolOutlined />,
  user: <UserOutlined />,
}

function canViewMenuItem(item) {
  return canAccessRoute(item.route)
}

function buildMenuItems() {
  const result = []

  MENU_SECTIONS.forEach((section) => {
    if (!Array.isArray(section.items) || section.items.length === 0) {
      return
    }

    const visibleItems = section.items
      .filter(canViewMenuItem)
      .map((item) => ({
        key: item.key,
        label: item.label,
        icon: iconMap[item.icon] || null,
      }))

    if (visibleItems.length === 0) {
      return
    }

    if (section.key === 'main') {
      result.push(...visibleItems)
      return
    }

    result.push({
      key: section.key,
      label: section.label,
      icon: iconMap[section.icon] || null,
      children: visibleItems,
    })
  })

  return result
}

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = buildMenuItems()
  const openKeys = useMemo(
    () => MENU_SECTIONS.filter((section) => section.key !== 'main').map((section) => section.key),
    [],
  )

  return (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      defaultOpenKeys={openKeys}
      items={menuItems}
      onClick={({ key }) => {
        if (!String(key).startsWith('/')) return
        navigate(key)
      }}
    />
  )
}

export default Sidebar
