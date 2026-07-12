// シフト集計ユーティリティ

// "HH:MM" 形式の開始・終了から勤務時間（時間単位）を返す。
// 開始と終了が同じ場合は休みなどの0時間枠、
// 終了が開始より前の場合は日をまたぐ夜勤として扱う（例: 22:00-07:00 → 9h）。
export function shiftDurationHours(start, end) {
  const toMin = (s) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }
  let diff = toMin(end) - toMin(start)
  if (diff === 0) return 0
  if (diff < 0) diff += 24 * 60
  return diff / 60
}

// assignments: { "YYYY-MM-DD": [{ staffId, shiftTypeId }] }
// 指定月（"YYYY-MM"）のスタッフ別の勤務日数・合計時間を返す。
export function monthlySummary(assignments, shiftTypes, monthPrefix) {
  const typeById = new Map(shiftTypes.map((t) => [t.id, t]))
  const summary = new Map() // staffId -> { days: Set, hours: number, countByType: Map }
  for (const [dateKey, entries] of Object.entries(assignments)) {
    if (!dateKey.startsWith(`${monthPrefix}-`)) continue
    for (const entry of entries) {
      const type = typeById.get(entry.shiftTypeId)
      if (!type) continue
      let s = summary.get(entry.staffId)
      if (!s) {
        s = { days: new Set(), hours: 0, countByType: new Map() }
        summary.set(entry.staffId, s)
      }
      const hours = shiftDurationHours(type.start, type.end)
      if (hours > 0) {
        s.days.add(dateKey)
        s.hours += hours
      }
      s.countByType.set(type.id, (s.countByType.get(type.id) || 0) + 1)
    }
  }
  const result = {}
  for (const [staffId, s] of summary) {
    result[staffId] = {
      days: s.days.size,
      hours: Math.round(s.hours * 100) / 100,
      countByType: Object.fromEntries(s.countByType),
    }
  }
  return result
}

// CSV エクスポート用の行列を作る（1行目ヘッダー、以降スタッフ×日）。
export function buildCsv(assignments, staff, shiftTypes, monthPrefix, totalDays) {
  const typeById = new Map(shiftTypes.map((t) => [t.id, t]))
  const header = ['スタッフ', ...Array.from({ length: totalDays }, (_, i) => `${i + 1}日`)]
  const rows = [header]
  for (const person of staff) {
    const row = [person.name]
    for (let d = 1; d <= totalDays; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, '0')}`
      const entries = assignments[key] || []
      const names = entries
        .filter((e) => e.staffId === person.id)
        .map((e) => typeById.get(e.shiftTypeId)?.name || '')
        .filter(Boolean)
      row.push(names.join('/'))
    }
    rows.push(row)
  }
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
}
