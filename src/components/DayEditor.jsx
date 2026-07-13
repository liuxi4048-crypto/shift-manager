import { parseDateKey, WEEKDAY_LABELS } from '../utils/date.js'

// 選択した日のシフト割り当てを編集するパネル。
// スタッフ×シフト種別のトグルで直感的に割り当てる。
export default function DayEditor({ dateKey, assignments, staff, shiftTypes, onChange, onClose, requests = [] }) {
  const { year, month, day } = parseDateKey(dateKey)
  const weekday = WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]
  const entries = assignments[dateKey] || []

  const findEntry = (staffId) => entries.find((e) => e.staffId === staffId)

  const toggle = (staffId, shiftTypeId) => {
    const current = findEntry(staffId)
    let next
    if (current && current.shiftTypeId === shiftTypeId) {
      next = entries.filter((e) => e.staffId !== staffId)
    } else {
      next = [...entries.filter((e) => e.staffId !== staffId), { staffId, shiftTypeId }]
    }
    onChange(dateKey, next)
  }

  return (
    <section className="panel day-editor">
      <div className="day-editor-header">
        <h2>{month}月{day}日（{weekday}）のシフト</h2>
        <button className="ghost" onClick={onClose}>閉じる</button>
      </div>
      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r, i) => (
            <li key={i}>
              <strong>{r.name}</strong> 希望: {r.shift || '（未指定）'}
              {r.note && <span className="request-note"> ／ {r.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {staff.length === 0 ? (
        <p className="empty">先にスタッフを追加してください。</p>
      ) : (
        <table className="assign-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              {shiftTypes.map((t) => (
                <th key={t.id}>
                  <span className="type-badge" style={{ background: t.color }}>{t.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const current = findEntry(s.id)
              return (
                <tr key={s.id}>
                  <td className="staff-name">
                    <span className="color-dot" style={{ background: s.color }} />
                    {s.name}
                  </td>
                  {shiftTypes.map((t) => {
                    const active = current?.shiftTypeId === t.id
                    return (
                      <td key={t.id}>
                        <button
                          className={`toggle ${active ? 'active' : ''}`}
                          style={active ? { background: t.color, borderColor: t.color } : undefined}
                          onClick={() => toggle(s.id, t.id)}
                        >
                          {active ? '●' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
