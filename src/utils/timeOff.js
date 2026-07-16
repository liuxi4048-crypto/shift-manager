// 希望休（バイトが申請し、管理者が承認/却下するワークフロー）のGAS呼び出し。
// 既存の「シフト希望」（スプレッドシートからの読み取り専用インポート）とは別機能。

export const TIME_OFF_STATUS_LABEL = {
  pending: '審査中',
  approved: '承認済み',
  rejected: '却下',
}

export async function fetchTimeOffRequests(endpointUrl, token) {
  const url = new URL(endpointUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('action', 'timeOffRequests')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`希望休の取得に失敗しました（${res.status}）`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return Array.isArray(data.timeOffRequests) ? data.timeOffRequests : []
}

async function postAction(endpointUrl, token, action, payload) {
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...payload }),
  })
  if (!res.ok) throw new Error(`送信に失敗しました（${res.status}）`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

export function submitTimeOffRequest(endpointUrl, token, { staffId, date, reason }) {
  return postAction(endpointUrl, token, 'submitTimeOffRequest', { staffId, date, reason })
}

export function updateTimeOffRequest(endpointUrl, token, { requestId, status }) {
  return postAction(endpointUrl, token, 'updateTimeOffRequest', { requestId, status })
}

// 日付キー -> その日に承認済みの希望休を持つスタッフID配列
export function groupApprovedByDate(timeOffRequests) {
  const byDate = {}
  timeOffRequests
    .filter((r) => r.status === 'approved')
    .forEach((r) => {
      if (!r.date) return
      if (!byDate[r.date]) byDate[r.date] = []
      byDate[r.date].push(r.staffId)
    })
  return byDate
}
