import { useEffect, useMemo, useState } from 'react'
import Calendar from './components/Calendar.jsx'
import DayEditor from './components/DayEditor.jsx'
import StaffPanel from './components/StaffPanel.jsx'
import ShiftTypePanel from './components/ShiftTypePanel.jsx'
import SummaryPanel from './components/SummaryPanel.jsx'
import ShiftRequestsPanel from './components/ShiftRequestsPanel.jsx'
import LoginGate from './components/LoginGate.jsx'
import { addMonths, daysInMonth, monthKey } from './utils/date.js'
import { buildCsv } from './utils/stats.js'
import { loadState, saveState } from './utils/storage.js'
import { groupRequestsByDate } from './utils/requests.js'

export default function App() {
  const [state, setState] = useState(loadState)
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [selectedDate, setSelectedDate] = useState(null)
  const [requestsByDate, setRequestsByDate] = useState({})

  useEffect(() => {
    saveState(state)
  }, [state])

  const monthPrefix = useMemo(() => monthKey(view.year, view.month), [view])

  const setStaff = (staff) => setState((s) => ({ ...s, staff }))
  const setShiftTypes = (shiftTypes) => setState((s) => ({ ...s, shiftTypes }))
  const setDayAssignments = (dateKey, entries) =>
    setState((s) => {
      const assignments = { ...s.assignments }
      if (entries.length === 0) {
        delete assignments[dateKey]
      } else {
        assignments[dateKey] = entries
      }
      return { ...s, assignments }
    })

  const moveMonth = (delta) => {
    setView((v) => addMonths(v.year, v.month, delta))
    setSelectedDate(null)
    setRequestsByDate({})
  }

  const goToday = () => {
    setView({ year: now.getFullYear(), month: now.getMonth() + 1 })
    setSelectedDate(null)
    setRequestsByDate({})
  }

  const exportCsv = () => {
    const csv = buildCsv(
      state.assignments,
      state.staff,
      state.shiftTypes,
      monthPrefix,
      daysInMonth(view.year, view.month),
    )
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-${monthPrefix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <LoginGate>
    <div className="app">
      <header className="app-header">
        <h1>シフト管理</h1>
        <div className="month-nav">
          <button onClick={() => moveMonth(-1)}>◀ 前月</button>
          <span className="month-label">{view.year}年{view.month}月</span>
          <button onClick={() => moveMonth(1)}>翌月 ▶</button>
          <button className="ghost" onClick={goToday}>今日</button>
        </div>
        <button className="primary" onClick={exportCsv}>CSV出力</button>
      </header>

      <main className="app-main">
        <div className="calendar-area">
          <Calendar
            year={view.year}
            month={view.month}
            assignments={state.assignments}
            staff={state.staff}
            shiftTypes={state.shiftTypes}
            selectedDate={selectedDate}
            onSelectDate={(key) => setSelectedDate((cur) => (cur === key ? null : key))}
            requestsByDate={requestsByDate}
          />
          {selectedDate && (
            <DayEditor
              dateKey={selectedDate}
              assignments={state.assignments}
              staff={state.staff}
              shiftTypes={state.shiftTypes}
              onChange={setDayAssignments}
              onClose={() => setSelectedDate(null)}
              requests={requestsByDate[selectedDate] || []}
            />
          )}
        </div>
        <aside className="sidebar">
          <StaffPanel staff={state.staff} onChange={setStaff} />
          <ShiftTypePanel shiftTypes={state.shiftTypes} onChange={setShiftTypes} />
          <ShiftRequestsPanel
            monthPrefix={monthPrefix}
            onLoaded={(requests) => setRequestsByDate(groupRequestsByDate(requests))}
          />
          <SummaryPanel
            assignments={state.assignments}
            staff={state.staff}
            shiftTypes={state.shiftTypes}
            monthPrefix={monthPrefix}
          />
        </aside>
      </main>

      <footer className="app-footer">
        日付をクリックしてシフトを割り当てます。データはこのブラウザに自動保存されます。
      </footer>
    </div>
    </LoginGate>
  )
}
