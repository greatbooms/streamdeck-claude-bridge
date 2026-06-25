import pytest

from bridge.gradle_runner import (
    GradleRunRequest,
    GradleRequestError,
    build_visible_command,
    parse_gradle_run_request,
)


def test_parse_valid_request_defaults_gradle_command(tmp_path):
    project = tmp_path / "api"
    project.mkdir()
    req = parse_gradle_run_request({"cwd": str(project), "task": "bootRun"})
    assert req == GradleRunRequest(cwd=project, gradle_command="./gradlew", task="bootRun")


def test_parse_accepts_absolute_gradle_command(tmp_path):
    project = tmp_path / "api"
    project.mkdir()
    gradle = tmp_path / "gradlew"
    gradle.write_text("#!/bin/sh\n", encoding="utf-8")
    req = parse_gradle_run_request({
        "cwd": str(project),
        "gradleCommand": str(gradle),
        "task": ":api:bootRun",
    })
    assert req.gradle_command == str(gradle)
    assert req.task == ":api:bootRun"


@pytest.mark.parametrize("task", ["", "bootRun --scan", "bootRun; rm -rf /", "build && test"])
def test_rejects_unsafe_task(tmp_path, task):
    project = tmp_path / "api"
    project.mkdir()
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request({"cwd": str(project), "task": task})


@pytest.mark.parametrize("cmd", ["./gradlew --scan", "gradlew; whoami", "a/b", ""])
def test_rejects_unsafe_gradle_command(tmp_path, cmd):
    project = tmp_path / "api"
    project.mkdir()
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request({"cwd": str(project), "gradleCommand": cmd, "task": "test"})


@pytest.mark.parametrize("cmd", [
    "/tmp/gradlew;whoami",
    "/tmp/gradlew$(whoami)",
    "/tmp/gradlew`whoami`",
    "/tmp/gradlew|cat",
    "/tmp/gradlew&test",
])
def test_rejects_unsafe_absolute_gradle_command(tmp_path, cmd):
    project = tmp_path / "api"
    project.mkdir()
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request({"cwd": str(project), "gradleCommand": cmd, "task": "test"})


@pytest.mark.parametrize("body", [None, [], "x"])
def test_rejects_non_dict_body(body):
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request(body)


def test_rejects_missing_cwd(tmp_path):
    with pytest.raises(GradleRequestError, match="cwd does not exist"):
        parse_gradle_run_request({"cwd": str(tmp_path / "missing"), "task": "test"})


def test_build_visible_command_quotes_cwd(tmp_path):
    project = tmp_path / "space dir"
    project.mkdir()
    req = GradleRunRequest(cwd=project, gradle_command="./gradlew", task="bootRun")
    assert build_visible_command(req) == f"cd {str(project)!r} && ./gradlew bootRun"
