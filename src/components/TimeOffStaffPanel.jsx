import { useState } from 'react'
import { TIME_OFF_STATUS_LABEL } from '../utils/timeOff.js'

// バイト向け: 自分の希望休を申請し、過去の申請状況を確認する。
// 審査中の申請は自分で取り消せる（承認/却下済みは不可）。
export default function TimeOffStaffPanel({ myRequests, onSubmit, onCancel, submitting, cancellingId }) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')

  const submit = async () => {
    if (!date) return
    await onSubmit({ date, reason })
    setDate('')
    setReason('')
  }

  const sorted = [...myRequests].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <section className="panel">
      <h2>希望休の申請</h2>
      <div className="add-row wrap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          type="text"
          placeholder="理由（任意）"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <button className="primary" onClick={submit} disabled={!date || submitting}>
          {submitting ? '送信中…' : '申請する'}
        </button>
      </div>

      <h2 style={{ marginTop: 16 }}>申請状況</h2>
      {sorted.length === 0 ? (
        <p className="empty">まだ申請はありません</p>
      ) : (
        <ul className="timeoff-list">
          {sorted.map((r) => (
            <li key={r.id} className={`timeoff-item status-${r.status}`}>
              <div className="timeoff-main">
                <span className="num">{r.date}</span>
                <span className={`status-pill status-${r.status}`}>{TIME_OFF_STATUS_LABEL[r.status] || r.status}</span>
              </div>
              {r.reason && <div className="timeoff-reason">理由: {r.reason}</div>}
              {r.status === 'pending' && (
                <div className="timeoff-actions">
                  <button
                    className="ghost danger"
                    disabled={cancellingId === r.id}
                    onClick={() => onCancel(r.id)}
                  >
                    {cancellingId === r.id ? '取り消し中…' : '取り消す'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
