import { TIME_OFF_STATUS_LABEL } from '../utils/timeOff.js'

// 管理者向け: 希望休の一覧表示・承認・却下。
// 審査中のものを先頭に、日付が近い順に並べる。
export default function TimeOffAdminPanel({ timeOffRequests, staff, onDecide, busyId }) {
  const staffById = new Map(staff.map((s) => [s.id, s]))

  const sorted = [...timeOffRequests].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return (a.date || '').localeCompare(b.date || '')
  })

  return (
    <section className="panel">
      <h2>希望休の申請一覧</h2>
      {sorted.length === 0 ? (
        <p className="empty">申請はまだありません</p>
      ) : (
        <ul className="timeoff-list">
          {sorted.map((r) => {
            const person = staffById.get(r.staffId)
            return (
              <li key={r.id} className={`timeoff-item status-${r.status}`}>
                <div className="timeoff-main">
                  <span className="color-dot" style={{ background: person?.color || '#999' }} />
                  <strong>{person?.name || '不明なスタッフ'}</strong>
                  <span className="num">{r.date}</span>
                  <span className={`status-pill status-${r.status}`}>{TIME_OFF_STATUS_LABEL[r.status] || r.status}</span>
                </div>
                {r.reason && <div className="timeoff-reason">理由: {r.reason}</div>}
                {r.status === 'pending' && (
                  <div className="timeoff-actions">
                    <button
                      className="primary"
                      disabled={busyId === r.id}
                      onClick={() => onDecide(r.id, 'approved')}
                    >
                      承認
                    </button>
                    <button
                      className="ghost danger"
                      disabled={busyId === r.id}
                      onClick={() => onDecide(r.id, 'rejected')}
                    >
                      却下
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
