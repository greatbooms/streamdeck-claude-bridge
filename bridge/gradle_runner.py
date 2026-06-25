from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import shlex

TASK_RE = re.compile(r"^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$")
PLAIN_CMD_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
ABSOLUTE_CMD_RE = re.compile(r"^/[A-Za-z0-9_./-]+$")


class GradleRequestError(ValueError):
    pass


@dataclass(frozen=True)
class GradleRunRequest:
    cwd: Path
    gradle_command: str
    task: str


def _validate_task(task: object) -> str:
    if not isinstance(task, str) or not TASK_RE.fullmatch(task):
        raise GradleRequestError("task must be a Gradle task path")
    return task


def _validate_gradle_command(command: object) -> str:
    if command is None:
        return "./gradlew"
    if not isinstance(command, str):
        raise GradleRequestError("gradleCommand must be a string")
    if command == "./gradlew":
        return command
    if command.startswith("/"):
        if ABSOLUTE_CMD_RE.fullmatch(command):
            return command
        raise GradleRequestError("gradleCommand absolute path contains unsafe characters")
    if PLAIN_CMD_RE.fullmatch(command):
        return command
    raise GradleRequestError("gradleCommand must be ./gradlew, an absolute path, or a plain executable name")


def parse_gradle_run_request(body: dict) -> GradleRunRequest:
    if not isinstance(body, dict):
        raise GradleRequestError("request body must be an object")
    cwd_raw = body.get("cwd")
    if not isinstance(cwd_raw, str) or not cwd_raw:
        raise GradleRequestError("cwd is required")
    cwd = Path(cwd_raw).expanduser().resolve()
    if not cwd.exists() or not cwd.is_dir():
        raise GradleRequestError("cwd does not exist or is not a directory")
    return GradleRunRequest(
        cwd=cwd,
        gradle_command=_validate_gradle_command(body.get("gradleCommand")),
        task=_validate_task(body.get("task")),
    )


def build_visible_command(req: GradleRunRequest) -> str:
    return f"cd {shlex.quote(str(req.cwd))} && {shlex.quote(req.gradle_command)} {shlex.quote(req.task)}"


class ItermGradleRunner:
    def __init__(self, injector):
        self.injector = injector

    async def run(self, req: GradleRunRequest) -> dict:
        visible = build_visible_command(req)
        fut = self.injector.submit_run_command(visible)
        await asyncio.wrap_future(fut)
        return {"ok": True, "command": visible}
