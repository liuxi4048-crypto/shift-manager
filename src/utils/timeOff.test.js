import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTimeOffRequests,
  groupApprovedByDate,
  submitTimeOffRequest,
  updateTimeOffRequest,
} from './timeOff.js'

describe('groupApprovedByDate', () => {
  it('承認済みのみを日付ごとにグループ化する', () => {
    const requests = [
      { staffId: 'a', date: '2026-07-14', status: 'approved' },
      { staffId: 'b', date: '2026-07-14', status: 'pending' },
      { staffId: 'c', date: '2026-07-15', status: 'approved' },
      { staffId: 'd', date: '2026-07-15', status: 'rejected' },
    ]
    const grouped = groupApprovedByDate(requests)
    expect(grouped['2026-07-14']).toEqual(['a'])
    expect(grouped['2026-07-15']).toEqual(['c'])
  })

  it('承認済みが無ければ空オブジェクト', () => {
    expect(groupApprovedByDate([{ staffId: 'a', date: '2026-07-14', status: 'pending' }])).toEqual({})
  })
})

describe('GAS呼び出し', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchTimeOffRequests は action=timeOffRequests を付与する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ timeOffRequests: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchTimeOffRequests('https://example.com/exec', 'tok')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('action')).toBe('timeOffRequests')
  })

  it('submitTimeOffRequest は action と申請内容を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: 'x' }) })
    vi.stubGlobal('fetch', fetchMock)
    await submitTimeOffRequest('https://example.com/exec', 'tok', { staffId: 's1', date: '2026-07-20', reason: '私用' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.action).toBe('submitTimeOffRequest')
    expect(body.staffId).toBe('s1')
    expect(body.date).toBe('2026-07-20')
  })

  it('updateTimeOffRequest は action と判定結果を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await updateTimeOffRequest('https://example.com/exec', 'tok', { requestId: 'r1', status: 'approved' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.action).toBe('updateTimeOffRequest')
    expect(body.requestId).toBe('r1')
    expect(body.status).toBe('approved')
  })

  it('エラーレスポンスは例外にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'unauthorized' }) }))
    await expect(fetchTimeOffRequests('https://example.com/exec', 'bad')).rejects.toThrow('unauthorized')
  })
})
