import { useState } from 'react'
import type { CharterPayload } from '../../../types/charter'

type Props = {
  data: CharterPayload
}

/**
 * Export PPTX button — lazy-loads pptxgenjs and the exporter module
 * only when the user actually clicks. Initial Charter View payload
 * stays light (no pptxgenjs in the page chunk).
 */
export function ExportButton({ data }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const { exportProgramCharter } = await import('../../../lib/exporters/programCharterPptx')
      await exportProgramCharter(data)
    } catch (err) {
      console.error('[charter] export failed', err)
      setError(err instanceof Error ? err.message : 'Export gagal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cs-export-wrap">
      <button
        type="button"
        className="charter-export-button cs-export cs-export--ready"
        onClick={handleExport}
        disabled={loading}
        title="Unduh Charter sebagai PPTX"
      >
        {loading ? 'Menyiapkan…' : 'Export PPTX'}
      </button>
      {error && <span className="cs-export-error">{error}</span>}
    </div>
  )
}
