import { Card, Empty, Typography } from 'antd'

const { Paragraph, Title } = Typography

function MatrixPackageSpecialPage() {
  return (
    <Card variant="borderless">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Title level={4}>矩阵包专项</Title>
            <Paragraph type="secondary">
              专项功能建设中，后续将在这里承载矩阵包相关管理能力。
            </Paragraph>
          </div>
        }
      />
    </Card>
  )
}

export default MatrixPackageSpecialPage
