// Local fixtures only. Never imported by application code.
import { randomUUID } from "node:crypto";
const cs = [],
  ms = [],
  state = new Map(),
  links = new Map(),
  updates = new Set();
let clock = Date.now();
const ok = (value, status = 200) => ({ value, status });
const publicMessage = ({ id, sender_role, body, delivery_status, created_at }) =>
  ({ id, sender_role, body, delivery_status, created_at });
export function resetChats() {
  cs.length = ms.length = 0;
  state.clear();
  links.clear();
  updates.clear();
  clock = Date.now();
}
export function chatFixture(op, a, path, actor, profiles, assignments) {
  const active = (s, t) =>
    profiles.some(
      (p) =>
        p.id === s && p.role === "student" && p.account_status === "active",
    ) &&
    profiles.some(
      (p) => p.id === t && ["tutor", "admin"].includes(p.role) && p.account_status === "active",
    ) &&
    assignments.some((x) => x.student_id === s && x.tutor_id === t);
  const append = (s, t, role, body) => {
    let c = cs.find((c) => c.studentId === s && c.tutorId === t);
    if (!c) {
      c = { id: randomUUID(), studentId: s, tutorId: t, readAt: "" };
      cs.push(c);
    }
    const m = {
      id: randomUUID(),
      conversation_id: c.id,
      sender_role: role,
      body,
      delivery_status: role === "tutor" ? "pending" : "sent",
      created_at: new Date(++clock).toISOString(),
    };
    ms.push(m);
    return m;
  };
  const unread = (c) =>
    ms.filter(
      (m) =>
        m.conversation_id === c?.id &&
        m.sender_role === "student" &&
        m.created_at > (c?.readAt ?? ""),
    ).length;
  const denied = () => ok({ code: "42501" }, 403);
  if (path === "/fixtures/chat-state")
    return ok({
      messages: ms,
      conversations: cs,
      links: Object.fromEntries(links),
    });
  if (path === "/fixtures/chat-seed") {
    for (let i = 0; i < (a.count ?? 1); i++)
      append(a.student, a.tutor, "student", `Сообщение ученика ${i + 1}`);
    return ok(true);
  }
  if (path === "/fixtures/chat-unassign") {
    for (let i = assignments.length - 1; i >= 0; i--)
      if (
        assignments[i].student_id === a.student &&
        assignments[i].tutor_id === a.tutor
      )
        assignments.splice(i, 1);
    return ok(true);
  }
  if (!op.startsWith("chat_")) return null;
  if (
    ["chat_snapshot", "chat_send", "chat_unread", "chat_mark_read"].includes(
      op,
    ) &&
    (!["tutor", "admin"].includes(actor?.role) || actor.account_status !== "active")
  )
    return denied();
  if (op === "chat_unread")
    return ok(
      cs
        .filter((c) => c.tutorId === actor.id && active(c.studentId, c.tutorId))
        .reduce((n, c) => n + unread(c), 0),
    );
  if (op === "chat_snapshot") {
    const rows = profiles
      .filter((p) => active(p.id, actor.id))
      .map((p) => {
        const c = cs.find(
            (c) => c.studentId === p.id && c.tutorId === actor.id,
          ),
          last = ms.filter((m) => m.conversation_id === c?.id).at(-1);
        return {
          studentId: p.id,
          studentName: p.full_name,
          conversationId: c?.id ?? null,
          lastMessage: last?.body ?? null,
          lastAt: last?.created_at ?? null,
          unread: unread(c),
        };
      });
    const c = cs.find(
        (c) => c.studentId === a.p_student && c.tutorId === actor.id,
      ),
      history = active(a.p_student, actor.id)
        ? ms.filter((m) => m.conversation_id === c?.id)
        : [];
    return ok({
      conversations: rows,
      messages: history.slice(-200).map(publicMessage),
      hasMore: history.length > 200,
      totalUnread: rows.reduce((n, c) => n + c.unread, 0),
    });
  }
  if (op === "chat_send") {
    if (!active(a.p_student, actor.id)) return denied();
    const m = append(
      a.p_student,
      actor.id,
      "tutor",
      a.p_text,
    );
    return ok(publicMessage(m));
  }
  if (op === "chat_mark_read") {
    const c = cs.find(
        (c) => c.studentId === a.p_student && c.tutorId === actor.id,
      ),
      m = ms.find((m) => m.id === a.p_message && m.conversation_id === c?.id);
    if (!m || !active(a.p_student, actor.id)) return denied();
    c.readAt = c.readAt > m.created_at ? c.readAt : m.created_at;
    return ok(null);
  }
  if (op === "chat_bot_profile") {
    const p = profiles.find(
      (p) =>
        p.telegram_user_id === a.p_user &&
        p.telegram_chat_id === a.p_chat &&
        p.account_status === "active",
    );
    return ok(p ? { id: p.id, role: p.role, name: p.full_name } : null);
  }
  if (op === "chat_bot_tutors")
    return ok(
      profiles
        .filter((p) => active(a.p_student, p.id))
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          subjects: "Математика, Физика",
        })),
    );
  if (op === "chat_bot_clear_unavailable_recipient") {
    if (!active(a.p_student, state.get(a.p_student))) state.delete(a.p_student);
    return ok(null);
  }
  if (op === "chat_bot_set_recipient") {
    if (a.p_tutor === null) state.delete(a.p_student);
    else {
      if (!active(a.p_student, a.p_tutor)) return denied();
      state.set(a.p_student, a.p_tutor);
    }
    return ok(null);
  }
  if (op === "chat_delivery_target") {
    const m = ms.find((m) => m.id === a.p_message),
      c = cs.find((c) => c.id === m?.conversation_id);
    return ok(
      c && c.tutorId === a.p_tutor && active(c.studentId, c.tutorId)
        ? {
            chatId: profiles.find((p) => p.id === c.studentId).telegram_chat_id,
            tutorName: profiles.find((p) => p.id === c.tutorId).full_name,
            text: m.body,
          }
        : null,
    );
  }
  if (op === "chat_finish_delivery") {
    const m = ms.find((m) => m.id === a.p_message);
    if (m) {
      m.delivery_status = a.p_success ? "sent" : "failed";
      if (a.p_success) links.set(`${a.p_chat}:${a.p_telegram}`, m.id);
    }
    return ok(null);
  }
  if (op === "chat_notification_target") {
    const m = ms.find((m) => m.id === a.p_message),
      c = cs.find((c) => c.id === m?.conversation_id);
    return ok(
      c && active(c.studentId, c.tutorId)
        ? {chatId: profiles.find((p) => p.id === c.tutorId).telegram_chat_id, role: profiles.find((p) => p.id === c.tutorId).role}
        : null,
    );
  }
  if (op === "chat_bot_receive") {
    if (updates.has(a.p_update)) return ok({ status: "duplicate" });
    const s = profiles.find(
      (p) =>
        p.telegram_user_id === a.p_user &&
        p.telegram_chat_id === a.p_chat &&
        p.role === "student" &&
        p.account_status === "active",
    );
    if (!s) return ok({ status: "unlinked" });
    let t = state.get(s.id);
    if (a.p_reply != null) {
      const m = ms.find((m) => m.id === links.get(`${a.p_chat}:${a.p_reply}`));
      t = cs.find(
        (c) => c.id === m?.conversation_id && c.studentId === s.id,
      )?.tutorId;
    }
    if (!t) return ok({ status: a.p_reply != null ? "unavailable" : "choose" });
    if (!active(s.id, t)) return ok({ status: "unavailable" });
    const m = append(s.id, t, "student", a.p_text);
    updates.add(a.p_update);
    return ok({
      status: "sent",
      messageId: m.id,
      studentId: s.id,
      tutorId: t,
      studentName: s.full_name,
      text: a.p_text,
    });
  }
  return ok(null);
}
