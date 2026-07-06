import { Card, Empty, Typography } from 'antd'

const { Paragraph, Title } = Typography

function MatrixPackageSpecialPage() {
  return (
    <Card variant="borderless">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Title level={4}>矩阵包全景图</Title>
            <Paragraph type="secondary">
              全景图功能建设中，后续将在这里承载矩阵包专项的整体视图。
            </Paragraph>
          </div>
        }
      />
    </Card>
  )
}

export default MatrixPackageSpecialPage
