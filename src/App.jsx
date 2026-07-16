import { useEffect, useMemo, useRef, useState } from 'react'
import Calendar from './components/Calendar.jsx'
import DayEditor from './components/DayEditor.jsx'
import StaffPanel from './components/StaffPanel.jsx'
import ShiftTypePanel from './components/ShiftTypePanel.jsx'
import SummaryPanel from './components/SummaryPanel.jsx'
import ShiftRequestsPanel from './components/ShiftRequestsPanel.jsx'
import TimeOffAdminPanel from './components/TimeOffAdminPanel.jsx'
import TimeOffStaffPanel from './components/TimeOffStaffPanel.jsx'
import LoginGate from './components/LoginGate.jsx'
import { addMonths, daysInMonth, monthKey } from './utils/date.js'
import { buildCsv } from './utils/stats.js'
import { fetchState, findStaffByEmail, saveState } from './utils/storage.js'
import { groupRequestsByDate } from './utils/requests.js'
import { fetchTimeOffRequests, groupApprovedByDate, submitTimeOffRequest, updateTimeOffRequest } from './utils/timeOff.js'

const ENDPOINT_URL = import.meta.env.VITE_GAS_ENDPOINT_URL
const ACCESS_TOKEN = import.meta.env.VITE_GAS_ACCESS_TOKEN
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SAVE_DEBOUNCE_MS = 800

const SAVE_STATUS_LABEL = {
  saving: '保存中…',
  saved: '保存済み',
  error: '保存に失敗しました',
}

export default function App() {
  const configured = Boolean(ENDPOINT_URL && ACCESS_TOKEN)

  return (
    <LoginGate>
      {(user) => (configured ? (
        <ShiftManagerApp user={user} />
      ) : (
        <div className="app">
          <div className="setup-required">
            <h1>シフト管理</h1>
            <p>
              データの保存先となるスプレッドシート（GAS Web App）が未設定です。
              README を参照して <code>VITE_GAS_ENDPOINT_URL</code> と{' '}
              <code>VITE_GAS_ACCESS_TOKEN</code> を設定してください。
            </p>
          </div>
        </div>
      ))}
    </LoginGate>
  )
}

function ShiftManagerApp({ user }) {
  const [state, setState] = useState(null) // null = 読み込み中
  const [timeOffRequests, setTimeOffRequests] = useState([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const [saveErrorMessage, setSaveErrorMessage] = useState('')
  const [timeOffBusyId, setTimeOffBusyId] = useState(null)
  const [timeOffSubmitting, setTimeOffSubmitting] = useState(false)
  const isFirstStateChange = useRef(true)
  const saveGeneration = useRef(0)

  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [selectedDate, setSelectedDate] = useState(null)
  const [requestsByDate, setRequestsByDate] = useState({})

  // 初回読み込み（スプレッドシートから取得）
  useEffect(() => {
    let cancelled = false
    setState(null)
    setLoadError('')
    isFirstStateChange.current = true
    Promise.all([
      fetchState(ENDPOINT_URL, ACCESS_TOKEN),
      fetchTimeOffRequests(ENDPOINT_URL, ACCESS_TOKEN).catch(() => []),
    ])
      .then(([s, timeOff]) => {
        if (cancelled) return
        setState(s)
        setTimeOffRequests(timeOff)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message || '読み込みに失敗しました')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // 変更を自動保存（デバウンス）。初回読み込み直後の1回はスキップし、
  // 読み込み前の空状態でスプレッドシートを上書きしないようにする。
  useEffect(() => {
    if (state === null) return
    if (isFirstStateChange.current) {
      isFirstStateChange.current = false
      return
    }
    const generation = ++saveGeneration.current
    setSaveStatus('saving')
    const timer = setTimeout(() => {
      saveState(ENDPOINT_URL, ACCESS_TOKEN, state)
        .then(() => {
          if (saveGeneration.current === generation) setSaveStatus('saved')
        })
        .catch((e) => {
          if (saveGeneration.current === generation) {
            setSaveStatus('error')
            setSaveErrorMessage(e.message || '保存に失敗しました')
          }
        })
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state])

  const monthPrefix = useMemo(() => monthKey(view.year, view.month), [view])

  // 表示中の月が変わったら、前の月のシフト希望をカレンダー上に残さない
  useEffect(() => {
    setRequestsByDate({})
  }, [monthPrefix])

  // ---- 役割判定 ----
  // Googleログインが未設定の場合は誰でも管理者相当として使える（開発・検証向け）。
  const loginConfigured = Boolean(GOOGLE_CLIENT_ID)
  const currentStaff = loginConfigured && state ? findStaffByEmail(state.staff, user?.email) : null
  const role = !loginConfigured ? 'admin' : (currentStaff ? currentStaff.role : null)
  const isAdmin = role === 'admin'

  const approvedTimeOffByDate = useMemo(() => groupApprovedByDate(timeOffRequests), [timeOffRequests])
  const myTimeOffRequests = useMemo(
    () => (currentStaff ? timeOffRequests.filter((r) => r.staffId === currentStaff.id) : []),
    [timeOffRequests, currentStaff],
  )

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

  const decideTimeOff = async (requestId, status) => {
    setTimeOffBusyId(requestId)
    try {
      await updateTimeOffRequest(ENDPOINT_URL, ACCESS_TOKEN, { requestId, status })
      setTimeOffRequests((list) => list.map((r) => (r.id === requestId ? { ...r, status } : r)))
    } catch (e) {
      window.alert(e.message || '処理に失敗しました')
    } finally {
      setTimeOffBusyId(null)
    }
  }

  const submitMyTimeOff = async ({ date, reason }) => {
    if (!currentStaff) return
    setTimeOffSubmitting(true)
    try {
      const result = await submitTimeOffRequest(ENDPOINT_URL, ACCESS_TOKEN, { staffId: currentStaff.id, date, reason })
      setTimeOffRequests((list) => [
        ...list,
        { id: result.id, staffId: currentStaff.id, date, reason, status: 'pending', requestedAt: null, processedAt: null },
      ])
    } catch (e) {
      window.alert(e.message || '申請に失敗しました')
    } finally {
      setTimeOffSubmitting(false)
    }
  }

  const moveMonth = (delta) => {
    setView((v) => addMonths(v.year, v.month, delta))
    setSelectedDate(null)
  }

  const goToday = () => {
    setView({ year: now.getFullYear(), month: now.getMonth() + 1 })
    setSelectedDate(null)
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

  if (loadError) {
    return (
      <div className="app">
        <div className="setup-required">
          <h1>シフト管理</h1>
          <p className="error">読み込みに失敗しました: {loadError}</p>
          <button className="primary" onClick={() => setReloadKey((k) => k + 1)}>再試行</button>
        </div>
      </div>
    )
  }

  if (state === null) {
    return (
      <div className="app">
        <div className="setup-required">
          <p>読み込み中…</p>
        </div>
      </div>
    )
  }

  if (loginConfigured && !currentStaff) {
    return (
      <div className="app">
        <div className="setup-required">
          <h1>シフト管理</h1>
          <p className="error">
            「{user?.email}」はスタッフとして登録されていません。管理者にスタッフ登録を依頼してください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>シフト管理{!isAdmin && <span className="role-badge">バイト用</span>}</h1>
        <div className="month-nav">
          <button onClick={() => moveMonth(-1)}>◀ 前月</button>
          <span className="month-label">{view.year}年{view.month}月</span>
          <button onClick={() => moveMonth(1)}>翌月 ▶</button>
          <button className="ghost" onClick={goToday}>今日</button>
        </div>
        {isAdmin && (
          <span className={`save-status save-status-${saveStatus}`}>
            {SAVE_STATUS_LABEL[saveStatus] || ''}
            {saveStatus === 'error' && saveErrorMessage && `（${saveErrorMessage}）`}
          </span>
        )}
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
            approvedTimeOffByDate={approvedTimeOffByDate}
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
              readOnly={!isAdmin}
              approvedTimeOffStaffIds={approvedTimeOffByDate[selectedDate] || []}
            />
          )}
        </div>
        <aside className="sidebar">
          {isAdmin ? (
            <>
              <StaffPanel staff={state.staff} onChange={setStaff} />
              <ShiftTypePanel shiftTypes={state.shiftTypes} onChange={setShiftTypes} />
              <ShiftRequestsPanel
                monthPrefix={monthPrefix}
                onLoaded={(requests) => setRequestsByDate(groupRequestsByDate(requests))}
              />
              <TimeOffAdminPanel
                timeOffRequests={timeOffRequests}
                staff={state.staff}
                onDecide={decideTimeOff}
                busyId={timeOffBusyId}
              />
              <SummaryPanel
                assignments={state.assignments}
                staff={state.staff}
                shiftTypes={state.shiftTypes}
                monthPrefix={monthPrefix}
              />
            </>
          ) : (
            <>
              <TimeOffStaffPanel
                myRequests={myTimeOffRequests}
                onSubmit={submitMyTimeOff}
                submitting={timeOffSubmitting}
              />
              <SummaryPanel
                assignments={state.assignments}
                staff={state.staff}
                shiftTypes={state.shiftTypes}
                monthPrefix={monthPrefix}
              />
            </>
          )}
        </aside>
      </main>

      <footer className="app-footer">
        {isAdmin
          ? '日付をクリックしてシフトを割り当てます。データはスプレッドシートに自動保存されます。'
          : '日付をクリックするとその日のシフトを確認できます（閲覧のみ）。'}
      </footer>
    </div>
  )
}
