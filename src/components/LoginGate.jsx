import { useEffect, useRef, useState } from 'react'
import { clearSession, decodeJwtPayload, isEmailAllowed, loadSession, saveSession } from '../utils/auth.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Google アカウントでのログインを要求するゲート。
// クライアントのみの簡易チェックであり、真のセキュリティ境界ではない。
function loadValidSession() {
  const cached = loadSession()
  if (cached && !isEmailAllowed(cached.email)) {
    clearSession()
    return null
  }
  return cached
}

export default function LoginGate({ children }) {
  const [user, setUser] = useState(loadValidSession)
  const [error, setError] = useState('')
  const buttonRef = useRef(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (user || !clientId) return
    let cancelled = false
    loadGisScript()
      .then(() => {
        if (cancelled || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
        })
        if (buttonRef.current) {
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            locale: 'ja',
          })
        }
      })
      .catch(() => setError('Googleログインの読み込みに失敗しました'))
    return () => {
      cancelled = true
    }
  }, [user, clientId])

  const handleCredential = (response) => {
    try {
      const payload = decodeJwtPayload(response.credential)
      if (!isEmailAllowed(payload.email)) {
        setError(`「${payload.email}」はこのアプリの利用を許可されていません`)
        return
      }
      const loggedInUser = { email: payload.email, name: payload.name, picture: payload.picture }
      saveSession(loggedInUser)
      setUser(loggedInUser)
      setError('')
    } catch {
      setError('ログイン処理に失敗しました')
    }
  }

  const logout = () => {
    clearSession()
    setUser(null)
  }

  if (!clientId) {
    return (
      <div className="login-gate">
        <p className="empty">
          VITE_GOOGLE_CLIENT_ID が未設定のため、ログインなしで利用できます。
        </p>
        {children}
      </div>
    )
  }

  if (!user) {
    return (
      <div className="login-gate centered">
        <h1>シフト管理</h1>
        <p>Googleアカウントでログインしてください</p>
        <div ref={buttonRef} />
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="login-gate">
      <div className="user-bar">
        <span>{user.name} さんとしてログイン中（{user.email}）</span>
        <button className="ghost" onClick={logout}>ログアウト</button>
      </div>
      {children}
    </div>
  )
}
