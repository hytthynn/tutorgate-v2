const { APP_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
if (!APP_URL || !TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET)
  throw new Error(
    "Fill APP_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local",
  );
const url = new URL("/api/telegram/webhook", APP_URL);
if (url.protocol !== "https:")
  throw new Error("Telegram requires a public HTTPS APP_URL");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET))
  throw new Error(
    "Webhook secret must contain 1–256 Latin letters, digits, _ or -",
  );
const response = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.toString(),
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  },
);
if (!response.ok || !(await response.json()).ok)
  throw new Error(
    "Could not set webhook. Check bot credentials and production URL.",
  );
console.log(`Webhook configured: ${url}`);
const info = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
);
const data = await info.json();
console.log(
  JSON.stringify(
    {
      url: data.result?.url,
      pending_update_count: data.result?.pending_update_count,
      last_error_message: data.result?.last_error_message ?? null,
    },
    null,
    2,
  ),
);
