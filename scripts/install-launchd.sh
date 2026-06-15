#!/usr/bin/env bash
# 브릿지 서버를 macOS LaunchAgent 로 등록해 로그인 시 자동 시작 + 죽으면 재시작.
# 설치:   bash scripts/install-launchd.sh
# 제거:   launchctl unload ~/Library/LaunchAgents/com.streamdeck-claude-bridge.plist
set -euo pipefail

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Prefer the project venv (its Python meets the 3.10+ requirement); fall back to system python3.
if [ -x "$PROJ/.venv/bin/python" ]; then PY="$PROJ/.venv/bin/python"; else PY="$(command -v python3)"; fi
PORT="${BRIDGE_PORT:-8787}"
LABEL="com.streamdeck-claude-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$PROJ/logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>-m</string>
    <string>bridge</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJ</string>
  <key>EnvironmentVariables</key>
  <dict><key>BRIDGE_PORT</key><string>$PORT</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PROJ/logs/bridge.out.log</string>
  <key>StandardErrorPath</key><string>$PROJ/logs/bridge.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "✅ 등록됨: $LABEL (python=$PY, dir=$PROJ, port=$PORT)"
echo "   로그: $PROJ/logs/bridge.{out,err}.log"
echo "   제거: launchctl unload $PLIST && rm $PLIST"
