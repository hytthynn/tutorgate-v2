export const CHAT_TIME_ZONE = "Europe/Moscow";
export function chatDateLabel(value: string, now = new Date()) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("ru-RU", { timeZone: CHAT_TIME_ZONE });
  const day = fmt(new Date(value));
  return day === fmt(now)
    ? "Сегодня"
    : day === fmt(new Date(now.getTime() - 86400000))
      ? "Вчера"
      : day;
}
