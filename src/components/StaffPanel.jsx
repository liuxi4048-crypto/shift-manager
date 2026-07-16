import { useState } from 'react'
import { STAFF_COLORS, newId } from '../utils/storage.js'

export default function StaffPanel({ staff, onChange }) {
  const [name, setName] = useState('')

  const addStaff = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const color = STAFF_COLORS[staff.length % STAFF_COLORS.length]
    onChange([...staff, { id: newId(), name: trimmed, color, email: '', role: 'staff' }])
    setName('')
  }

  const removeStaff = (id) => {
    const person = staff.find((s) => s.id === id)
    if (!window.confirm(`「${person?.name}」を削除しますか？\n割り当て済みのシフトも表示されなくなります。`)) return
    onChange(staff.filter((s) => s.id !== id))
  }

  const updateStaff = (id, patch) => {
    onChange(staff.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  return (
    <section className="panel">
      <h2>スタッフ</h2>
      <div className="add-row">
        <input
          type="text"
          value={name}
          placeholder="名前を入力"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStaff()}
        />
        <button className="primary" onClick={addStaff}>追加</button>
      </div>
      <ul className="staff-list">
        {staff.map((s) => (
          <li key={s.id} className="staff-row">
            <div className="staff-row-main">
              <span className="color-dot" style={{ background: s.color }} />
              <input
                className="inline-edit"
                type="text"
                value={s.name}
                onChange={(e) => updateStaff(s.id, { name: e.target.value })}
              />
              <button className="ghost danger" onClick={() => removeStaff(s.id)} title="削除">✕</button>
            </div>
            <div className="staff-row-sub">
              <input
                className="inline-edit staff-email"
                type="email"
                placeholder="ログイン用メールアドレス"
                value={s.email || ''}
                onChange={(e) => updateStaff(s.id, { email: e.target.value })}
              />
              <select
                className="staff-role"
                value={s.role === 'admin' ? 'admin' : 'staff'}
                onChange={(e) => updateStaff(s.id, { role: e.target.value })}
              >
                <option value="staff">バイト</option>
                <option value="admin">管理者</option>
              </select>
            </div>
          </li>
        ))}
        {staff.length === 0 && <li className="empty">スタッフを追加してください</li>}
      </ul>
      <p className="hint">
        メールアドレスは、そのスタッフがGoogleログインする際のアカウントと一致させてください。役割によって画面・操作範囲が変わります。
      </p>
    </section>
  )
}
