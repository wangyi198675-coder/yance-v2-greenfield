#!/bin/sh
# Actual official Tuwunel homeserver required by the mautrix-meta appservice.
# Isolated loopback and disabled external federation/public registration.
set -eu
BASE=/opt/yance/matrix-homeserver
test -x "$BASE/bin/tuwunel"
test -s "$BASE/run/tuwunel.toml"
umask 077
exec "$BASE/bin/tuwunel" --config "$BASE/run/tuwunel.toml" >> "$BASE/logs/server.log" 2>&1
