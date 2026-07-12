import { describe, expect, it } from 'vitest'
import { addMonths, daysInMonth, formatDateKey, getCalendarWeeks, monthKey, parseDateKey } from './date.js'

describe('formatDateKey / parseDateKey', () => {
  it('ゼロ埋めしたキーを生成する', () => {
    expect(formatDateKey(2026, 7, 5)).toBe('2026-07-05')
  })

  it('キーを年月日に戻せる', () => {
    expect(parseDateKey('2026-07-05')).toEqual({ year: 2026, month: 7, day: 5 })
  })
})

describe('daysInMonth', () => {
  it('31日の月', () => expect(daysInMonth(2026, 7)).toBe(31))
  it('うるう年の2月', () => expect(daysInMonth(2024, 2)).toBe(29))
  it('平年の2月', () => expect(daysInMonth(2026, 2)).toBe(28))
})

describe('getCalendarWeeks', () => {
  it('2026年7月は水曜始まりで5週', () => {
    const weeks = getCalendarWeeks(2026, 7)
    expect(weeks).toHaveLength(5)
    // 7/1 は水曜（index 3）
    expect(weeks[0][2]).toBeNull()
    expect(weeks[0][3]).toBe('2026-07-01')
    expect(weeks[4][5]).toBe('2026-07-31')
    expect(weeks[4][6]).toBeNull()
  })

  it('全セル数は7の倍数', () => {
    for (let m = 1; m <= 12; m++) {
      const weeks = getCalendarWeeks(2026, m)
      for (const w of weeks) expect(w).toHaveLength(7)
    }
  })
})

describe('addMonths', () => {
  it('年をまたぐ前月', () => expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 }))
  it('年をまたぐ翌月', () => expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 }))
  it('同一年内', () => expect(addMonths(2026, 7, 1)).toEqual({ year: 2026, month: 8 }))
})

describe('monthKey', () => {
  it('ゼロ埋めされる', () => expect(monthKey(2026, 7)).toBe('2026-07'))
})
