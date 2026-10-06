const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** 840 -> '840 ms', 2350 -> '2.4 s', 185000 -> '3 min 5 s'. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  if (min < 60) return sec ? `${min} min ${sec} s` : `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** Age of something, rounded for reading: 'under 1 s', '4 s', '12 min', '3 h', '2 d'. */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) return '-'
  const s = Math.max(0, ms) / 1000
  if (s < 1) return 'under 1 s'
  if (s < 60) return `${Math.floor(s)} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 172_800) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86_400)} d`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function toDate(at: string | number | Date): Date | null {
  const d = at instanceof Date ? at : new Date(at)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Local wall-clock time, 24h, optional milliseconds: '14:03:27.412'. */
export function formatClock(at: string | number | Date, withMs = false): string {
  const d = toDate(at)
  if (!d) return '--:--:--'
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return withMs ? `${base}.${pad(d.getMilliseconds(), 3)}` : base
}

/** '2026-09-30 14:03' in local time. */
export function formatStamp(at: string | number | Date): string {
  const d = toDate(at)
  if (!d) return '----/--/-- --:--'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO string for a timestamp, or undefined when it does not parse (safe for a dateTime attribute). */
export function toIso(at: string | number | Date): string | undefined {
  return toDate(at)?.toISOString()
}
