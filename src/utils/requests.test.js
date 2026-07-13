import { describe, expect, it } from 'vitest'
import { groupRequestsByDate } from './requests.js'

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
