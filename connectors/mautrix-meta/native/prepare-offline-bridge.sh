#!/bin/sh
# W26 Issue #61: configure the ACTUAL upstream v0.2610.0 bridge in a self-contained
# OFFLINE lab. This is not a Messenger protocol implementation or account login.
set -eu
RUN_DIR=/opt/yance/mautrix-meta/run
BRIDGE=/opt/yance/mautrix-meta/bin/mautrix-meta
EXPECTED_SHA=17b8fd89ee8bb71796b9406aad37fd871110efbb22ace26801034dab9c5a3843
test -x "$BRIDGE" || { echo 'MISSING_OFFICIAL_BRIDGE_BINARY' >&2; exit 20; }
actual="$(sha256sum "$BRIDGE" | cut -d ' ' -f 1)"
test "$actual" = "$EXPECTED_SHA" || { echo 'OFFICIAL_BRIDGE_SHA_MISMATCH' >&2; exit 21; }
mkdir -p "$RUN_DIR"
cd "$RUN_DIR"
if [ ! -f config.yaml ]; then
  "$BRIDGE" -e -c config.yaml
fi
# Official example config is edited only for a private, non-network-connected
# localhost lab. NO Meta login, OAuth, browser, platform credentials or sends.
# Appservice/homeserver identities here are invalid and isolated on purpose.
sed -i \
  -e 's/^    type: postgres$/    type: sqlite3-fk-wal/' \
  -e 's#^    uri: postgres://user:password@host/database?sslmode=disable$#    uri: file:/opt/yance/mautrix-meta/run/w26-offline-bridge.db?_txlock=immediate#' \
  -e 's#^    address: http://example.localhost:8008$#    address: http://127.0.0.1:28438#' \
  -e 's/^    domain: example.com$/    domain: yance-w26.invalid/' \
  -e 's#^    public_address: https://bridge.example.com$#    public_address:#' \
  -e 's/^        "example.com": user$/        "yance-w26.invalid": user/' \
  -e 's/^        "@admin:example.com": admin$/        "@localadmin:yance-w26.invalid": admin/' \
  -e 's/^        "\*": relay$/        "*": commands/' \
  config.yaml
chmod 600 config.yaml
# The real upstream CLI produces randomized AS/HS tokens. NEVER log or publish
# registration.yaml/config.yaml; they stay in the private Linux distribution.
if [ ! -f registration.yaml ]; then
  "$BRIDGE" -g -c config.yaml -r registration.yaml
fi
chmod 600 registration.yaml
test -s registration.yaml || { echo 'REAL_APPSERVICE_REGISTRATION_NOT_CREATED' >&2; exit 22; }
echo 'OFFICIAL_BRIDGE_BINARY_HASH_VERIFIED'
echo 'UPSTREAM_EXAMPLE_CONFIG_PATCHED_LOCALHOST_ONLY'
echo 'UPSTREAM_APPSERVICE_REGISTRATION_GENERATED_PRIVATE'
echo 'PLATFORM_ACCOUNT_STATUS_WAITING_USER_AUTH'
