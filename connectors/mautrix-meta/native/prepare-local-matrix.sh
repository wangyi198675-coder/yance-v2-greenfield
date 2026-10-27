#!/bin/sh
# REQUIRED upstream Matrix appservice dependency for OFFICIAL mautrix-meta.
# Tuwunel v1.9.4 upstream binary, isolated-only; no external account.
set -eu
HOME_DIR=/opt/yance/matrix-homeserver
BRIDGE_DIR=/opt/yance/mautrix-meta/run
test -x "$HOME_DIR/bin/tuwunel" || { echo 'OFFICIAL_MATRIX_HOMESERVER_BINARY_NOT_INSTALLED'; exit 40; }
test -s "$BRIDGE_DIR/registration.yaml" || { echo 'OFFICIAL_BRIDGE_REGISTRATION_REQUIRED'; exit 41; }
mkdir -p "$HOME_DIR/run/appservices" "$HOME_DIR/run/data" "$HOME_DIR/logs"
umask 077
cp "$BRIDGE_DIR/registration.yaml" "$HOME_DIR/run/appservices/facebook.yaml"
chmod 600 "$HOME_DIR/run/appservices/facebook.yaml"
cat > "$HOME_DIR/run/tuwunel.toml" <<'EOF'
[global]
server_name = "yance-w26.invalid"
database_path = "/opt/yance/matrix-homeserver/run/data"
address = ["127.0.0.1"]
port = 28438
allow_registration = false
allow_federation = false
appservice_dir = "/opt/yance/matrix-homeserver/run/appservices"
EOF
chmod 600 "$HOME_DIR/run/tuwunel.toml"
echo 'REAL_TUWUNEL_UPSTREAM_INSTALLED'
echo 'OFFICIAL_MAUTRIX_APPSERVICE_REGISTRATION_STAGED_PRIVATE'
echo 'LOCAL_ONLY_NO_FEDERATION_NO_PUBLIC_REGISTRATION'
