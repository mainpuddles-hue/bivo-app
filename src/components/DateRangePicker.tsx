import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface DateRangePickerProps {
  startDate: string | null
  endDate: string | null
  onSelect: (start: string | null, end: string | null) => void
  blockedDates?: string[]
  minDate?: string
}

const WEEKDAYS_FI = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su']
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SV = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

const MONTHS_FI = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SV = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DateRangePicker({
  startDate,
  endDate,
  onSelect,
  blockedDates = [],
  minDate,
}: DateRangePickerProps) {
  const { colors, isDark } = useTheme()
  const { locale } = useI18n()

  const today = useMemo(() => {
    const d = new Date()
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const effectiveMinDate = minDate ?? today

  const [viewYear, setViewYear] = useState(() => {
    if (startDate) return parseDateStr(startDate).getFullYear()
    return new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    if (startDate) return parseDateStr(startDate).getMonth()
    return new Date().getMonth()
  })

  const weekdays = locale === 'sv' ? WEEKDAYS_SV : locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_FI
  const months = locale === 'sv' ? MONTHS_SV : locale === 'en' ? MONTHS_EN : MONTHS_FI

  const blockedSet = useMemo(() => new Set(blockedDates), [blockedDates])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    // Monday = 0 ... Sunday = 6
    let startWeekday = firstDay.getDay() - 1
    if (startWeekday < 0) startWeekday = 6

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: (number | null)[] = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    // Pad to fill last row
    while (cells.length % 7 !== 0) cells.push(null)

    return cells
  }, [viewYear, viewMonth])

  const goToPrevMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 0) {
        setViewYear(y => y - 1)
        return 11
      }
      return prev - 1
    })
  }, [])

  const goToNextMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 11) {
        setViewYear(y => y + 1)
        return 0
      }
      return prev + 1
    })
  }, [])

  const handleDayPress = useCallback((day: number) => {
    const dateStr = toDateStr(viewYear, viewMonth, day)

    if (blockedSet.has(dateStr)) return
    if (dateStr < effectiveMinDate) return

    if (!startDate || (startDate && endDate)) {
      // Start fresh selection
      onSelect(dateStr, null)
    } else {
      // We have a start but no end
      if (dateStr < startDate) {
        // Tapped before start — make this the new start
        onSelect(dateStr, null)
      } else if (dateStr === startDate) {
        // Deselect
        onSelect(null, null)
      } else {
        // Check if any blocked date in range
        const s = parseDateStr(startDate)
        const e = parseDateStr(dateStr)
        let hasBlocked = false
        let cursor = new Date(s.getTime() + 86400000)
        while (cursor < e) {
          const cursorStr = toDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
          if (blockedSet.has(cursorStr)) {
            hasBlocked = true
            break
          }
          cursor = new Date(cursor.getTime() + 86400000)
        }
        if (hasBlocked) {
          // Start new selection
          onSelect(dateStr, null)
        } else {
          onSelect(startDate, dateStr)
        }
      }
    }
  }, [viewYear, viewMonth, startDate, endDate, blockedSet, effectiveMinDate, onSelect])

  const canGoPrev = useMemo(() => {
    const minD = parseDateStr(effectiveMinDate)
    return viewYear > minD.getFullYear() || (viewYear === minD.getFullYear() && viewMonth > minD.getMonth())
  }, [viewYear, viewMonth, effectiveMinDate])

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <Pressable onPress={goToPrevMonth} hitSlop={12} disabled={!canGoPrev} style={{ opacity: canGoPrev ? 1 : 0.3, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Previous month">
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.foreground }]}>
          {months[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={goToNextMonth} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Next month">
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={styles.weekRow}>
        {weekdays.map((wd) => (
          <View key={wd} style={styles.dayCell}>
            <Text style={[styles.weekdayText, { color: colors.mutedForeground }]}>{wd}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {calendarDays.map((day, idx) => {
          if (day == null) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />
          }

          const dateStr = toDateStr(viewYear, viewMonth, day)
          const isBlocked = blockedSet.has(dateStr)
          const isDisabled = dateStr < effectiveMinDate
          const isStart = startDate === dateStr
          const isEnd = endDate === dateStr
          const isInRange =
            startDate != null &&
            endDate != null &&
            dateStr > startDate &&
            dateStr < endDate
          const isSelected = isStart || isEnd
          const isToday = dateStr === today

          let bgColor = 'transparent'
          let textColor = colors.foreground

          if (isBlocked) {
            textColor = colors.mutedForeground
          } else if (isDisabled) {
            textColor = colors.mutedForeground
          } else if (isSelected) {
            bgColor = colors.primary
            textColor = colors.primaryForeground
          } else if (isInRange) {
            bgColor = isDark ? `${colors.primary}30` : `${colors.primary}18`
            textColor = colors.primary
          }

          // Range background strip
          let rangeLeft = false
          let rangeRight = false
          if (startDate && endDate) {
            if (isStart && dateStr !== endDate) rangeRight = true
            if (isEnd && dateStr !== startDate) rangeLeft = true
            if (isInRange) {
              rangeLeft = true
              rangeRight = true
            }
          }

          const rangeBg = isDark ? `${colors.primary}20` : `${colors.primary}10`

          return (
            <Pressable
              key={dateStr}
              onPress={() => handleDayPress(day)}
              disabled={isBlocked || isDisabled}
              style={styles.dayCell}
            >
              {/* Range background strip */}
              {rangeLeft && (
                <View style={[styles.rangeStripLeft, { backgroundColor: rangeBg }]} />
              )}
              {rangeRight && (
                <View style={[styles.rangeStripRight, { backgroundColor: rangeBg }]} />
              )}

              <View
                style={[
                  styles.dayCircle,
                  isSelected && { backgroundColor: bgColor },
                  isInRange && { backgroundColor: bgColor },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: textColor },
                    isBlocked && styles.blockedText,
                    isToday && !isSelected && { fontWeight: '700' },
                  ]}
                >
                  {day}
                </Text>
              </View>
              {isBlocked && <View style={[styles.blockedLine, { backgroundColor: colors.destructive }]} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const CELL_SIZE = 40

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fonts.heading,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: fonts.bodySemi,
  },
  blockedText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  blockedLine: {
    position: 'absolute',
    width: 18,
    height: 1.5,
    borderRadius: 1,
    zIndex: 3,
  },
  rangeStripLeft: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    width: '50%',
    zIndex: 1,
  },
  rangeStripRight: {
    position: 'absolute',
    right: 0,
    top: 3,
    bottom: 3,
    width: '50%',
    zIndex: 1,
  },
})
