import { Col, Form, Input, Row, Select } from 'antd'

function TemplateBaseForm({ form, editable = false, templateMeta }) {
  return (
    <div className="project-template-detail__base-form">
      <Form form={form} layout="vertical" disabled={!editable}>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              label="模板名称"
              name="name"
              rules={[{ required: true, message: '请输入模板名称' }]}
            >
              <Input maxLength={100} placeholder="例如：标准研发流程模板" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              label="状态"
              name="status"
              rules={[{ required: true, message: '请选择模板状态' }]}
            >
              <Select
                options={[
                  { label: '启用', value: 1 },
                  { label: '停用', value: 0 },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="更新时间">
              <Input disabled value={templateMeta?.updatedAtLabel || '-'} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="模板描述" name="description">
          <Input.TextArea rows={3} maxLength={4000} placeholder="描述模板的适用场景、流程范围和协作规则" />
        </Form.Item>
      </Form>
    </div>
  )
}

export default TemplateBaseForm
