import { describe, expect, it } from 'vitest'
import { decodeJwtPayload, isEmailAllowed } from './auth.js'

function makeToken(payload) {
  const b64 = (obj) => {
    const json = JSON.stringify(obj)
    const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    return btoa(bytes).replace(/=+$/, '')
  }
  return `${b64({ alg: 'none' })}.${b64(payload)}.signature`
}

describe('decodeJwtPayload', () => {
  it('payload を復元する', () => {
    const token = makeToken({ email: 'user@example.com', name: 'テスト' })
    expect(decodeJwtPayload(token)).toEqual({ email: 'user@example.com', name: 'テスト' })
  })

  it('不正な形式はエラーになる', () => {
    expect(() => decodeJwtPayload('not-a-jwt')).toThrow()
  })

  it('日本語を含む payload も復元できる', () => {
    const token = makeToken({ email: 'a@b.com', name: '田中太郎' })
    expect(decodeJwtPayload(token).name).toBe('田中太郎')
  })
})

describe('isEmailAllowed', () => {
  it('許可リスト未設定時は誰でも許可', () => {
    expect(isEmailAllowed('anyone@example.com')).toBe(true)
  })
})
