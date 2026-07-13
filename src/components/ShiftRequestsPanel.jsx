import { useState } from 'react'
import { fetchShiftRequests } from '../utils/requests.js'

const ENDPOINT_URL = import.meta.env.VITE_GAS_ENDPOINT_URL
const ACCESS_TOKEN = import.meta.env.VITE_GAS_ACCESS_TOKEN

export default function ShiftRequestsPanel({ monthPrefix, onLoaded }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)

  const configured = Boolean(ENDPOINT_URL && ACCESS_TOKEN)

  const load = async () => {
    setStatus('loading')
    setError('')
    try {
      const requests = await fetchShiftRequests(ENDPOINT_URL, ACCESS_TOKEN, monthPrefix)
      onLoaded(requests)
      setCount(requests.length)
      setStatus('done')
    } catch (e) {
      setError(e.message || '取得に失敗しました')
      setStatus('error')
    }
  }

  return (
    <section className="panel">
      <h2>シフト希望の取り込み</h2>
      {!configured ? (
        <p className="empty">
          GASのエンドポイントが未設定です。README を参照して環境変数を設定してください。
        </p>
      ) : (
        <>
          <button className="primary" onClick={load} disabled={status === 'loading'}>
            {status === 'loading' ? '取得中…' : `${monthPrefix} の希望を取り込む`}
          </button>
          {status === 'done' && <p className="hint">{count}件を取り込みました。カレンダー上に表示されます。</p>}
          {status === 'error' && <p className="error">{error}</p>}
        </>
      )}
    </section>
  )
}
