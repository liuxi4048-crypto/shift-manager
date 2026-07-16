import { useState } from 'react'
import { newId } from '../utils/storage.js'

// 本部管理者（storeIdを持たない管理者）向け: 店舗の追加・名前変更・削除。
// 店舗を1件も作らなければ、これまで通り単一店舗として動作する。
export default function StorePanel({ stores, onChange }) {
  const [name, setName] = useState('')

  const addStore = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([...stores, { id: newId(), name: trimmed }])
    setName('')
  }

  const renameStore = (id, newName) => {
    onChange(stores.map((s) => (s.id === id ? { ...s, name: newName } : s)))
  }

  const removeStore = (id) => {
    const store = stores.find((s) => s.id === id)
    if (!window.confirm(`店舗「${store?.name}」を削除しますか？\nこの店舗に所属するスタッフは「店舗未設定」になります。`)) return
    onChange(stores.filter((s) => s.id !== id))
  }

  return (
    <section className="panel">
      <h2>店舗管理</h2>
      <div className="add-row">
        <input
          type="text"
          value={name}
          placeholder="店舗名を入力"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStore()}
        />
        <button className="primary" onClick={addStore}>追加</button>
      </div>
      <ul className="staff-list">
        {stores.map((s) => (
          <li key={s.id}>
            <input
              className="inline-edit"
              type="text"
              value={s.name}
              onChange={(e) => renameStore(s.id, e.target.value)}
            />
            <button className="ghost danger" onClick={() => removeStore(s.id)} title="削除">✕</button>
          </li>
        ))}
        {stores.length === 0 && <li className="empty">店舗はまだありません（作らなければ単一店舗として動作します）</li>}
      </ul>
    </section>
  )
}
