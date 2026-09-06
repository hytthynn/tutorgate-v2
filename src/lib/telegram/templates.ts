// Pure HTML catalogue; secrets are only carried by inline URL buttons.
export type InlineButton =
  { text: string; url: string } | { text: string; callback_data: string };
export type TelegramOptions = {
  parse_mode?: "HTML";
  reply_markup?: { inline_keyboard: InlineButton[][] };
};
export type TelegramMessage = { text: string; options: TelegramOptions };
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const codePointLength = (s: string) => [...s].length;
const catalogue: Record<number, string> = {
  "1": "👋 <b>Добро пожаловать в TutorGate!</b>\n\nЗдесь вы можете открыть TutorGate или написать своему репетитору.",
  "2": "👋 <b>Добро пожаловать в TutorGate!</b>\n\nРасписание, ученики и сообщения доступны на сайте.",
  "3": "👋 <b>Добро пожаловать в TutorGate!</b>\n\nУправление TutorGate доступно на сайте.",
  "4": "👋 <b>Добро пожаловать в TutorGate!</b>\n\nЭтот Telegram пока не связан с активным аккаунтом TutorGate.\n\nОткройте сайт, чтобы войти, подать заявку или восстановить доступ.",
  "5": "✅ <b>Telegram подтверждён</b>\n\nЗаявка отправлена на проверку.\n\nC вами свяжется администратор. Мы пришлём сюда сообщение после решения.",
  "6": "⚠️ <b>Не удалось подтвердить Telegram</b>\n\nОткройте ссылку из Telegram-аккаунта, который был указан при подаче заявки.",
  "7": "⚠️ <b>Не удалось подтвердить Telegram</b>\n\nДля подтверждения заявки у вашего Telegram-аккаунта должен быть установлен username.\n\nУстановите username в настройках Telegram и повторите подтверждение.",
  "8": "ℹ️ <b>Telegram уже используется</b>\n\nЭтот Telegram-аккаунт уже связан с TutorGate.\n\nВойдите в существующий аккаунт или воспользуйтесь восстановлением пароля.",
  "9": "⏳ <b>Ссылка устарела</b>\n\nСрок действия ссылки подтверждения Telegram истёк.\n\nПодайте заявку заново, чтобы получить новую ссылку.",
  "10": "⚠️ <b>Ссылка недействительна</b>\n\nЭта ссылка уже была использована или больше не действует.\n\nЕсли вы уже подтвердили Telegram, дополнительных действий не требуется.",
  "11": "📥 <b>Новая заявка в TutorGate</b>\n\n<b>Роль:</b> Ученик / Репетитор  \n<b>ФИО:</b> …  \n<b>Telegram:</b> @…  \n<b>Предметы:</b> …  \n<b>Цель / Опыт:</b> …\n\nЗаявка ожидает рассмотрения в TutorGate.",
  "12": "🎉 <b>Заявка одобрена</b>\n\nДобро пожаловать в TutorGate!\n\nЗавершите регистрацию, чтобы создать логин и пароль.\n\nСсылка действует <b>24 часа</b> и может быть использована только один раз.",
  "13": "🔗 <b>Новая ссылка на регистрацию</b>\n\nПредыдущая ссылка больше не действует.\n\nИспользуйте новую ссылку ниже. Она действует <b>24 часа</b> и может быть использована только один раз.",
  "14": "❌ <b>Заявка отклонена</b>\n\nК сожалению, ваша заявка в TutorGate не была одобрена.\n\nПозже вы можете подать новую заявку.",
  "15": "🔐 <b>Восстановление пароля</b>\n\nВы запросили изменение пароля TutorGate.\n\nСсылка действует <b>30 минут</b>.\n\nЕсли запрос сделали не вы, просто проигнорируйте это сообщение.",
  "16": "💬 <b>Сообщение от репетитора</b>\n\n<b>Дмитрий Тарасов</b>\n\nДобрый день! Сегодня занятие начинаем в 15:00.",
  "17": "✏️ <b>Сообщение репетитору</b>\n\nВы пишете: <b>Дмитрий Тарасов</b>\n\nОтправьте следующим сообщением текст, который хотите передать репетитору.",
  "18": "👨‍🏫 <b>Выберите репетитора</b>\n\nКому вы хотите написать?",
  "19": "ℹ️ <b>Нет доступных репетиторов</b>\n\nСейчас к вашему аккаунту не назначен ни один репетитор.",
  "20": "✅ <b>Сообщение отправлено</b>",
  "21": "🔔 <b>Новое сообщение от ученика</b>\n\n<b>Бурмалда Бурмалда Бурмалда</b>\n\nДобрый день! Да, в 15:00 мне удобно.",
  "22": "⚠️ <b>Чат больше недоступен</b>\n\nЭтот репетитор больше не назначен вашему аккаунту.\n\nВыберите другого репетитора, чтобы отправить сообщение.",
  "23": "📝 <b>Поддерживаются только текстовые сообщения</b>\n\nОтправьте сообщение обычным текстом.",
  "24": "⚠️ <b>Сообщение слишком длинное</b>\n\nМаксимальная длина сообщения — <b>4000 символов</b>.\n\nСократите текст и отправьте его ещё раз.",
  "25": "⚠️ <b>Не удалось отправить сообщение</b>\n\nПопробуйте ещё раз через несколько секунд.\n\nЕсли ошибка повторяется, откройте TutorGate.",
  "26": "💬 <b>Выберите репетитора</b>\n\nСначала укажите, кому хотите написать.",
  "27": "🌐 <b>Сообщения отправляются через TutorGate</b>\n\nЧтобы написать ученику, откройте чат на сайте.",
  "28": "🌐 <b>TutorGate</b>\n\nУправление системой доступно на сайте.",
};
export const html = (
  text: string,
  rows: InlineButton[][] = [],
): TelegramMessage => ({
  text,
  options: {
    parse_mode: "HTML",
    ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}),
  },
});
export const siteButton = (url: string): InlineButton => ({
  text: "🌐 Открыть TutorGate",
  url,
});
export const writeButton: InlineButton = {
  text: "💬 Написать репетитору",
  callback_data: "chat:choose",
};
const cancel: InlineButton = { text: "✕ Отмена", callback_data: "chat:cancel" };
export function startMessage(role: string | undefined, url: string) {
  return html(
    catalogue[
      role === "student" ? 1 : role === "tutor" ? 2 : role === "admin" ? 3 : 4
    ],
    [[siteButton(url)], ...(role === "student" ? [[writeButton]] : [])],
  );
}
export function confirmationMessage(status: string, url: string) {
  const codes: Record<string, number> = {
    send: 5,
    mismatch: 6,
    no_username: 7,
    linked: 8,
    expired: 9,
    invalid: 10,
  };
  return html(
    catalogue[codes[status] ?? 10],
    ["linked", "expired"].includes(status) ? [[siteButton(url)]] : [],
  );
}
export function registrationMessage(
  action: "approve" | "resend" | "reject",
  url: string,
) {
  return html(
    catalogue[action === "approve" ? 12 : action === "resend" ? 13 : 14],
    [
      [
        action === "reject"
          ? siteButton(url)
          : { text: "✅ Завершить регистрацию", url },
      ],
    ],
  );
}
export const resetMessage = (url: string) =>
  html(catalogue[15], [[{ text: "🔑 Сменить пароль", url }]]);
export const recipientMessage = (name: string) =>
  html(catalogue[17].replace("Дмитрий Тарасов", escapeHtml(name)), [[cancel]]);
export type BotTutor = { id: string; name: string; subjects: string };
export function pickerMessage(tutors: BotTutor[], page = 0) {
  const current = Math.max(0, Math.min(page, Math.ceil(tutors.length / 8) - 1));
  const rows: InlineButton[][] = tutors
    .slice(current * 8, (current + 1) * 8)
    .map((t) => [
      {
        text: [...`${t.name} · ${t.subjects}`].slice(0, 120).join(""),
        callback_data: `chat:to:${t.id}`,
      },
    ]);
  const paging: InlineButton[] = [];
  if (current > 0)
    paging.push({ text: "← Назад", callback_data: `chat:page:${current - 1}` });
  if ((current + 1) * 8 < tutors.length)
    paging.push({ text: "Далее →", callback_data: `chat:page:${current + 1}` });
  if (paging.length) rows.push(paging);
  rows.push([cancel]);
  return html(catalogue[18], rows);
}
export function chatStatusMessage(
  status: string,
  url: string,
  hasTutors = false,
) {
  const codes: Record<string, number> = {
    no_tutors: 19,
    sent: 20,
    unavailable: 22,
    attachment: 23,
    too_long: 24,
    error: 25,
    choose: 26,
    tutor: 27,
    admin: 28,
  };
  const rows: InlineButton[][] =
    status === "choose"
      ? [[writeButton]]
      : status === "unavailable" && hasTutors
        ? [[{ text: "💬 Выбрать репетитора", callback_data: "chat:choose" }]]
        : ["no_tutors", "error", "tutor", "admin"].includes(status)
          ? [[siteButton(url)]]
          : [];
  return html(catalogue[codes[status] ?? 25], rows);
}
export function tutorMessage(name: string, body: string): TelegramMessage[] {
  const header = `💬 <b>Сообщение от репетитора</b>\n\n<b>${escapeHtml(name)}</b>\n\n`;
  if (`💬 Сообщение от репетитора\n\n${name}\n\n${body}`.length <= 4096)
    return [html(header + escapeHtml(body))];
  return [
    html(header + "Ответьте через Reply на следующее сообщение с текстом."),
    { text: body, options: {} },
  ];
}
export function studentNotification(name: string, body: string, url: string) {
  const preview =
    [...body].slice(0, 600).join("") + (codePointLength(body) > 600 ? "…" : "");
  return html(
    `🔔 <b>Новое сообщение от ученика</b>\n\n<b>${escapeHtml(name)}</b>\n\n${escapeHtml(preview)}`,
    [[{ text: "💬 Открыть чат", url }]],
  );
}
