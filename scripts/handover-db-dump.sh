#!/usr/bin/env bash
# Dump DB produksi untuk handover (scale-readiness / handover).
#
# Menghasilkan dump format custom (-Fc, terkompresi) dari DB prod Railway untuk
# diwariskan ke tim IT DTDI (Opsi B di HANDOVER.md).
#
# ⚠️ HASIL DUMP BERISI PII (nama/email/NIK 41 user). JANGAN commit ke git,
#    JANGAN unggah ke kanal publik. Transfer terenkripsi via kanal privat.
#
# Prasyarat: Railway CLI ter-login + linked ke proyek; pg_restore/pg_dump (v18,
# samakan dengan server prod). Pakai:
#   bash scripts/handover-db-dump.sh
#
# Restore ke DB DTDI:
#   pg_restore -d "$TARGET_DB_URL" --clean --if-exists --no-owner atlas-prod-*.dump
set -euo pipefail

STAMP=$(date -u +%Y%m%d-%H%M)
OUT="atlas-prod-${STAMP}.dump"

echo "→ Dump DB prod Railway → ${OUT}"
echo "  (pakai DATABASE_PUBLIC_URL dari service Postgres)"

# pg_dump dijalankan di konteks Railway agar DATABASE_PUBLIC_URL ter-resolve.
# --no-owner/--no-privileges supaya restore mulus ke role berbeda di sisi DTDI.
railway run --service Postgres -- bash -c \
  "pg_dump \"\$DATABASE_PUBLIC_URL\" --format=custom --no-owner --no-privileges" > "${OUT}"

SIZE=$(wc -c < "${OUT}" | tr -d ' ')
if [ "${SIZE}" -lt 100000 ]; then
  echo "✗ Dump mencurigakan kecil (${SIZE} bytes) — periksa koneksi/izin." >&2
  exit 1
fi

echo "✓ Dump selesai: ${OUT} (${SIZE} bytes)"
echo ""
echo "LANGKAH BERIKUT:"
echo "  1. Transfer ${OUT} ke tim DTDI SECARA AMAN (enkripsi, kanal privat — BUKAN git)."
echo "  2. Restore: pg_restore -d \"\$TARGET_DB_URL\" --clean --if-exists --no-owner ${OUT}"
echo "  3. Hapus ${OUT} dari mesin lokal setelah transfer (berisi PII)."
