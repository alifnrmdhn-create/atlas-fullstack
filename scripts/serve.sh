#!/bin/sh
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
PHP_BIN=${PHP_BIN:-php}
echo ""
echo "  Laravel app:"
echo "  Local:   http://localhost:8000"
if [ -n "$IP" ]; then
  echo "  Network: http://$IP:8000"
fi
echo "  PHP:     $PHP_BIN"
echo ""
export PHP_CLI_SERVER_WORKERS=8
exec "$PHP_BIN" artisan serve --host=0.0.0.0 --no-reload
