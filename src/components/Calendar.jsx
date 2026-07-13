import { WEEKDAY_LABELS, getCalendarWeeks, parseDateKey, todayKey } from '../utils/date.js'

export default function Calendar({ year, month, assignments, staff, shiftTypes, selectedDate, onSelectDate, requestsByDate = {} }) {
  const weeks = getCalendarWeeks(year, month)
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const typeById = new Map(shiftTypes.map((t) => [t.id, t]))
  const today = todayKey()

  return (
    <div className="calendar">
      <div className="calendar-header">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className={`weekday ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="calendar-week">
          {week.map((dateKey, di) => {
            if (!dateKey) return <div key={di} className="day-cell blank" />
            const { day } = parseDateKey(dateKey)
            const entries = assignments[dateKey] || []
            const classes = ['day-cell']
            if (dateKey === today) classes.push('today')
            if (dateKey === selectedDate) classes.push('selected')
            if (di === 0) classes.push('sun')
            if (di === 6) classes.push('sat')
            const requestCount = (requestsByDate[dateKey] || []).length
            return (
              <button key={di} className={classes.join(' ')} onClick={() => onSelectDate(dateKey)}>
                <span className="day-number">
                  {day}
                  {requestCount > 0 && <span className="request-badge" title={`シフト希望 ${requestCount}件`}>希{requestCount}</span>}
                </span>
                <span className="day-entries">
                  {entries.map((e, i) => {
                    const person = staffById.get(e.staffId)
                    const type = typeById.get(e.shiftTypeId)
                    if (!person || !type) return null
                    return (
                      <span key={i} className="entry-chip" style={{ background: type.color }}>
                        {person.name}
                        <small>{type.short}</small>
                      </span>
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
