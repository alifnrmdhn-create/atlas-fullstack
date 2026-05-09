import { Head } from '@inertiajs/react'
import { Button, Pill, Card, CardHeader, CardTitle, CardDescription, Stat, ListRow } from '../design-system'

/**
 * Internal preview for the design-system foundation primitives.
 *
 * Route: /design-system (auth required, not linked from sidebar).
 * Purpose: visual review of typography scale, color palette, and primitives
 * before rolling out to real pages.
 */
export default function DesignSystemView() {
  return (
    <>
      <Head title="Design System" />
      <div className="ds" style={pageStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={pageTitleStyle}>ATLAS Design System</h1>
            <p style={pageSubtitleStyle}>
              Foundation primitives — IBM Plex Sans, neutral-led palette, hairline borders, no ambient shadows.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm">Dokumentasi</Button>
            <Button variant="primary" size="sm">Adopt di halaman</Button>
          </div>
        </header>

        <Section title="Typography" description="7 ukuran. Tidak ada nilai di antaranya.">
          <Card padding="lg">
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>40 / 600</span>
              <span style={{ fontSize: 'var(--ds-text-40)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                3 program terlambat
              </span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>28 / 600</span>
              <span style={{ fontSize: 'var(--ds-text-28)', fontWeight: 600, lineHeight: 1.2 }}>
                Portfolio Roster
              </span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>20 / 600</span>
              <span style={{ fontSize: 'var(--ds-text-20)', fontWeight: 600 }}>Section heading</span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>16 / 600</span>
              <span style={{ fontSize: 'var(--ds-text-16)', fontWeight: 600 }}>Card title</span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>14 / 400</span>
              <span style={{ fontSize: 'var(--ds-text-14)' }}>
                Body — Direktorat Keuangan dan Manajemen Risiko menyusun RKAP 2027.
              </span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>13 / 400</span>
              <span style={{ fontSize: 'var(--ds-text-13)', color: 'var(--ds-text-secondary)' }}>
                Secondary — 12 workstream · 237 hari lagi · 2 blocker aktif
              </span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>11 / 500</span>
              <span style={{ fontSize: 'var(--ds-text-11)', fontWeight: 500, color: 'var(--ds-text-tertiary)' }}>
                Meta · timestamps · captions
              </span>
            </div>
            <div style={typeRowStyle}>
              <span style={typeMetaStyle}>11 mono</span>
              <span className="ds-mono" style={{ fontSize: 'var(--ds-text-11)' }}>
                DKSA-PSG-001 · WI-SGN-072 · DIMR-HLD010301
              </span>
            </div>
          </Card>
        </Section>

        <Section title="Color" description="Neutral-led. Brand untuk active state. Semantik hanya untuk status.">
          <Card padding="lg">
            <SwatchRow label="Neutral" tokens={['neutral-0','neutral-50','neutral-100','neutral-200','neutral-300','neutral-400','neutral-500','neutral-600','neutral-700','neutral-800','neutral-900']} />
            <SwatchRow label="Brand" tokens={['brand-50','brand-100','brand-500','brand-600','brand-700']} />
            <SwatchRow label="Red (status)" tokens={['red-50','red-500','red-600']} />
            <SwatchRow label="Amber (status)" tokens={['amber-50','amber-500','amber-600']} />
            <SwatchRow label="Green (status)" tokens={['green-50','green-500','green-600']} />
          </Card>
        </Section>

        <Section title="Button" description="4 variant · 2 size. Primary dipakai max 1 per halaman.">
          <Card padding="lg">
            <Group label="Variants (size md)">
              <Button variant="primary">Buat Program</Button>
              <Button variant="secondary">Filter</Button>
              <Button variant="ghost">Batal</Button>
              <Button variant="danger">Hapus</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </Group>
            <Group label="Size sm">
              <Button variant="primary" size="sm">Simpan</Button>
              <Button variant="secondary" size="sm">Edit</Button>
              <Button variant="ghost" size="sm">Tutup</Button>
            </Group>
          </Card>
        </Section>

        <Section title="Pill" description="Satu primitif menggantikan 6+ variasi badge legacy.">
          <Card padding="lg">
            <Group label="Outline + dot (status)">
              <Pill tone="red" variant="outline" dot>Terlambat</Pill>
              <Pill tone="amber" variant="outline" dot>At Risk</Pill>
              <Pill tone="green" variant="outline" dot>On Track</Pill>
              <Pill tone="neutral" variant="outline" dot>Draft</Pill>
            </Group>
            <Group label="Soft (count, label, secondary)">
              <Pill tone="brand" variant="soft">12 channels</Pill>
              <Pill tone="neutral" variant="soft">26</Pill>
              <Pill tone="green" variant="soft">Disetujui</Pill>
              <Pill tone="amber" variant="soft">Menunggu Review</Pill>
            </Group>
            <Group label="Mono (kode, ID, token)">
              <Pill variant="mono">DKSA-PSG-001</Pill>
              <Pill variant="mono">WI-SGN-072</Pill>
              <Pill variant="mono">DIMR-HLD010301</Pill>
            </Group>
          </Card>
        </Section>

        <Section title="Stat" description="Hero number tanpa box. Wrap dengan Card kalau butuh container.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--ds-space-4)' }}>
            <Card padding="lg">
              <Stat
                size="hero"
                tone="red"
                value="3"
                label="program butuh keputusan"
                caption="+2 vs 9 jam lalu · DAPN, DKSA, DIMR"
              />
            </Card>
            <Card padding="lg">
              <Stat
                size="lg"
                value="102.27"
                unit="%"
                label="Pencapaian DKSA Mar 2026"
                tone="green"
              />
            </Card>
            <Card padding="lg">
              <Stat
                size="md"
                value="7"
                label="Total Program"
                caption="4 pipeline"
              />
            </Card>
          </div>
          <div style={{ marginTop: 16 }}>
            <Card padding="lg">
              <CardHeader>
                <div>
                  <CardTitle>Summary inline</CardTitle>
                  <CardDescription>Banyak Stat dalam satu card — gunakan grid, bukan border per item.</CardDescription>
                </div>
              </CardHeader>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--ds-space-6)' }}>
                <Stat size="lg" value="7" label="Program" />
                <Stat size="lg" value="0" label="Selesai" tone="neutral" />
                <Stat size="lg" value="0" label="On Track" tone="green" />
                <Stat size="lg" value="3" label="Terlambat" tone="red" />
              </div>
            </Card>
          </div>
        </Section>

        <Section title="ListRow" description="Density tinggi. 48px row, hairline divider, no decoration.">
          <Card padding="none">
            <ListRow
              leading={<Pill variant="mono">DKSA-PSG-001</Pill>}
              primary="Penyehatan PT Sinergi Gula Nusantara 2026"
              secondary="12 workstream · 237 hari lagi · 2 blocker aktif"
              middle={<MockProgress value={57} tone="red" />}
              trailing={<><Pill tone="red" variant="outline" dot>Terlambat</Pill><span>57%</span></>}
              emphasis="danger"
              onClick={() => {}}
            />
            <ListRow
              leading={<Pill variant="mono">DAPN-KPK-002</Pill>}
              primary="Konsolidasi Pelaporan Keuangan SGN ke Holding"
              secondary="2 workstream · 237 hari lagi"
              middle={<MockProgress value={75} tone="red" />}
              trailing={<><Pill tone="red" variant="outline" dot>Terlambat</Pill><span>75%</span></>}
              emphasis="danger"
              onClick={() => {}}
            />
            <ListRow
              leading={<Pill variant="mono">DIMR-GMR-002</Pill>}
              primary="Governance Manajemen Risiko MKSO SGN"
              secondary="1 workstream · 206 hari lagi"
              middle={<MockProgress value={54} tone="amber" />}
              trailing={<><Pill tone="amber" variant="outline" dot>At Risk</Pill><span>54%</span></>}
              emphasis="warning"
              onClick={() => {}}
            />
            <ListRow
              leading={<Pill variant="mono">DKSA-PRK-004</Pill>}
              primary="Penyusunan RKO"
              secondary="1 workstream · 53 hari lagi"
              middle={<MockProgress value={0} tone="neutral" />}
              trailing={<><Pill tone="neutral" variant="outline" dot>Draft</Pill><span>0%</span></>}
              onClick={() => {}}
            />
          </Card>
        </Section>

        <Section title="Card" description="Default + sunken. Pilih padding via prop, jangan hardcode.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Card padding="md">
              <CardHeader>
                <div>
                  <CardTitle>Default Card</CardTitle>
                  <CardDescription>1px hairline border, no shadow.</CardDescription>
                </div>
                <Pill tone="green" variant="soft">aktif</Pill>
              </CardHeader>
              <p style={{ margin: 0, fontSize: 'var(--ds-text-14)', color: 'var(--ds-text-secondary)' }}>
                Body content sits in default surface. Use sunken sibling for nested density.
              </p>
            </Card>
            <Card padding="md" variant="sunken">
              <CardHeader>
                <div>
                  <CardTitle>Sunken Card</CardTitle>
                  <CardDescription>For nested panels inside a Card.</CardDescription>
                </div>
              </CardHeader>
              <p style={{ margin: 0, fontSize: 'var(--ds-text-14)', color: 'var(--ds-text-secondary)' }}>
                No border. Background tint suggests hierarchy without lines.
              </p>
            </Card>
          </div>
        </Section>
      </div>
    </>
  )
}

/* ─── Local helpers — only used in this preview ──────────────── */

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <p style={sectionDescStyle}>{description}</p>
      </div>
      {children}
    </section>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 'var(--ds-text-11)', fontWeight: 500, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function SwatchRow({ label, tokens }: { label: string; tokens: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      <span style={{ width: 120, fontSize: 'var(--ds-text-13)', color: 'var(--ds-text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {tokens.map((t) => (
          <div key={t} style={{ flex: 1 }}>
            <div
              style={{
                height: 36,
                borderRadius: 4,
                background: `var(--ds-${t})`,
                border: '1px solid var(--ds-border-subtle)',
              }}
            />
            <div className="ds-mono" style={{ fontSize: 10, color: 'var(--ds-text-tertiary)', marginTop: 4, textAlign: 'center' }}>
              {t}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MockProgress({ value, tone }: { value: number; tone: 'red' | 'amber' | 'green' | 'neutral' }) {
  const colorMap = {
    red: 'var(--ds-red-500)',
    amber: 'var(--ds-amber-500)',
    green: 'var(--ds-green-500)',
    neutral: 'var(--ds-neutral-400)',
  }
  return (
    <div style={{ width: 160, height: 4, background: 'var(--ds-neutral-200)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: colorMap[tone] }} />
    </div>
  )
}

/* ─── Inline styles for the preview chrome only ──────────────── */

const pageStyle: React.CSSProperties = {
  padding: 'var(--ds-space-8)',
  maxWidth: 1200,
  margin: '0 auto',
  background: 'var(--ds-surface-page)',
  minHeight: '100vh',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--ds-space-6)',
  marginBottom: 'var(--ds-space-10)',
  paddingBottom: 'var(--ds-space-6)',
  borderBottom: '1px solid var(--ds-border-subtle)',
}

const pageTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--ds-text-28)',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--ds-text-primary)',
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 'var(--ds-text-14)',
  color: 'var(--ds-text-secondary)',
  maxWidth: 640,
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--ds-space-10)',
}

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 'var(--ds-space-4)',
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--ds-text-20)',
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
}

const sectionDescStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 'var(--ds-text-13)',
  color: 'var(--ds-text-secondary)',
}

const typeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--ds-space-6)',
  paddingBottom: 'var(--ds-space-3)',
  marginBottom: 'var(--ds-space-3)',
  borderBottom: '1px solid var(--ds-border-subtle)',
}

const typeMetaStyle: React.CSSProperties = {
  width: 80,
  flexShrink: 0,
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
}
