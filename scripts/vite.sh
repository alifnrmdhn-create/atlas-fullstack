#!/bin/sh
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$IP" ]; then
    export VITE_DEV_SERVER_URL="http://$IP:5173"
fi
exec vite
