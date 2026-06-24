import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import type { NeedsActionItem, ProgramScope } from '../types'

const Ico = {
  approval: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h6M5 11h4M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 5h6"/></svg>,
  blocker:  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M4.3 4.3l7.4 7.4"/></svg>,
  support:  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10M3 8h10"/></svg>,
  arrow:    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 5h6M5 2l3 3-3 3"/></svg>,
}

const getACT = () => ({
  approval: { ico: Ico.approval, label: i18n.t('Awaiting Approval'), tone: 'blue'   },
  blocker:  { ico: Ico.blocker,  label: i18n.t('Critical Blocker'),  tone: 'red'    },
  support:  { ico: Ico.support,  label: i18n.t('Needs Support'),     tone: 'yellow' },
})

export function actionPanelTitleFor(scope: ProgramScope | null | undefined): string {
  if (scope?.level === 'portfolio') return i18n.t('Needs Director Action')
  if (scope?.role === 'KADIV')      return i18n.t('Needs Division Head Action')
  if (scope?.role === 'KASUBDIV')   return i18n.t('Needs Sub-Division Head Action')
  return i18n.t('Needs Your Action')
}

export function ActionPanel({ items, onOpen, title }: {
  items: NeedsActionItem[]
  onOpen: (id: number) => void
  title: string
}) {
  const { t } = useTranslation()
  const ACT = getACT()
  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">{title}</h3>
        <div className="panel__header-meta">
          {items.length > 0
            ? <span className="section-badge section-badge--red">{items.length}</span>
            : <span className="section-badge">{t('Clear')}</span>}
        </div>
      </div>
      {items.length === 0
        ? <p className="hd-panel-empty">{t('No items need an executive decision.')}</p>
        : (
          <div className="hd-act-list">
            {items.map(item => {
              const m = ACT[item.tag] ?? ACT.support
              return (
                <button key={item.id} className={`hd-act-row hd-act-row--${m.tone}`}
                  type="button" onClick={() => onOpen(item.id)}>
                  <div className="hd-act-row__type">
                    <span className="hd-act-row__ico">{m.ico}</span>
                    <span className="hd-act-row__lbl">{m.label}</span>
                  </div>
                  <div className="hd-act-row__body">
                    <strong>{item.name}</strong>
                    <span>{item.reason}</span>
                  </div>
                  {item.divisi !== '-' && <span className="hd-act-row__div">{item.divisi}</span>}
                  <span className="hd-act-row__arr">{Ico.arrow}</span>
                </button>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
