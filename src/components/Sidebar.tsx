import { Menu } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

// 侧边栏菜单组件
const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
  ];

  return (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={({ key }) => navigate(key)}
    />
  );
};

export default Sidebar;
