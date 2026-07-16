import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHIFT_TYPES,
  fetchState,
  filterAssignmentsByStaffIds,
  findStaffByEmail,
  normalizeState,
  normalizeStaffMember,
  saveState,
} from './storage.js'

describe('normalizeState', () => {
  it('スタッフに email/role/storeId のデフォルトを補いつつ形を維持する', () => {
    const raw = { staff: [{ id: 'a', name: '田中' }], shiftTypes: [{ id: 't' }], assignments: { '2026-07-01': [] } }
    const result = normalizeState(raw)
    expect(result.staff).toEqual([{ id: 'a', name: '田中', color: '', email: '', role: 'staff', storeId: '' }])
    expect(result.shiftTypes).toEqual(raw.shiftTypes)
    expect(result.assignments).toEqual(raw.assignments)
    expect(result.stores).toEqual([])
  })

  it('stores が配列でなければ空配列にする', () => {
    expect(normalizeState({ staff: [], shiftTypes: [{ id: 't' }], assignments: {}, stores: null }).stores).toEqual([])
  })

  it('stores をそのまま保持する', () => {
    const stores = [{ id: 's1', name: '渋谷店' }]
    expect(normalizeState({ staff: [], shiftTypes: [{ id: 't' }], assignments: {}, stores }).stores).toEqual(stores)
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

describe('normalizeStaffMember', () => {
  it('role が admin 以外なら staff にする', () => {
    expect(normalizeStaffMember({ id: 'a', role: 'manager' }).role).toBe('staff')
    expect(normalizeStaffMember({ id: 'a', role: undefined }).role).toBe('staff')
    expect(normalizeStaffMember({ id: 'a', role: 'admin' }).role).toBe('admin')
  })

  it('email を trim・小文字化する', () => {
    expect(normalizeStaffMember({ id: 'a', email: '  User@Example.com  ' }).email).toBe('user@example.com')
  })

  it('storeId が無ければ空文字にする', () => {
    expect(normalizeStaffMember({ id: 'a' }).storeId).toBe('')
    expect(normalizeStaffMember({ id: 'a', storeId: 'store1' }).storeId).toBe('store1')
  })
})

describe('filterAssignmentsByStaffIds', () => {
  it('指定したスタッフIDのエントリだけを残す', () => {
    const assignments = {
      '2026-07-14': [{ staffId: 'a', shiftTypeId: 'early' }, { staffId: 'b', shiftTypeId: 'late' }],
      '2026-07-15': [{ staffId: 'b', shiftTypeId: 'night' }],
    }
    const result = filterAssignmentsByStaffIds(assignments, new Set(['a']))
    expect(result).toEqual({ '2026-07-14': [{ staffId: 'a', shiftTypeId: 'early' }] })
  })

  it('該当エントリが無い日付は結果に含めない', () => {
    const assignments = { '2026-07-14': [{ staffId: 'b', shiftTypeId: 'early' }] }
    expect(filterAssignmentsByStaffIds(assignments, new Set(['a']))).toEqual({})
  })

  it('空のassignmentsは空を返す', () => {
    expect(filterAssignmentsByStaffIds({}, new Set(['a']))).toEqual({})
  })
})

describe('findStaffByEmail', () => {
  const staff = [
    { id: 'a', email: 'tanaka@example.com', role: 'admin' },
    { id: 'b', email: 'sato@example.com', role: 'staff' },
  ]

  it('大文字小文字を無視して一致するスタッフを返す', () => {
    expect(findStaffByEmail(staff, 'Tanaka@Example.com').id).toBe('a')
  })

  it('一致しなければ null', () => {
    expect(findStaffByEmail(staff, 'unknown@example.com')).toBeNull()
  })

  it('email が空なら null', () => {
    expect(findStaffByEmail(staff, '')).toBeNull()
    expect(findStaffByEmail(staff, undefined)).toBeNull()
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
    expect(body.action).toBe('saveState')
    expect(body.staff).toEqual([{ id: 'a' }])
  })

  it('saveState は HTTP エラーを例外にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(saveState('https://example.com/exec', 'tok', { staff: [], shiftTypes: [], assignments: {} }))
      .rejects.toThrow('500')
  })
})
