from __future__ import annotations

import os
from pathlib import Path
import secrets

AUTH_HEADER = "X-StreamDeck-Bridge-Token"
CONFIG_DIR = Path.home() / "Library" / "Application Support" / "streamdeck-claude-bridge"
TOKEN_FILE = CONFIG_DIR / "token"


def load_or_create_auth_token() -> str:
    env_token = os.environ.get("STREAMDECK_BRIDGE_TOKEN", "").strip()
    if env_token:
        return env_token

    try:
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    except FileNotFoundError:
        pass

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    try:
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(token)
        return token
    except FileExistsError:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()


def is_authorized(headers, expected_token: str) -> bool:
    return bool(expected_token) and headers.get(AUTH_HEADER) == expected_token
