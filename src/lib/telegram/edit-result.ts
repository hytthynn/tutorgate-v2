/** Telegram may report an identical edit as HTTP 400; that is a successful no-op. */
export function editResult(status: number, payload: { ok?: boolean; description?: string }): "edited" | "missing" | "error" {
  if (status >= 200 && status < 300 && payload.ok) return "edited";
  if (status === 400 && /message is not modified/i.test(payload.description ?? "")) return "edited";
  if (status === 400 && /message to edit not found/i.test(payload.description ?? "")) return "missing";
  return "error";
}
