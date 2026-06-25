import i18n from './i18n'
import type { Task } from '../types'

/**
 * taskSchedule — klasifikasi JADWAL/urgensi sebuah task (sumber tunggal).
 * Dipakai WorkboardView (desktop, kolom board) + WorkboardMobile (lane list)
 * supaya vocab + bucketing status TIDAK bercabang. Lihat memory
 * `project_status_label_fragmentation`.
 */

export type ScheduleTone = 'red' | 'amber' | 'green' | 'grey' | 'done'

export function taskIsOverdue(t: Task): boolean {
  return !!t.targetCompletion
    && new Date(t.targetCompletion).getTime() < Date.now()
    && t.status !== 'COMPLETED'
}

// Klasifikasi JADWAL/urgensi → { rank utk sort, label pill, tone }. Overdue/
// Delayed/At Risk punya tempat & warna, bukan terkubur di "In Progress".
// rank kecil = lebih genting (tampil di atas).
export function scheduleOf(
  item: Task,
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED',
): { rank: number; label: string; tone: ScheduleTone } {
  if (item.status === 'COMPLETED') return { rank: 5, label: '', tone: 'done' }
  if (taskIsOverdue(item)) return { rank: 0, label: i18n.t('Overdue'), tone: 'red' }
  if (item.isBlocked || item.status === 'BLOCKED') return { rank: 1, label: i18n.t('Blocked'), tone: 'red' }
  const h = normalizeHealthStatus(item.healthStatus ?? 'GREEN')
  if (h === 'RED') return { rank: 1, label: i18n.t('Delayed'), tone: 'red' }
  if (h === 'YELLOW') return { rank: 2, label: i18n.t('At Risk'), tone: 'amber' }
  if (item.status === 'BACKLOG' || item.status === 'READY') return { rank: 4, label: i18n.t('Not Started'), tone: 'grey' }
  return { rank: 3, label: i18n.t('On Track'), tone: 'green' }
}

// Map task → kolom Board (urgensi). Reuse scheduleOf. JUJUR: "Overdue" HANYA
// rank 0 (benar lewat tempo); Delayed & Blocked (rank 1) + At Risk (rank 2) →
// bucket "at-risk". 3→on-track, 4→not-started, 5→completed.
export const SCHEDULE_BUCKET_BY_RANK = ['overdue', 'at-risk', 'at-risk', 'on-track', 'not-started', 'completed']

export function scheduleBucket(item: Task, normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'): string {
  return SCHEDULE_BUCKET_BY_RANK[scheduleOf(item, normalizeHealthStatus).rank] ?? 'on-track'
}
