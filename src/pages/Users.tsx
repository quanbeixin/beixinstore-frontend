import { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Space,
  Modal,
  Form,
  Select,
  message,
  Tag,
  Popconfirm
} from 'antd';
import {
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import type { TablePaginationConfig } from 'antd';

const { Search } = Input;

// 用户数据类型定义
interface User {
  id: number;
  username: string;
  email: string;
  department_id: number;
  department_name: string;
  role_ids: string;
  role_names: string;
  created_at: string;
}

// 部门选项类型
interface Department {
  id: number;
  name: string;
}

// 角色选项类型
interface Role {
  id: number;
  name: string;
}

// API 响应类型
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// 用户列表响应类型
interface UsersListData {
  list: User[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 用户管理页面组件
 * 功能：用户列表展示、搜索、分页、编辑、删除
 */
const Users = () => {
  // ========== 状态管理 ==========
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // 部门和角色选项（实际项目中应从后端获取）
  const [departments] = useState<Department[]>([
    { id: 1, name: '技术部' },
    { id: 2, name: '运营部' },
    { id: 3, name: '市场部' },
    { id: 4, name: '财务部' }
  ]);

  const [roles] = useState<Role[]>([
    { id: 1, name: '超级管理员' },
    { id: 2, name: '运营' },
    { id: 3, name: '编辑' },
    { id: 4, name: '审核员' }
  ]);

  const [form] = Form.useForm();

  // ========== 工具函数 ==========
  /**
   * 获取 JWT Token
   */
  const getToken = (): string | null => {
    return localStorage.getItem('token');
  };

  /**
   * 获取当前登录用户 ID
   */
  const getCurrentUserId = (): number | null => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.id;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  /**
   * 通用 API 请求函数
   */
  const apiRequest = async <T,>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    const token = getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`http://localhost:3000${url}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  };

  // ========== 数据获取 ==========
  /**
   * 获取用户列表
   */
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        ...(keyword && { keyword })
      });

      const result = await apiRequest<UsersListData>(
        `/api/users?${params.toString()}`
      );

      if (result.success) {
        setUsers(result.data.list);
        setTotal(result.data.total);
      } else {
        message.error(result.message || '获取用户列表失败');
      }
    } catch (error) {
      message.error('网络请求失败');
      console.error('Fetch users error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ========== 生命周期 ==========
  useEffect(() => {
    // 获取当前登录用户 ID
    const userId = getCurrentUserId();
    setCurrentUserId(userId);
    // 加载用户列表
    fetchUsers();
  }, [currentPage, pageSize, keyword]);

  // ========== 事件处理 ==========
  /**
   * 搜索处理
   */
  const handleSearch = (value: string) => {
    setKeyword(value);
    setCurrentPage(1); // 搜索时重置到第一页
  };

  /**
   * 分页变化处理
   */
  const handleTableChange = (pagination: TablePaginationConfig) => {
    setCurrentPage(pagination.current || 1);
    setPageSize(pagination.pageSize || 10);
  };

  /**
   * 打开编辑弹窗
   */
  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsModalVisible(true);
    // 将角色 ID 字符串转换为数组
    const roleIds = user.role_ids ? user.role_ids.split(',').map(Number) : [];
    form.setFieldsValue({
      email: user.email,
      department_id: user.department_id,
      role_ids: roleIds
    });
  };

  /**
   * 关闭弹窗
   */
  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingUser(null);
    form.resetFields();
  };

  /**
   * 提交编辑
   */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (!editingUser) return;

      const result = await apiRequest<User>(
        `/api/users/${editingUser.id}/update`,
        {
          method: 'POST',
          body: JSON.stringify(values)
        }
      );

      if (result.success) {
        message.success('更新成功');
        handleCancel();
        fetchUsers(); // 刷新列表
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error('网络请求失败');
        console.error('Update user error:', error);
      }
    }
  };

  /**
   * 删除用户
   */
  const handleDelete = async (user: User) => {
    // 不能删除自己
    if (user.id === currentUserId) {
      message.warning('不能删除当前登录用户');
      return;
    }

    try {
      const result = await apiRequest<void>(
        `/api/users/${user.id}/delete`,
        {
          method: 'POST'
        }
      );

      if (result.success) {
        message.success('删除成功');
        fetchUsers(); // 刷新列表
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      message.error('网络请求失败');
      console.error('Delete user error:', error);
    }
  };

  /**
   * 刷新列表
   */
  const handleRefresh = () => {
    setKeyword('');
    setCurrentPage(1);
    fetchUsers();
  };

  // ========== 表格列定义 ==========
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 120
    },
    {
      title: '角色',
      dataIndex: 'role_names',
      key: 'role_names',
      width: 200,
      render: (roleNames: string) => (
        <>
          {roleNames?.split(',').map((role, index) => (
            <Tag color="blue" key={index}>
              {role}
            </Tag>
          ))}
        </>
      )
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => <Tag color="success">正常</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除用户 "${record.username}" 吗？`}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
            disabled={record.id === currentUserId}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === currentUserId}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // ========== 渲染 ==========
  return (
    <div style={{ padding: '24px' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>
          用户管理
        </h1>
        <p style={{ color: '#666', marginTop: '8px' }}>
          管理系统用户信息、权限和状态
        </p>
      </div>

      {/* 操作栏 */}
      <div style={{
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <Search
            placeholder="搜索用户名或邮箱"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ width: 300 }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
          >
            刷新
          </Button>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
        >
          新增用户
        </Button>
      </div>

      {/* 用户列表表格 */}
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100']
        }}
        onChange={handleTableChange}
        scroll={{ x: 1200 }}
      />

      {/* 编辑用户弹窗 */}
      <Modal
        title="编辑用户"
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: '24px' }}
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="部门"
            name="department_id"
          >
            <Select
              placeholder="请选择部门"
              allowClear
            >
              {departments.map(dept => (
                <Select.Option key={dept.id} value={dept.id}>
                  {dept.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="角色"
            name="role_ids"
          >
            <Select
              mode="multiple"
              placeholder="请选择角色"
              allowClear
            >
              {roles.map(role => (
                <Select.Option key={role.id} value={role.id}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Users;
