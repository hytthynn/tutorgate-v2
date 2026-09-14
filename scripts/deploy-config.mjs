import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function deploymentConfig(env) {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "APP_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"];
  const optional = ["AUTH_ALIAS_DOMAIN", "LATEX_RENDER_URL", "LATEX_RENDER_TOKEN"];
  const values = {};
  for (const key of [...required, ...optional]) {
    const value = env[key] || (key === "AUTH_ALIAS_DOMAIN" ? "auth.tutorgate.internal" : "");
    if (required.includes(key) && !value.trim()) throw new Error(`Missing secret: ${key}`);
    if (/[\r\n\0]/.test(value)) throw new Error(`Secret must be a single line: ${key}`);
    if (value) values[key] = value;
  }
  const url = new URL(values.APP_URL);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !/^[a-z0-9.-]+$/.test(url.hostname)) throw new Error("APP_URL must be an HTTPS origin with a DNS hostname and no custom port");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(values.TELEGRAM_WEBHOOK_SECRET)) throw new Error("Invalid TELEGRAM_WEBHOOK_SECRET");
  if (Boolean(values.LATEX_RENDER_URL) !== Boolean(values.LATEX_RENDER_TOKEN)) throw new Error("Set both LATEX_RENDER_URL and LATEX_RENDER_TOKEN");
  if (values.LATEX_RENDER_URL && (new URL(values.LATEX_RENDER_URL).protocol !== "https:" || values.LATEX_RENDER_TOKEN.length < 32)) throw new Error("LaTeX requires HTTPS and a token of at least 32 characters");
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) throw new Error("Invalid GITHUB_SHA");
  return {
    runtime: Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
    compose: `APP_IMAGE=tutorgate:${env.GITHUB_SHA}\nAPP_DOMAIN=${url.hostname}\n`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = deploymentConfig(process.env);
  mkdirSync(".deploy", { recursive: true, mode: 0o700 });
  writeFileSync(".deploy/runtime.env", config.runtime, { mode: 0o600 });
  writeFileSync(".deploy/deploy.env", config.compose, { mode: 0o600 });
}
