// 日付ユーティリティ。日付キーはすべて "YYYY-MM-DD" 形式のローカル日付で扱う。

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function monthKey(year, month) {
  return `${year}-${pad2(month)}`
}

// month: 1-12。カレンダー表示用に、日曜始まりの週配列を返す。
// 各セルは日付キー文字列、月外は null。
export function getCalendarWeeks(year, month) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const total = daysInMonth(year, month)
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(formatDateKey(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function addMonths(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12 + 12) % 12 + 1 }
}

export function todayKey(now = new Date()) {
  return formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
