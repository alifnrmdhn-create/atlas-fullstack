# Blueprint: Home → MIS Kelas Dunia (Direktur Keuangan & Manajemen Risiko)

> Disusun 2026-05-29 setelah feedback Direksi: "apakah ini sudah selevel MIS terbaik dunia? masih terlalu sederhana."
> Status: **blueprint** (riset + rencana). Belum dieksekusi. Eksekusi bertahap menunggu persetujuan arah.

> **⚠️ AMENDEMEN 2026-05-31:** Direksi menegaskan **ATLAS BUKAN aplikasi manajemen risiko**. Modul **Risk Cockpit DICORET** (heatmap/KRI/loss dari `RiskReport*` **tidak** di-surface ke Home). Fokus MIS dipersempit ke **identitas inti ATLAS: manajemen program kerja (PDCA) + kinerja KPI**. Varians RKAP/`MonthlyReportMetric` (bagian grup "Pelaporan" yang sudah di-hide) **perlu konfirmasi** sebelum dipakai. Bagian risk/RKAP di bawah dipertahankan sebagai histori riset, tapi **tidak dieksekusi**. Lihat memory `feedback_atlas_not_risk_app`.

---

## 1. Verdict jujur

Home saat ini = **cockpit eksekutif** yang rapi (layer *sekilas*, poles setara Stripe/Linear). **Belum** MIS analitis kelas dunia. Dua penyebab, beda penanganan:

1. **Data demo sedang tipis** — 1 program, 1 direktorat, 2 bulan KPI, semua hijau. Dashboard sehebat apa pun terlihat kosong tanpa data padat/multi-dimensi.
2. **Home hanya men-*surface* secuil data.** Temuan audit: sistem **sudah** menyimpan data kaya yang Home abaikan — register risiko (likelihood×dampak), KRI, loss events, anggaran vs **RKAP**, KPI cascade berbobot. **Sebagian besar kenaikan ke "world-class" adalah menampilkan + memvisualkan ulang data yang SUDAH ADA, bukan modeling data baru** (untuk Tier 1).

**Implikasi:** gap terbesar bisa ditutup tanpa integrasi ERP. Yang butuh ERP (P&L, cashflow riil) jujur ditaruh di Tier 3.

---

## 2. Prinsip: MIS berlapis (menyelesaikan tegangan "3 detik" vs "kedalaman")

MIS terbaik dunia tidak memilih antara sederhana atau dalam — mereka **berlapis**:

| Lapis | Isi | Status |
|---|---|---|
| **L0 — Glance** | Verdict ≤3 detik: command strip + panel seimbang | ✅ Sudah ada |
| **L1 — Analyse** | Risk cockpit, varians RKAP, KPI cascade berbobot, forecast | 🔨 Tier 1 (data ada) |
| **L2 — Deepen** | Inheren/residual, EAC, skenario, varians jadwal | 🔨 Tier 2 (data ringan) |
| **L3 — Integrate** | P&L/GL, cashflow 13-minggu, segmen, control testing | 🔭 Tier 3 (ERP/Q4+) |

L0 default; user **menyelam** (drill/expand/tab) ke L1–L2. Direksi tetap dapat 3 detik; analis dapat kedalaman.

---

## 3. Referensi yang diterapkan

- **Few / Tufte / Kaplan-Norton** (riset tahap 1): single-screen, management-by-exception, bullet graph > gauge, sparkline, pasangkan outcome+driver.
- **Financial control tower (CFO)**: varians aktual-vs-anggaran di mana-mana; **waterfall/bridge** untuk dekomposisi varians **berdampingan dengan tabel nilai eksak** (waterfall dibaca kira-kira); cashflow **13-minggu rolling** (kapabilitas CFO #1 yang diminta 2025–26); plan/actual/forecast.
- **Risk cockpit (ISO 31000 / COSO)**: **heatmap 5×5** likelihood×impact; **residual** di grid + **inheren sebagai halo/panah** (efek kontrol); **pita risk-appetite per kategori** (hijau/amber/merah, zona merah → treatment + sign-off); **KRI ditautkan ke appetite**; **tie risiko ke program berdana + deadline + owner**; anotasi velocity/tren.
- **Konteks BUMN**: **RKAP** memuat komitmen **KPI Direksi** ke RUPS/Menteri; **tingkat kesehatan BUMN** (komposit aspek keuangan+operasional+administrasi) dasar remunerasi Direksi; **KPKU** (MBCfPE) + BSC wajib BUMN. → Headline yang relevan untuk Direksi = **KPI Direksi vs target RKAP** + komposit kesehatan.

---

## 4. Realita data (terkonfirmasi via audit + cek migrasi)

| Elemen MIS | Status | Sumber data (terkonfirmasi) |
|---|---|---|
| Heatmap risiko 5×5 | ✅ **Sekarang** | `RiskReportRiskSnapshot.probabilitas/dampak/riskLevel` (mig `...000051`) |
| KRI vs threshold | ✅ Sekarang | `RiskReportKRI` (kriCode/kriName/target/actual/threshold) |
| Loss events + recovery | ✅ Sekarang | `RiskReportLossEvent.impactAmount` + recovery |
| Mitigasi % selesai, RMI, exposure vs appetite | ✅ Sekarang | `RiskReportMitigation`, `RiskMonthlyReport.rmiScore`, `RiskReportStrategy` |
| **Varians Anggaran vs RKAP** | ✅ **Sekarang** | `MonthlyReportMetric.rkap` + `realisasi`; `Program/Initiative.budgetIdr/budgetSpent` |
| KPI cascade berbobot (BSC) | ✅ Sekarang | `kpi_{kolegial,direktur,divisi,karyawan}_items/values` (bobot, polaritas, formula, perspektif) |
| Forecast KPI/anggaran akhir tahun | ✅ Sekarang* | `KpiValue` + `lib/forecast` (frontend; perlu diangkat ke backend) |
| Inheren vs residual risk | ⚠️ Data ringan | +2 kolom di `RiskReportRiskSnapshot` |
| Varians jadwal (slip) | ⚠️ Data ringan | materialisasi `WorkItem.plannedWeeks/actualWeeks` |
| EAC / cost-to-complete | ⚠️ Data ringan | spend-by-period (tabel kecil) |
| **P&L, cashflow 13-mgg, segmen, control testing** | ❌ **Major (ERP/Q4+)** | butuh feed GL/ERP, master data segmen, proses kontrol |

---

## 5. Rencana bertingkat

### Tier 1 — *Surface the richness* (≈2–3 minggu, data sudah ada) — rasio wow/effort tertinggi
1. **Modul Risk Cockpit** (paling berdampak — ini Direktorat Risiko, tapi Home belum punya satu pun visual risiko):
   - **Heatmap 5×5** (`probabilitas`×`dampak`), warna per `riskLevel`, **pita risk-appetite** overlay, jumlah risiko per zona.
   - **Top risks** → tautkan ke program/divisi pemilik + status mitigasi (% selesai) + owner.
   - **KRI panel**: actual vs target/threshold (bullet/RAG), tren.
   - **Loss events**: frekuensi × magnitude, recovery rate.
   - Headline: **RMI** + **exposure vs appetite** (berapa headroom).
2. **Modul Anggaran vs RKAP**:
   - Varians **realisasi vs RKAP** (`MonthlyReportMetric`) — bar varians + **waterfall/bridge** (RKAP → realisasi, per kategori/unit) + **tabel nilai eksak** di sampingnya.
   - Serapan anggaran program (`budgetSpent/budgetIdr`), proyeksi sisa (run-rate).
3. **Scorecard KPI berbobot + cascade**:
   - Achievement tertimbang (`bobot`) per **perspektif BSC**; drill **Kolegial → Direktorat → Divisi → Individu**.
   - **Bullet graph** per KPI (actual vs target + pita threshold), polaritas-aware.
4. **Forecast akhir tahun**: angkat `lib/forecast` ke backend → garis **plan/actual/forecast** + "di laju ini mendarat di X" untuk KPI & serapan anggaran.
5. **Komposit "Kesehatan" ala tingkat kesehatan BUMN**: blend KPI achievement + program health + posture risiko + serapan anggaran → satu headline Direksi (mengganti/melengkapi tile "Status").

### Tier 2 — Data baru ringan (masing-masing ≈1–2 minggu)
- **Inheren vs residual** (+2 kolom; viz: residual di grid + halo inheren → tunjukkan efek kontrol).
- **Varians jadwal** (materialisasi plannedWeeks/actualWeeks → waterfall "slip 6 minggu, task mana penyebab").
- **EAC / cost-to-complete** (spend-by-period → "di burn 500jt/bln, overrun 800jt").
- **Forecast multi-skenario** (base/upside/downside, risk-adjusted).
- **Audit trail approval scorecard** (kepatuhan).

### Tier 3 — Integrasi besar (Q4 2026+, butuh ERP/proses)
P&L/GL (revenue+cost), breakdown biaya per tipe, analisis segmen (geo/produk), **cashflow projection 13-minggu**, control testing/attestation, linkage objektif strategis, scenario engine. Jujur: ini kerja integrasi + governance, bukan poles visual.

---

## 6. Lapisan interaktivitas (lintas-tier — pembeda "alat analisis" vs "laporan statis")

- **Pemilih periode/kuartal** (sekarang periode terkunci ke bulan ber-data).
- **Drill-down klik** (heatmap → daftar risiko → program; KPI direktorat → divisi → individu).
- **Tooltip hover** dengan nilai eksak (pasangan untuk chart yang dibaca kira-kira).
- **Filter** (divisi / perspektif / severity) & **toggle bandingkan** (vs target / vs periode lalu).
- Teknis: **recharts** (sudah di deps, dipakai `Performance/KpiTrendChart`) di-*lazy-load* untuk chart kaya; primitive SVG ringan (`Sparkline/Meter/Donut/Bars`) untuk layer glance agar Home tetap cepat.

---

## 7. Arsitektur informasi Home (usulan komposisi)

```
L0  Verdict ≤3 detik          → command strip + KPI⟷Program (sudah ada)
─── menyelam (tab / section) ───
T1  Keuangan & RKAP           → varians vs RKAP + waterfall + serapan + forecast
T1  Risiko                    → heatmap 5×5 + KRI + top risks→program + loss
T1  Kinerja KPI               → cascade berbobot + bullet + drill 4-tier
    Eksekusi Program          → (sudah ada, dipertahankan)
```
Pertimbangkan **tab** untuk modul L1 agar Home tidak jadi scroll tak berujung; L0 selalu tampak.

---

## 8. Rekomendasi slice pertama (MVP)

Bangun **Tier 1 #1 (Risk Cockpit) + #2 (Varians RKAP)** lebih dulu:
- Sinyal "world-class" paling kuat, **100% pakai data yang sudah ada**, dan **paling pas dengan tugas harian Direktur Keuangan & Risiko**.
- Risk cockpit menutup kekosongan paling mencolok (Direktorat Risiko tanpa visual risiko di Home).
- Estimasi ≈2 minggu. Lalu #3 (cascade KPI) + #4 (forecast).

---

## 9. Caveat jujur

- **Data demo tipis** → bahkan MIS hebat akan terlihat ramping sampai diisi data multi-periode/multi-program riil. Mengisi data riil adalah pengungkit cepat tersendiri.
- **Kualitas data**: field `formula` KPI sering kosong (auto-compute cascade terbatas); pemetaan cost-center↔program belum konsisten; sync APMS (`kpi_karyawan_*`) manual/musiman; skala severity Blocker ≠ severity Risk (belum sebanding).
- **P&L & cashflow riil butuh integrasi GL/ERP** — bukan quick-win visual; jangan janjikan tanpa proyek integrasi.
- Beberapa angka risiko (`RiskMonthlyReport`) bisa ditimpa — perlu versioning sebelum jadi sumber keputusan.

---

## 10. Sumber

Internal: `app/Models/RiskReport*`, `database/migrations/2024_01_01_000051..054_*`, `..._000041_create_MonthlyReportMetric_table.php`, `..._000010_create_Program_table.php`, `2026_05_29_000001_create_kpi_divisi_tables.php`, `app/Services/ScorecardSummaryService.php`, `lib/forecast`.

Web (2026-05):
- [Pedoman KPI BUMN (IFG)](https://kip.ifg.id/storage/files/637dd2ec33476.pdf) · [PER-11/MBU/11/2020](https://peraturan.bpk.go.id/Download/174869/PER-11-MBU-11-2020.pdf) · [RKAP — bumn.go.id](https://www.bumn.go.id/pelayanan/terhubung/standar-pelayanan/Pengesahan%20Rencana%20Kerja%20dan%20Anggaran%20Perusahaan%20(RKAP)%20Badan%20Usaha%20Milik%20Negara.) · [KPKU — Biofarma](https://www.biofarma.co.id/id/good-corporate-governance/detail/kriteriapenilaiankinerjaunggulkpku)
- [CFO data visualization](https://everworker.ai/blog/cfo_data_visualization_financial_analysis_decision_making) · [Financial dashboards for CFOs](https://www.usedatabrain.com/blog/financial-dashboard-examples) · [Variance analysis / waterfall](https://chartengine.io/variance-analysis-in-depth/) · [CFO KPIs & dashboards](https://insightsoftware.com/blog/best-cfo-kpis-and-dashboards/)
- [Risk heat map](https://umbrex.com/resources/frameworks/strategy-frameworks/risk-heat-map/) · [50 KRIs](https://riskpublishing.com/50-key-risk-indicators-every-risk-manager-know/) · [ISO 31000 vs COSO](https://www.wolterskluwer.com/en/expert-insights/risk-management-principles-understanding-iso-31000-and-coso-erm)
