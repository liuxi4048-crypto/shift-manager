import { describe, expect, it } from 'vitest'
import { buildCsv, monthlySummary, shiftDurationHours } from './stats.js'

describe('shiftDurationHours', () => {
  it('通常のシフト', () => expect(shiftDurationHours('07:00', '16:00')).toBe(9))
  it('30分単位', () => expect(shiftDurationHours('09:30', '18:00')).toBe(8.5))
  it('日をまたぐ夜勤', () => expect(shiftDurationHours('22:00', '07:00')).toBe(9))
  it('開始=終了は0時間（休み枠）', () => expect(shiftDurationHours('00:00', '00:00')).toBe(0))
})

const shiftTypes = [
  { id: 'early', name: '早番', start: '07:00', end: '16:00' },
  { id: 'night', name: '夜勤', start: '22:00', end: '07:00' },
  { id: 'off', name: '休み', start: '00:00', end: '00:00' },
]

describe('monthlySummary', () => {
  it('スタッフ別に日数・時間・種別回数を集計する', () => {
    const assignments = {
      '2026-07-01': [
        { staffId: 'a', shiftTypeId: 'early' },
        { staffId: 'b', shiftTypeId: 'night' },
      ],
      '2026-07-02': [{ staffId: 'a', shiftTypeId: 'night' }],
      '2026-07-03': [{ staffId: 'a', shiftTypeId: 'off' }],
      '2026-08-01': [{ staffId: 'a', shiftTypeId: 'early' }], // 対象月外
    }
    const summary = monthlySummary(assignments, shiftTypes, '2026-07')
    expect(summary.a).toEqual({
      days: 2,
      hours: 18,
      countByType: { early: 1, night: 1, off: 1 },
    })
    expect(summary.b).toEqual({
      days: 1,
      hours: 9,
      countByType: { night: 1 },
    })
  })

  it('休みは勤務日数・時間に含めない', () => {
    const assignments = { '2026-07-01': [{ staffId: 'a', shiftTypeId: 'off' }] }
    const summary = monthlySummary(assignments, shiftTypes, '2026-07')
    expect(summary.a.days).toBe(0)
    expect(summary.a.hours).toBe(0)
    expect(summary.a.countByType.off).toBe(1)
  })

  it('削除済みシフト種別は無視する', () => {
    const assignments = { '2026-07-01': [{ staffId: 'a', shiftTypeId: 'deleted' }] }
    expect(monthlySummary(assignments, shiftTypes, '2026-07')).toEqual({})
  })
})

describe('buildCsv', () => {
  it('スタッフ×日の行列を生成する', () => {
    const staff = [{ id: 'a', name: '田中' }]
    const assignments = { '2026-07-02': [{ staffId: 'a', shiftTypeId: 'early' }] }
    const csv = buildCsv(assignments, staff, shiftTypes, '2026-07', 3)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('"スタッフ","1日","2日","3日"')
    expect(lines[1]).toBe('"田中","","早番",""')
  })

  it('ダブルクォートをエスケープする', () => {
    const staff = [{ id: 'a', name: '田"中' }]
    const csv = buildCsv({}, staff, shiftTypes, '2026-07', 1)
    expect(csv.split('\r\n')[1]).toBe('"田""中",""')
  })
})
