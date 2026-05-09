#!/bin/sh
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
PHP_BIN=${PHP_BIN:-php}
echo ""
echo "  Laravel app:"
echo "  Local:   http://localhost:9000"
if [ -n "$IP" ]; then
  echo "  Network: http://$IP:9000"
fi
echo "  PHP:     $PHP_BIN"
echo ""

# Workers raised from 4 → 16: SSE stream pins 1 worker for up to 5 minutes,
# plus page bootstrap fires ~12 API calls concurrently. With 4 workers most
# requests queue and the page renders skeleton for seconds.
export PHP_CLI_SERVER_WORKERS=16

# Forward Ctrl+C to PHP, then SIGKILL after 2s if it hasn't exited.
# `php artisan serve` workers can hang inside long-running SSE streams and
# ignore SIGTERM until the request loop ticks. The fallback prevents the
# `npm run dev` shutdown from blocking forever.
shutdown() {
  if [ -n "$PID" ]; then
    kill -TERM "$PID" 2>/dev/null
    # 2s grace window for graceful shutdown
    for _ in 1 2 3 4; do
      sleep 0.5
      kill -0 "$PID" 2>/dev/null || break
    done
    kill -KILL "$PID" 2>/dev/null
  fi
  # Kill any worker still bound to port 9000 (artisan serve workers can outlive
  # the master after SIGKILL because PHP's CLI server doesn't reap children).
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti :9000 2>/dev/null | xargs kill -9 2>/dev/null || true
  fi
  exit 0
}
trap shutdown INT TERM

"$PHP_BIN" artisan serve --host=0.0.0.0 --port=9000 --no-reload &
PID=$!
wait "$PID"
