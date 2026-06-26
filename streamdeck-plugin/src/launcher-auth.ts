import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BRIDGE_AUTH_HEADER = "X-StreamDeck-Bridge-Token";

export type TokenProvider = () => string | null;

function configDir(): string {
  return path.join(os.homedir(), "Library", "Application Support", "streamdeck-claude-bridge");
}

export function bridgeTokenPath(): string {
  return path.join(configDir(), "token");
}

export function loadOrCreateBridgeToken(): string | null {
  const envToken = process.env.STREAMDECK_BRIDGE_TOKEN?.trim();
  if (envToken) return envToken;

  const tokenPath = bridgeTokenPath();
  try {
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    if (token) return token;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return null;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(tokenPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return token;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null;
    try {
      const existing = fs.readFileSync(tokenPath, "utf8").trim();
      return existing || null;
    } catch {
      return null;
    }
  }
}

export function authHeaders(tokenProvider: TokenProvider = loadOrCreateBridgeToken): Record<string, string> {
  const token = tokenProvider();
  return token ? { [BRIDGE_AUTH_HEADER]: token } : {};
}
