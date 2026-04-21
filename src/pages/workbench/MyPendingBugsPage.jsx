import BugListPage from '../bug/BugListPage'

function MyPendingBugsPage() {
  return (
    <BugListPage
      pageTitle="待处理bug"
      pageSubtitle="仅展示处理人为当前登录人的 Bug 列表。"
      forceAssigneeId="CURRENT_USER"
      openBugTitleInNewTab
      allowCreate={false}
      detailSource="workbench_pending_bugs"
    />
  )
}

export default MyPendingBugsPage
