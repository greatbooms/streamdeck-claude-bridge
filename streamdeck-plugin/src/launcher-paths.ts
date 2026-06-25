import { isAbsolute, normalize } from "node:path";

export function normalizeProjectPath(raw: string): string {
  const normalized = normalize(raw.trim());
  if (normalized === "/") return normalized;
  return normalized.replace(/\/+$/, "");
}

export function requireAbsoluteProjectPath(raw: string): string {
  const path = normalizeProjectPath(raw);
  if (!isAbsolute(path)) throw new Error("path must be absolute");
  return path;
}
