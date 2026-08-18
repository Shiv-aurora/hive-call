#!/bin/bash
set -euo pipefail
[ ! -d '/tmp/cache' ] && mkdir -p /tmp/cache
HOSTNAME=0.0.0.0 exec node server.js
