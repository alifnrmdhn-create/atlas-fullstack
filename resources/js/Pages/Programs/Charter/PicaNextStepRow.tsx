import type { CharterProgressLog } from '../../../types/charter'

type Props = {
  log: CharterProgressLog
}

/**
 * Two-column row mirroring DKMR PPT bottom panel:
 *   - Left: Identifikasi Masalah → Tindakan Korektif (PICA)
 *   - Right: Langkah Selanjutnya + Dukungan Dibutuhkan
 */
export function PicaNextStepRow({ log }: Props) {
  const noPica = !log.problemIdentification && !log.correctiveAction
  const noNext = !log.nextStep && !log.supportNeeded

  return (
    <div className="cs-pica">
      <section className="cs-pica__card">
        <div className="cs-pica__label">Problem Identification → Corrective Action</div>
        {noPica ? (
          <p className="cs-pica__empty">No problems documented.</p>
        ) : (
          <div className="cs-pica__body">
            {log.problemIdentification && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">Problem</span>
                <p className="cs-pica__block-text">{log.problemIdentification}</p>
              </div>
            )}
            {log.correctiveAction && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">Corrective Action</span>
                <p className="cs-pica__block-text">{log.correctiveAction}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="cs-pica__card">
        <div className="cs-pica__label">Next Steps</div>
        {noNext ? (
          <p className="cs-pica__empty">Not yet defined.</p>
        ) : (
          <div className="cs-pica__body">
            {log.nextStep && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">Rencana</span>
                <p className="cs-pica__block-text">{log.nextStep}</p>
              </div>
            )}
            {log.supportNeeded && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">Dukungan Dibutuhkan</span>
                <p className="cs-pica__block-text">{log.supportNeeded}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
