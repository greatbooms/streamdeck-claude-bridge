#!/usr/bin/env python3
import json
import uuid
import zipfile
from pathlib import Path

PLUGIN_UUID = "com.shinsanghoon.claude-bridge"
ACTION_UUID = "com.shinsanghoon.claude-bridge.launcher"
PLUGIN_NAME = "Claude Bridge"
ACTION_NAME = "Project Launcher Tile"
PROFILE_NAME = "Dev Launcher"
PLUGIN_VERSION = "0.1.0.0"


def action(slot: int) -> dict:
    return {
        "ActionID": str(uuid.uuid4()).upper(),
        "LinkedTitle": True,
        "Name": ACTION_NAME,
        "Plugin": {"Name": PLUGIN_NAME, "UUID": PLUGIN_UUID, "Version": PLUGIN_VERSION},
        "Resources": None,
        "Settings": {"slot": slot},
        "State": 0,
        "States": [{}],
        "UUID": ACTION_UUID,
    }


def main() -> None:
    plugin_dir = Path(__file__).resolve().parents[1] / "com.shinsanghoon.claude-bridge.sdPlugin"
    out = plugin_dir / "Dev Launcher.streamDeckProfile"
    profile_uuid = str(uuid.uuid4()).upper()
    launcher_page_uuid = str(uuid.uuid4()).upper()
    default_page_uuid = str(uuid.uuid4()).upper()
    actions = {
        f"{column},{row}": action(row * 5 + column)
        for row in range(3)
        for column in range(5)
    }
    package = {
        "AppVersion": "7.4.2.22730",
        "DeviceModel": "20GAA9902",
        "DeviceSettings": None,
        "FormatVersion": 1,
        "OSType": "macOS",
        "OSVersion": "26.5.1",
        "RequiredPlugins": ["com.elgato.streamdeck.page", PLUGIN_UUID],
    }
    root_manifest = {
        "Device": {"Model": "20GAA9902", "UUID": str(uuid.uuid4()).upper()},
        "Name": PROFILE_NAME,
        "Pages": {
            "Current": "00000000-0000-0000-0000-000000000000",
            "Default": default_page_uuid.lower(),
            "Pages": [launcher_page_uuid.lower()],
        },
        "Version": "3.0",
    }
    default_page_manifest = {
        "Controllers": [{"Actions": None, "Type": "Keypad"}],
        "Icon": "",
        "Name": "",
    }
    page_manifest = {
        "Controllers": [{"Actions": actions, "Type": "Keypad"}],
        "Icon": "",
        "Name": PROFILE_NAME,
    }
    root = f"Profiles/{profile_uuid}.sdProfile"
    default_page = f"{root}/Profiles/{default_page_uuid}"
    launcher_page = f"{root}/Profiles/{launcher_page_uuid}"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("package.json", json.dumps(package, separators=(",", ":")))
        z.writestr("Profiles/", "")
        z.writestr(f"{root}/", "")
        z.writestr(f"{root}/manifest.json", json.dumps(root_manifest, separators=(",", ":")))
        z.writestr(f"{root}/Profiles/", "")
        z.writestr(f"{default_page}/", "")
        z.writestr(f"{default_page}/Images/", "")
        z.writestr(f"{default_page}/manifest.json", json.dumps(default_page_manifest, separators=(",", ":")))
        z.writestr(f"{launcher_page}/", "")
        z.writestr(f"{launcher_page}/Images/", "")
        z.writestr(f"{launcher_page}/manifest.json", json.dumps(page_manifest, separators=(",", ":")))
    print(out)


if __name__ == "__main__":
    main()
