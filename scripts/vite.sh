#!/bin/sh
# Asset URL sengaja tidak di-pin ke IP LAN — kalau host berpindah network
# (Wi-Fi swap), IP en0 berubah dan asset URL di HTML jadi stale → tab freeze
# sampai TCP timeout. Default Vite (localhost:5173) cukup untuk dev di mesin
# sendiri. Untuk akses dari device lain di LAN, set VITE_DEV_SERVER_URL manual.
exec vite
