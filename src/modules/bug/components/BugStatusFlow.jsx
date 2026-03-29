import { Tag } from 'antd'
import './bug-status-flow.css'

const FLOW = [
  { code: 'NEW', label: '新建' },
  { code: 'PROCESSING', label: '处理中' },
  { code: 'FIXED', label: '已修复' },
  { code: 'CLOSED', label: '已关闭' },
]

function getFlowClassName(currentStatus, code) {
  if (currentStatus === code) return 'bug-status-flow__node is-current'
  if (currentStatus === 'REOPENED' && code === 'FIXED') return 'bug-status-flow__node is-passed'
  const currentIndex = FLOW.findIndex((item) => item.code === currentStatus)
  const nodeIndex = FLOW.findIndex((item) => item.code === code)
  if (currentIndex >= 0 && nodeIndex >= 0 && nodeIndex < currentIndex) {
    return 'bug-status-flow__node is-passed'
  }
  return 'bug-status-flow__node'
}

function BugStatusFlow({ currentStatus = 'NEW' }) {
  return (
    <div className="bug-status-flow">
      <div className="bug-status-flow__main">
        {FLOW.map((item, index) => (
          <div className="bug-status-flow__segment" key={item.code}>
            <div className={getFlowClassName(currentStatus, item.code)}>{item.label}</div>
            {index < FLOW.length - 1 ? <div className="bug-status-flow__line" /> : null}
          </div>
        ))}
      </div>
      {currentStatus === 'REOPENED' ? (
        <div className="bug-status-flow__reopened">
          <Tag color="red">重新打开</Tag>
        </div>
      ) : null}
    </div>
  )
}

export default BugStatusFlow
