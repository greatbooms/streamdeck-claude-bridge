from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import shlex

SCRIPT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$")


class NpmRequestError(ValueError):
    pass


@dataclass(frozen=True)
class NpmRunRequest:
    cwd: Path
    script: str


def _validate_script(script: object) -> str:
    if not isinstance(script, str) or not SCRIPT_RE.fullmatch(script):
        raise NpmRequestError("script must be an npm script name")
    return script


def parse_npm_run_request(body: dict) -> NpmRunRequest:
    if not isinstance(body, dict):
        raise NpmRequestError("request body must be an object")
    cwd_raw = body.get("cwd")
    if not isinstance(cwd_raw, str) or not cwd_raw:
        raise NpmRequestError("cwd is required")
    cwd = Path(cwd_raw).expanduser().resolve()
    if not cwd.exists() or not cwd.is_dir():
        raise NpmRequestError("cwd does not exist or is not a directory")
    return NpmRunRequest(cwd=cwd, script=_validate_script(body.get("script")))


def build_visible_command(req: NpmRunRequest) -> str:
    return f"cd {shlex.quote(str(req.cwd))} && npm run {shlex.quote(req.script)}"


class ItermNpmRunner:
    def __init__(self, injector):
        self.injector = injector

    async def run(self, req: NpmRunRequest) -> dict:
        visible = build_visible_command(req)
        fut = self.injector.submit_run_command(visible)
        await asyncio.wrap_future(fut)
        return {"ok": True, "command": visible}
