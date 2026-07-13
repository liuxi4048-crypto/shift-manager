import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchShiftRequests, groupRequestsByDate } from './requests.js'

describe('groupRequestsByDate', () => {
  it('日付ごとにグループ化する', () => {
    const requests = [
      { date: '2026-07-14', name: '田中', shift: '早番' },
      { date: '2026-07-14', name: '佐藤', shift: '休み' },
      { date: '2026-07-15', name: '田中', shift: '遅番' },
    ]
    const grouped = groupRequestsByDate(requests)
    expect(grouped['2026-07-14']).toHaveLength(2)
    expect(grouped['2026-07-15']).toHaveLength(1)
  })

  it('date が空の行は無視する', () => {
    const requests = [{ date: '', name: '田中', shift: '早番' }]
    expect(groupRequestsByDate(requests)).toEqual({})
  })

  it('空配列は空オブジェクトを返す', () => {
    expect(groupRequestsByDate([])).toEqual({})
  })
})

describe('fetchShiftRequests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('action=requests と token, month をクエリに付与する（GAS側の action ルーティングと一致させる）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    await fetchShiftRequests('https://example.com/exec', 'tok', '2026-07')

    const calledUrl = new URL(fetchMock.mock.calls[0][0])
    expect(calledUrl.searchParams.get('action')).toBe('requests')
    expect(calledUrl.searchParams.get('token')).toBe('tok')
    expect(calledUrl.searchParams.get('month')).toBe('2026-07')
  })
})
