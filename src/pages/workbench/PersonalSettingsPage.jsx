import { Card, Col, Form, Input, Row, Select, Space, Switch, Tabs, Tag, Typography, message, Button } from 'antd'
import { useEffect, useState } from 'react'
import {
  getPreferencesApi,
  getProfileApi,
  updatePasswordApi,
  updatePreferencesApi,
  updateProfileApi,
} from '../../api/auth'
import { setUserPreferences } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { Text } = Typography

function PersonalSettings() {
  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [prefForm] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [preferenceSaving, setPreferenceSaving] = useState(false)
  const [profile, setProfile] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [profileResult, preferenceResult] = await Promise.all([getProfileApi(), getPreferencesApi()])

      if (!profileResult?.success) {
        message.error(profileResult?.message || '获取个人信息失败')
      } else {
        setProfile(profileResult.data || null)
        profileForm.setFieldsValue({
          username: profileResult.data?.username || '',
          real_name: profileResult.data?.real_name || '',
          mobile: profileResult.data?.mobile || '',
          email: profileResult.data?.email || '',
          department_name: profileResult.data?.department_name || '',
        })
      }

      if (!preferenceResult?.success) {
        message.error(preferenceResult?.message || '获取偏好设置失败')
      } else {
        prefForm.setFieldsValue({
          date_display_mode: preferenceResult.data?.date_display_mode || 'datetime',
          demand_list_compact_default: Number(preferenceResult.data?.demand_list_compact_default || 0) === 1,
        })
      }
    } catch (error) {
      message.error(error?.message || '加载个人设置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields()
      setProfileSaving(true)
      const result = await updateProfileApi({
        real_name: values.real_name || '',
        mobile: values.mobile || '',
        email: values.email || '',
      })

      if (!result?.success) {
        message.error(result?.message || '保存个人信息失败')
        return
      }

      setProfile(result.data || null)
      message.success('个人信息已保存')
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '保存个人信息失败')
      }
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields()
      setPasswordSaving(true)

      const result = await updatePasswordApi({
        old_password: values.old_password,
        new_password: values.new_password,
        confirm_password: values.confirm_password,
      })

      if (!result?.success) {
        message.error(result?.message || '修改密码失败')
        return
      }

      passwordForm.resetFields()
      message.success('密码修改成功')
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '修改密码失败')
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSavePreferences = async () => {
    try {
      const values = await prefForm.validateFields()
      setPreferenceSaving(true)

      const result = await updatePreferencesApi({
        date_display_mode: values.date_display_mode,
        demand_list_compact_default: values.demand_list_compact_default ? 1 : 0,
      })

      if (!result?.success) {
        message.error(result?.message || '保存偏好设置失败')
        return
      }

      setUserPreferences(result.data || {})
      message.success('偏好设置已保存')
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '保存偏好设置失败')
      }
    } finally {
      setPreferenceSaving(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <Card loading={loading} variant="borderless">
        <Tabs
          items={[
            {
              key: 'profile',
              forceRender: true,
              label: '基础信息',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={14}>
                    <Form form={profileForm} layout="vertical">
                      <Form.Item label="用户名" name="username">
                        <Input disabled />
                      </Form.Item>
                      <Form.Item
                        label="真实姓名"
                        name="real_name"
                        rules={[
                          { required: true, message: '请输入真实姓名' },
                          { min: 2, message: '真实姓名至少 2 个字符' },
                          { max: 32, message: '真实姓名最多 32 个字符' },
                        ]}
                      >
                        <Input maxLength={32} placeholder="请输入真实姓名" />
                      </Form.Item>
                      <Form.Item
                        label="手机号"
                        name="mobile"
                        rules={[
                          {
                            pattern: /^$|^[0-9+\-\s]{6,20}$/,
                            message: '请输入有效手机号',
                          },
                        ]}
                      >
                        <Input maxLength={20} placeholder="请输入手机号（可选）" />
                      </Form.Item>
                      <Form.Item
                        label="邮箱"
                        name="email"
                        rules={[
                          {
                            type: 'email',
                            message: '邮箱格式不正确',
                          },
                        ]}
                      >
                        <Input maxLength={128} placeholder="请输入邮箱（可选）" />
                      </Form.Item>
                      <Space>
                        <Button type="primary" loading={profileSaving} onClick={handleSaveProfile}>
                          保存基础信息
                        </Button>
                      </Space>
                    </Form>
                  </Col>
                  <Col xs={24} md={10}>
                    <Card size="small" title="账号信息">
                      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        <div>
                          <Text type="secondary">所属部门：</Text>
                          <Text>{profile?.department_name || '-'}</Text>
                        </div>
                        <div>
                          <Text type="secondary">账号状态：</Text>
                          <Tag color={profile?.status_code === 'ACTIVE' ? 'green' : 'orange'}>
                            {profile?.status_code || 'ACTIVE'}
                          </Tag>
                        </div>
                        <div>
                          <Text type="secondary">最近登录：</Text>
                          <Text>{formatBeijingDateTime(profile?.last_login_at)}</Text>
                        </div>
                        <div>
                          <Text type="secondary">角色：</Text>
                          <div style={{ marginTop: 6 }}>
                            {(profile?.role_names || []).length > 0 ? (
                              (profile?.role_names || []).map((name) => <Tag key={name}>{name}</Tag>)
                            ) : (
                              <Text>-</Text>
                            )}
                          </div>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'security',
              forceRender: true,
              label: '账号安全',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={14}>
                    <Form form={passwordForm} layout="vertical">
                      <Form.Item
                        label="旧密码"
                        name="old_password"
                        rules={[{ required: true, message: '请输入旧密码' }]}
                      >
                        <Input.Password placeholder="请输入旧密码" />
                      </Form.Item>
                      <Form.Item
                        label="新密码"
                        name="new_password"
                        rules={[
                          { required: true, message: '请输入新密码' },
                          { min: 6, message: '新密码长度至少 6 位' },
                        ]}
                      >
                        <Input.Password placeholder="请输入新密码" />
                      </Form.Item>
                      <Form.Item
                        label="确认新密码"
                        name="confirm_password"
                        dependencies={['new_password']}
                        rules={[
                          { required: true, message: '请再次输入新密码' },
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              if (!value || value === getFieldValue('new_password')) return Promise.resolve()
                              return Promise.reject(new Error('两次输入的新密码不一致'))
                            },
                          }),
                        ]}
                      >
                        <Input.Password placeholder="请再次输入新密码" />
                      </Form.Item>
                      <Button type="primary" loading={passwordSaving} onClick={handleChangePassword}>
                        修改密码
                      </Button>
                    </Form>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'preference',
              forceRender: true,
              label: '界面偏好',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={14}>
                    <Form form={prefForm} layout="vertical">
                      <Form.Item
                        label="日期显示格式"
                        name="date_display_mode"
                        rules={[{ required: true, message: '请选择日期显示格式' }]}
                      >
                        <Select
                          options={[
                            { value: 'datetime', label: '日期 + 时间' },
                            { value: 'date', label: '仅日期' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item
                        label="需求池默认视图"
                        name="demand_list_compact_default"
                        valuePropName="checked"
                      >
                        <Switch checkedChildren="精简" unCheckedChildren="完整" />
                      </Form.Item>
                      <Button type="primary" loading={preferenceSaving} onClick={handleSavePreferences}>
                        保存偏好设置
                      </Button>
                    </Form>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

export default PersonalSettings
