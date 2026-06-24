import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const noPica = !log.problemIdentification && !log.correctiveAction
  const noNext = !log.nextStep && !log.supportNeeded

  return (
    <div className="cs-pica">
      <section className="cs-pica__card">
        <div className="cs-pica__label">{t('Problem Identification → Corrective Action')}</div>
        {noPica ? (
          <p className="cs-pica__empty">{t('No problems documented.')}</p>
        ) : (
          <div className="cs-pica__body">
            {log.problemIdentification && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">{t('Problem')}</span>
                <p className="cs-pica__block-text">{log.problemIdentification}</p>
              </div>
            )}
            {log.correctiveAction && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">{t('Corrective Action')}</span>
                <p className="cs-pica__block-text">{log.correctiveAction}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="cs-pica__card">
        <div className="cs-pica__label">{t('Next Steps')}</div>
        {noNext ? (
          <p className="cs-pica__empty">{t('Not yet defined.')}</p>
        ) : (
          <div className="cs-pica__body">
            {log.nextStep && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">{t('Plan')}</span>
                <p className="cs-pica__block-text">{log.nextStep}</p>
              </div>
            )}
            {log.supportNeeded && (
              <div className="cs-pica__block">
                <span className="cs-pica__block-label">{t('Support Needed')}</span>
                <p className="cs-pica__block-text">{log.supportNeeded}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
