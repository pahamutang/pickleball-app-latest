import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { monthGrid, monthLabel, todayIso } from '../bookingTypes';

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Full month calendar for jumping straight to any future date (e.g. next
// week, next month) instead of tapping the prev/next-day arrows one at a
// time or scrolling the 14-day quick strip. Purely a UI concern — it just
// sets `selectedDate` the same way the arrows and the date strip already
// do, so everything downstream (the shared `reservations` fetch/realtime
// subscription in BookingContext, the availability grid's client-side
// filter by date) keeps working unchanged for whatever date gets picked
// here. No separate data-fetch path to keep in sync.
export default function CalendarPickerModal({
  visible,
  selectedDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedDate: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const today = todayIso();
  const [y, m] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(y);
  const [viewMonth, setViewMonth] = useState(m - 1); // 0-indexed

  // Re-center the grid on whatever date is currently selected every time
  // the modal is opened, so it never opens showing a stale month left
  // over from a previous visit.
  useEffect(() => {
    if (visible) {
      const [yy, mm] = selectedDate.split('-').map(Number);
      setViewYear(yy);
      setViewMonth(mm - 1);
    }
  }, [visible, selectedDate]);

  const [ty, tm] = today.split('-').map(Number);
  const isAtCurrentMonth = viewYear === ty && viewMonth === tm - 1;

  const goPrevMonth = () => {
    if (isAtCurrentMonth) return; // never navigate before the current month
    if (viewMonth === 0) {
      setViewYear((v) => v - 1);
      setViewMonth(11);
    } else {
      setViewMonth((v) => v - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((v) => v + 1);
      setViewMonth(0);
    } else {
      setViewMonth((v) => v + 1);
    }
  };

  const days = monthGrid(viewYear, viewMonth);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Pressable
              onPress={goPrevMonth}
              disabled={isAtCurrentMonth}
              style={[styles.navArrow, isAtCurrentMonth && styles.navArrowDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Text style={styles.navArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel(viewYear, viewMonth)}</Text>
            <Pressable
              onPress={goNextMonth}
              style={styles.navArrow}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Text style={styles.navArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_HEADERS.map((w, i) => (
              <Text key={i} style={styles.weekdayText}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((cell) => {
              const isPast = cell.iso < today;
              const isToday = cell.iso === today;
              const isSelected = cell.iso === selectedDate;
              return (
                <Pressable
                  key={cell.iso}
                  disabled={isPast}
                  onPress={() => onSelect(cell.iso)}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPast, selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.inCurrentMonth && styles.dayTextMuted,
                      isPast && styles.dayTextPast,
                      isToday && !isSelected && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {isToday && !isSelected && <View style={styles.todayDot} />}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => onSelect(today)}
            style={styles.todayButton}
            accessibilityRole="button"
          >
            <Text style={styles.todayButtonText}>Jump to Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F0EA',
  },
  navArrowDisabled: { opacity: 0.35 },
  navArrowText: { fontSize: 20, fontWeight: 'bold', color: AppColors.forestGreen },
  monthLabel: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  dayCellSelected: { backgroundColor: AppColors.forestGreen },
  dayText: { fontSize: 14, fontWeight: '600', color: '#222' },
  dayTextMuted: { color: '#c9c9c2' },
  dayTextPast: { color: '#d8d8d2' },
  dayTextToday: { color: AppColors.crimsonRed, fontWeight: '800' },
  dayTextSelected: { color: '#fff', fontWeight: '800' },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.crimsonRed,
  },
  todayButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F0EA',
  },
  todayButtonText: { color: AppColors.forestGreen, fontWeight: '700', fontSize: 13 },
});
