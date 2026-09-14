import test from "node:test";
import assert from "node:assert/strict";
import { deploymentConfig } from "../scripts/deploy-config.mjs";

const config = {
  GITHUB_SHA: "a".repeat(40),
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SECRET_KEY: "secret$with'quotes\"",
  APP_URL: "https://tutor.example.org",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_BOT_USERNAME: "bot",
  TELEGRAM_WEBHOOK_SECRET: "webhook_secret",
};

test("deployment preserves literal secrets and separates Compose configuration", () => {
  const result = deploymentConfig(config);
  assert.ok(result.runtime.includes(`SUPABASE_SECRET_KEY=${config.SUPABASE_SECRET_KEY}\n`));
  assert.ok(result.runtime.includes("AUTH_ALIAS_DOMAIN=auth.tutorgate.internal\n"));
  assert.equal(result.compose, `APP_IMAGE=tutorgate:${config.GITHUB_SHA}\nAPP_DOMAIN=tutor.example.org\n`);
  assert.ok(!result.compose.includes(config.SUPABASE_SECRET_KEY));
});

test("deployment rejects missing credentials, env injection and unsafe origins", () => {
  for (const override of [
    { SUPABASE_SECRET_KEY: "" },
    { SUPABASE_SECRET_KEY: "secret\nINJECTED=true" },
    { APP_URL: "http://tutor.example.org" },
    { APP_URL: "https://tutor.example.org/path" },
    { APP_URL: "https://user:password@tutor.example.org" },
    { GITHUB_SHA: "latest" },
    { LATEX_RENDER_URL: "https://latex.example.org/render" },
    { LATEX_RENDER_URL: "http://latex.example.org/render", LATEX_RENDER_TOKEN: "a".repeat(32) },
  ]) assert.throws(() => deploymentConfig({ ...config, ...override }));
});
