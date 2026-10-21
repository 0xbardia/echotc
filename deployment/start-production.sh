#!/bin/sh
set -eu
cd /root/EchoTrace
export PATH=/root/EchoTrace/node_modules/.bin:/root/.nvm/versions/node/v22.23.2/bin:$PATH
exec /root/.nvm/versions/node/v22.23.2/bin/node \
  /root/EchoTrace/node_modules/srvx/bin/srvx.mjs serve \
  --prod \
  --host 127.0.0.1 \
  --port 4185 \
  --static /root/EchoTrace/.vercel/output/static \
  --entry /root/EchoTrace/.vercel/output/functions/__server.func/index.mjs
