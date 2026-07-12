// localStorage 永続化

const STORAGE_KEY = 'shift-manager-v1'

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
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    return {
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
      shiftTypes: Array.isArray(parsed.shiftTypes) && parsed.shiftTypes.length > 0
        ? parsed.shiftTypes
        : DEFAULT_SHIFT_TYPES,
      assignments: parsed.assignments && typeof parsed.assignments === 'object'
        ? parsed.assignments
        : {},
    }
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 容量超過などは黙って無視（画面上のデータは維持される）
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
