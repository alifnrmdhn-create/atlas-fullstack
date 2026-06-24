#!/bin/sh
# Auto-pin asset URL ke IP LAN host saat ini supaya `npm run dev` langsung bisa
# dibuka dari device lain (HP/tablet) di jaringan yang sama TANPA flag tambahan.
#
# IP dideteksi FRESH tiap start (tidak di-hardcode) — normalnya selalu benar.
# Kalau host pindah network (ganti Wi-Fi) DI TENGAH sesi, IP jadi stale & tab di
# mesin sendiri bisa freeze nunggu TCP timeout → restart `npm run dev` untuk
# re-detect. Kalau tak ada IP LAN (offline), otomatis fallback ke localhost:5173.
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$IP" ]; then
  # vite.config.ts baris 13: origin = env.VITE_DEV_SERVER_URL || localhost:5173.
  # loadEnv(mode,'.','') ikut baca process.env (prefix ''), jadi var ini terpakai.
  export VITE_DEV_SERVER_URL="http://$IP:5173"
  echo "  [dev] Asset URL: $VITE_DEV_SERVER_URL  (device lain buka: http://$IP:9000)"
fi
exec vite
