import pytest

from bridge.npm_runner import NpmRunRequest, build_visible_command, parse_npm_run_request, NpmRequestError


def test_parse_npm_run_request_accepts_safe_script_names(tmp_path):
    project = tmp_path / "web"
    project.mkdir()

    req = parse_npm_run_request({"cwd": str(project), "script": "start:dev"})

    assert req == NpmRunRequest(cwd=project, script="start:dev")


@pytest.mark.parametrize("script", ["", "start dev", "dev; bad", "build && test", "../dev"])
def test_parse_npm_run_request_rejects_unsafe_script_names(tmp_path, script):
    project = tmp_path / "web"
    project.mkdir()

    with pytest.raises(NpmRequestError):
        parse_npm_run_request({"cwd": str(project), "script": script})


def test_build_visible_npm_command_quotes_cwd(tmp_path):
    project = tmp_path / "my web"
    project.mkdir()

    assert build_visible_command(NpmRunRequest(cwd=project, script="start:dev")) == (
        f"cd {str(project)!r} && npm run start:dev"
    )
