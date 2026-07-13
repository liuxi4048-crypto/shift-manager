// GAS 経由で取得したシフト希望データの整形

// GAS の doGet レスポンス { requests: [{ timestamp, name, date, shift, note }] } を
// 日付キーごとのグループにまとめる。
export function groupRequestsByDate(requests) {
  const byDate = {}
  for (const r of requests) {
    if (!r.date) continue
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r)
  }
  return byDate
}

export async function fetchShiftRequests(endpointUrl, token, monthPrefix) {
  if (!endpointUrl || !token) return []
  const url = new URL(endpointUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('action', 'requests')
  if (monthPrefix) url.searchParams.set('month', monthPrefix)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`シフト希望の取得に失敗しました（${res.status}）`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return Array.isArray(data.requests) ? data.requests : []
}
