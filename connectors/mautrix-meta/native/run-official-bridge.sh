#!/bin/sh
# Execute OFFICIAL upstream mautrix-meta in an isolated, unauthorized WSL lab.
# Matrix homeserver must be registered separately. Never starts social login.
set -eu
DIR=/opt/yance/mautrix-meta/run
cd "$DIR"
test -s config.yaml && test -s registration.yaml || exit 22
test -x /opt/yance/mautrix-meta/bin/mautrix-meta || exit 23
umask 077
exec /opt/yance/mautrix-meta/bin/mautrix-meta -c "$DIR/config.yaml" -r "$DIR/registration.yaml" >> /opt/yance/mautrix-meta/logs/official-bridge.log 2>&1
