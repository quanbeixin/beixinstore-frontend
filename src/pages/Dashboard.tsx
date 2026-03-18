import { Row, Col } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  UserOutlined,
  ShoppingOutlined,
  DollarOutlined
} from '@ant-design/icons';

// Dashboard 页面 - 显示三张精美的统计卡片
const Dashboard = () => {
  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Dashboard</h1>
      <p className="dashboard-subtitle">欢迎回来，这是您的数据概览</p>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={8}>
          <div className="stat-card">
            <div className="stat-card-icon purple">
              <UserOutlined />
            </div>
            <div className="stat-card-title">总用户数</div>
            <div className="stat-card-value">12,458</div>
            <div className="stat-card-change positive">
              <RiseOutlined /> +12.5%
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <div className="stat-card">
            <div className="stat-card-icon blue">
              <ShoppingOutlined />
            </div>
            <div className="stat-card-title">订单总数</div>
            <div className="stat-card-value">8,234</div>
            <div className="stat-card-change positive">
              <RiseOutlined /> +8.2%
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <div className="stat-card">
            <div className="stat-card-icon gradient">
              <DollarOutlined />
            </div>
            <div className="stat-card-title">总收入</div>
            <div className="stat-card-value">¥156K</div>
            <div className="stat-card-change negative">
              <FallOutlined /> -2.4%
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
