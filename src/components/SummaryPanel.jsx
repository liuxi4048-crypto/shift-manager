import { monthlySummary } from '../utils/stats.js'

export default function SummaryPanel({ assignments, staff, shiftTypes, monthPrefix }) {
  const summary = monthlySummary(assignments, shiftTypes, monthPrefix)

  return (
    <section className="panel">
      <h2>今月の集計</h2>
      {staff.length === 0 ? (
        <p className="empty">スタッフがいません</p>
      ) : (
        <table className="summary-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>勤務日数</th>
              <th>合計時間</th>
              {shiftTypes.map((t) => (
                <th key={t.id} title={t.name}>
                  <span className="type-badge" style={{ background: t.color }}>{t.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const row = summary[s.id]
              return (
                <tr key={s.id}>
                  <td className="staff-name">
                    <span className="color-dot" style={{ background: s.color }} />
                    {s.name}
                  </td>
                  <td className="num">{row?.days ?? 0}日</td>
                  <td className="num">{row?.hours ?? 0}h</td>
                  {shiftTypes.map((t) => (
                    <td key={t.id} className="num">{row?.countByType?.[t.id] ?? 0}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
