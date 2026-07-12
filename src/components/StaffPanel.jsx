import { useState } from 'react'
import { STAFF_COLORS, newId } from '../utils/storage.js'

export default function StaffPanel({ staff, onChange }) {
  const [name, setName] = useState('')

  const addStaff = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const color = STAFF_COLORS[staff.length % STAFF_COLORS.length]
    onChange([...staff, { id: newId(), name: trimmed, color }])
    setName('')
  }

  const removeStaff = (id) => {
    const person = staff.find((s) => s.id === id)
    if (!window.confirm(`「${person?.name}」を削除しますか？\n割り当て済みのシフトも表示されなくなります。`)) return
    onChange(staff.filter((s) => s.id !== id))
  }

  const renameStaff = (id, newName) => {
    onChange(staff.map((s) => (s.id === id ? { ...s, name: newName } : s)))
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
          <li key={s.id}>
            <span className="color-dot" style={{ background: s.color }} />
            <input
              className="inline-edit"
              type="text"
              value={s.name}
              onChange={(e) => renameStaff(s.id, e.target.value)}
            />
            <button className="ghost danger" onClick={() => removeStaff(s.id)} title="削除">✕</button>
          </li>
        ))}
        {staff.length === 0 && <li className="empty">スタッフを追加してください</li>}
      </ul>
    </section>
  )
}
