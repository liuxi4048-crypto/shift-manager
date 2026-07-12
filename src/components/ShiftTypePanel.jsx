import { useState } from 'react'
import { newId } from '../utils/storage.js'
import { shiftDurationHours } from '../utils/stats.js'

const NEW_TYPE_COLORS = ['#2e86de', '#e67e22', '#8e44ad', '#27ae60', '#c0392b', '#16a085']

export default function ShiftTypePanel({ shiftTypes, onChange }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')

  const addType = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([
      ...shiftTypes,
      {
        id: newId(),
        name: trimmed,
        short: trimmed.slice(0, 1),
        start,
        end,
        color: NEW_TYPE_COLORS[shiftTypes.length % NEW_TYPE_COLORS.length],
      },
    ])
    setName('')
  }

  const removeType = (id) => {
    const type = shiftTypes.find((t) => t.id === id)
    if (!window.confirm(`シフト種別「${type?.name}」を削除しますか？`)) return
    onChange(shiftTypes.filter((t) => t.id !== id))
  }

  const isOff = (t) => t.start === t.end

  return (
    <section className="panel">
      <h2>シフト種別</h2>
      <div className="add-row wrap">
        <input
          type="text"
          value={name}
          placeholder="種別名（例: 中番）"
          onChange={(e) => setName(e.target.value)}
        />
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="tilde">〜</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="primary" onClick={addType}>追加</button>
      </div>
      <ul className="type-list">
        {shiftTypes.map((t) => (
          <li key={t.id}>
            <span className="type-badge" style={{ background: t.color }}>{t.short}</span>
            <span className="type-name">{t.name}</span>
            <span className="type-time">
              {isOff(t) ? '—' : `${t.start}〜${t.end}（${shiftDurationHours(t.start, t.end)}h）`}
            </span>
            <button className="ghost danger" onClick={() => removeType(t.id)} title="削除">✕</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
