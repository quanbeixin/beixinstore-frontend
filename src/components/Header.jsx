import { Avatar, Layout, Space } from 'antd'
import { UserOutlined } from '@ant-design/icons'

const { Header: AntHeader } = Layout

function Header() {
  return (
    <AntHeader className="app-header">
      <h2 className="header-title">管理后台</h2>
      <Space className="header-user">
        <Avatar size={40} icon={<UserOutlined />} />
      </Space>
    </AntHeader>
  )
}

export default Header
