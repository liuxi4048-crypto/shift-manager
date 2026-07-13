import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SHIFT_TYPES, fetchState, normalizeState, saveState } from './storage.js'

describe('normalizeState', () => {
  it('正しい形はそのまま返す', () => {
    const raw = { staff: [{ id: 'a', name: '田中' }], shiftTypes: [{ id: 't' }], assignments: { '2026-07-01': [] } }
    expect(normalizeState(raw)).toEqual(raw)
  })

  it('staff が配列でなければ空配列にする', () => {
    expect(normalizeState({ staff: null, shiftTypes: [{ id: 't' }], assignments: {} }).staff).toEqual([])
  })

  it('shiftTypes が空ならデフォルトを補う', () => {
    expect(normalizeState({ staff: [], shiftTypes: [], assignments: {} }).shiftTypes).toBe(DEFAULT_SHIFT_TYPES)
  })

  it('assignments が object でなければ空 object にする', () => {
    expect(normalizeState({ staff: [], shiftTypes: [{ id: 't' }], assignments: null }).assignments).toEqual({})
  })

  it('raw 自体が null ならデフォルト state を返す', () => {
    const result = normalizeState(null)
    expect(result.staff).toEqual([])
    expect(result.shiftTypes).toBe(DEFAULT_SHIFT_TYPES)
  })
})

describe('fetchState / saveState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchState は action=state とトークンをクエリに付与する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ staff: [], shiftTypes: [], assignments: {} }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchState('https://example.com/exec', 'tok')

    const calledUrl = new URL(fetchMock.mock.calls[0][0])
    expect(calledUrl.searchParams.get('action')).toBe('state')
    expect(calledUrl.searchParams.get('token')).toBe('tok')
  })

  it('fetchState はエラーレスポンスを例外にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'unauthorized' }) }))
    await expect(fetchState('https://example.com/exec', 'bad')).rejects.toThrow('unauthorized')
  })

  it('saveState は text/plain で POST し、token と state をまとめて送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await saveState('https://example.com/exec', 'tok', { staff: [{ id: 'a' }], shiftTypes: [], assignments: {} })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/exec')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toMatch(/text\/plain/)
    const body = JSON.parse(options.body)
    expect(body.token).toBe('tok')
    expect(body.staff).toEqual([{ id: 'a' }])
  })

  it('saveState は HTTP エラーを例外にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(saveState('https://example.com/exec', 'tok', { staff: [], shiftTypes: [], assignments: {} }))
      .rejects.toThrow('500')
  })
})
