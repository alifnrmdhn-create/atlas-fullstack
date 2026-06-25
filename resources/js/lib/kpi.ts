import type { HealthStatus } from '../types'
import i18n from './i18n'

type KpiTone = 'on-track' | 'at-risk' | 'off-track' | 'muted'

const CURRENCY_PREFIX = /^rp\b\.?/i

const formatKpiNumber = (value: number) => {
  const n = Number(value)
  if (isNaN(n)) return '0'
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

const isCurrencyKpi = (unit?: string | null, dataType?: string | null) =>
  dataType === 'CURRENCY' || CURRENCY_PREFIX.test(unit?.trim() ?? '')

const getCurrencyScale = (unit?: string | null) => {
  const normalized = unit?.replace(CURRENCY_PREFIX, '').trim()
  return normalized || undefined
}

export function formatKpiValueParts(value?: number | string | null, unit?: string | null, dataType?: string | null) {
  const numericValue = Number(value ?? 0)

  if (isCurrencyKpi(unit, dataType)) {
    const sign = numericValue < 0 ? '-' : ''
    return {
      valueText: `Rp ${sign}${formatKpiNumber(Math.abs(numericValue))}`,
      unitText: getCurrencyScale(unit),
    }
  }

  if (unit === '%') {
    return {
      valueText: formatKpiNumber(numericValue),
      unitText: '%',
    }
  }

  return {
    valueText: formatKpiNumber(numericValue),
    unitText: unit?.trim() || undefined,
  }
}

export function formatKpiValue(value?: number | null, unit?: string | null, dataType?: string | null) {
  const { valueText, unitText } = formatKpiValueParts(value, unit, dataType)
  if (unitText === '%') return `${valueText}%`
  return unitText ? `${valueText} ${unitText}` : valueText
}

export function getKpiTone(status?: string | null): KpiTone {
  const normalized = status?.toUpperCase()

  if (normalized === 'GREEN') return 'on-track'
  if (normalized === 'YELLOW') return 'at-risk'
  if (normalized === 'RED') return 'off-track'
  return 'muted'
}

export function getKpiStatusLabel(status?: string | null) {
  const normalized = status?.toUpperCase()

  if (normalized === 'GREEN') return i18n.t('On Track')
  if (normalized === 'YELLOW') return i18n.t('At Risk')
  if (normalized === 'RED') return i18n.t('Off Track')
  return i18n.t('Not Measured')
}

export function getKpiFillPercent(actualValue?: number | null, targetValue?: number | null) {
  const actual = actualValue ?? 0
  const target = targetValue ?? 0

  if (target === 0) return 0

  const ratio = Math.abs(actual) / Math.abs(target)
  if (!Number.isFinite(ratio)) return 0

  return Math.max(0, Math.min(Math.round(ratio * 100), 100))
}

export function normalizeKpiStatus(status?: string | null): HealthStatus | null {
  const normalized = status?.toUpperCase()

  if (normalized === 'GREEN' || normalized === 'YELLOW' || normalized === 'RED') {
    return normalized
  }

  return null
}
