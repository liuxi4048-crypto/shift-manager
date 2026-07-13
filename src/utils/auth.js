// Google Identity Services によるログイン状態管理。
// 注意: これはクライアントのみの簡易的なアクセス制御であり、
// 真のセキュリティ境界ではない（ブラウザの開発者ツールで回避可能）。
// 本格的な認可が必要な場合はサーバーサイドでの検証を追加すること。

const SESSION_KEY = 'shift-manager-auth-v1'

// JWT の payload 部分をデコードする（署名検証はしない）。
export function decodeJwtPayload(idToken) {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('不正なトークン形式です')
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const json = decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  )
  return JSON.parse(json)
}

export function getAllowedEmails() {
  const raw = import.meta.env.VITE_ALLOWED_STAFF_EMAILS || ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isEmailAllowed(email) {
  const allowed = getAllowedEmails()
  if (allowed.length === 0) return true // 未設定時は制限しない
  return allowed.includes(String(email).toLowerCase())
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
