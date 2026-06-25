import { action } from "@elgato/streamdeck";
import { LauncherActionCore } from "./launcher-action-core.js";

@action({ UUID: "com.shinsanghoon.claude-bridge.launcher" })
export class LauncherAction extends LauncherActionCore {}
