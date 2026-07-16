// GAS Web App（スプレッドシート）経由の永続化。
// 保存先はローカルではなくスプレッドシートで、複数端末・複数スタッフ間で共有される。

export const DEFAULT_SHIFT_TYPES = [
  { id: 'early', name: '早番', short: '早', start: '07:00', end: '16:00', color: '#2e86de' },
  { id: 'late', name: '遅番', short: '遅', start: '13:00', end: '22:00', color: '#e67e22' },
  { id: 'night', name: '夜勤', short: '夜', start: '22:00', end: '07:00', color: '#8e44ad' },
  { id: 'off', name: '休み', short: '休', start: '00:00', end: '00:00', color: '#95a5a6' },
]

export const STAFF_COLORS = [
  '#e74c3c', '#2e86de', '#27ae60', '#e67e22', '#8e44ad',
  '#16a085', '#d35400', '#2c3e50', '#c0392b', '#7f8c8d',
]

export function defaultState() {
  return {
    staff: [],
    shiftTypes: DEFAULT_SHIFT_TYPES,
    assignments: {},
    stores: [],
  }
}

// GAS から返ってきた state の形を防御的に正規化する
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return defaultState()
  return {
    staff: Array.isArray(raw.staff) ? raw.staff.map(normalizeStaffMember) : [],
    shiftTypes: Array.isArray(raw.shiftTypes) && raw.shiftTypes.length > 0
      ? raw.shiftTypes
      : DEFAULT_SHIFT_TYPES,
    assignments: raw.assignments && typeof raw.assignments === 'object'
      ? raw.assignments
      : {},
    stores: Array.isArray(raw.stores) ? raw.stores : [],
  }
}

// role は 'admin'（管理者）または 'staff'（バイト）。未設定時は 'staff' 扱い。
// storeId が空の管理者は「本部管理者」として全店舗を切り替えて閲覧・管理できる。
export function normalizeStaffMember(s) {
  return {
    id: s.id,
    name: s.name || '',
    color: s.color || '',
    email: (s.email || '').trim().toLowerCase(),
    role: s.role === 'admin' ? 'admin' : 'staff',
    storeId: s.storeId || '',
  }
}

// ログイン中のメールアドレスから、対応するスタッフ（役割込み）を探す。
// email が空、もしくは一致するスタッフがいない場合は null。
export function findStaffByEmail(staff, email) {
  if (!email) return null
  const target = email.trim().toLowerCase()
  return staff.find((s) => s.email && s.email === target) || null
}

// assignments（日付キー -> [{staffId, shiftTypeId}]）を、指定したスタッフID集合に
// 含まれるエントリだけに絞り込む。他店舗のスタッフの割り当てをUI上に出さないための処理。
export function filterAssignmentsByStaffIds(assignments, staffIds) {
  const result = {}
  for (const [dateKey, entries] of Object.entries(assignments)) {
    const filtered = entries.filter((e) => staffIds.has(e.staffId))
    if (filtered.length > 0) result[dateKey] = filtered
  }
  return result
}

export async function fetchState(endpointUrl, token) {
  const url = new URL(endpointUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('action', 'state')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`データの取得に失敗しました（${res.status}）`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return normalizeState(data)
}

export async function saveState(endpointUrl, token, state) {
  // Content-Type を text/plain にすることで、GAS が応答しない CORS プリフライト
  // (OPTIONS) を発生させずに送信する（GAS Web App の既知の制約への対処）。
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action: 'saveState', ...state }),
  })
  if (!res.ok) throw new Error(`保存に失敗しました（${res.status}）`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
