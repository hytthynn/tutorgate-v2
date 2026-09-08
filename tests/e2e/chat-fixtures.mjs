import { fixtureControlId } from "./application-fixtures.mjs";
// Local fixtures only. Never imported by application code.
import { randomUUID } from "node:crypto";
const uploads=[], attachments=[], replies=new Map(), albums=new Map();
const cs = [],
  ms = [],
  state = new Map(),
  links = new Map(),
  updates = new Set();
let clock = Date.now();
const ok = (value, status = 200) => ({ value, status });
const publicMessage = ({ id, sender_role, body, content, delivery_status, created_at, attachments }) =>
  ({ id, sender_role, body, content, delivery_status, created_at, attachments });
export function resetChats() {
  cs.length = ms.length = uploads.length = attachments.length = 0;
  state.clear(); replies.clear();albums.clear();
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
  if(op==="chat_revoked_storage_paths")return ok([]);
  if(op==="chat_bot_clear_reply"){replies.delete(a.p_student);return ok(null);}
  if(op==="chat_bot_reply_context"){const p=profiles.find(p=>p.telegram_user_id===a.p_user);return ok(replies.get(p?.id)??null);}
  if(op==="chat_bot_begin_reply"){
    const p=profiles.find(p=>p.telegram_user_id===a.p_user&&p.telegram_chat_id===a.p_chat);
    const m=ms.find(m=>m.id===a.p_message&&m.id===links.get(`${a.p_chat}:${a.p_source}`));
    const c=cs.find(c=>c.id===m?.conversation_id&&c.studentId===p?.id);
    if(!c||!active(c.studentId,c.tutorId))return denied();replies.set(p.id,a.p_source);state.set(p.id,c.tutorId);return ok({name:profiles.find(p=>p.id===c.tutorId).full_name});
  }
  if (!op.startsWith("chat_")) return null;
  if (
    ["chat_snapshot", "chat_send", "chat_unread", "chat_mark_read"].includes(
      op,
    ) &&
    (!["tutor", "admin"].includes(actor?.role) || actor.account_status !== "active")
  )
    return denied();
  if(op==="chat_prepare_upload") { const storage_path=`${a.p_actor}/${a.p_student}/${a.p_id}`;uploads.push({id:a.p_id,actor_id:a.p_actor,student_id:a.p_student,storage_path,original_name:a.p_name,claimed_size:a.p_size});return ok(storage_path); }
  if(op==="chat_upload_details")return ok(uploads.filter(u=>a.p_ids.includes(u.id)));
  if(op==="chat_finalize_uploads") {
    const m=append(a.p_student,a.p_actor,"tutor",a.p_content.map(n=>n.text).join(""));m.content=a.p_content;m.attachments=[];
    for(const file of a.p_files){const u=uploads.find(u=>u.id===file.id);const row={id:u.id,message_id:m.id,storage_path:u.storage_path,original_name:u.original_name,mime_type:file.type,size_bytes:file.size,kind:file.type.startsWith("image/")?"image":"file"};attachments.push(row);m.attachments.push(row);}
    return ok(publicMessage(m));
  }
  if(op==="chat_attachment_access")return ok(attachments.find(f=>f.id===a.p_id)??null);
  if(op==="chat_previous") {const c=cs.find(c=>c.studentId===a.p_student&&c.tutorId===actor.id);return ok(ms.filter(m=>m.conversation_id===c?.id&&m.created_at<a.p_before).slice(-200).map(publicMessage));}
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
  if (op === "chat_send" || op === "chat_send_rich") {
    if (!active(a.p_student, actor.id)) return denied();
    const m = append(
      a.p_student,
      actor.id,
      "tutor",
      a.p_content ? a.p_content.map(n=>n.text).join("") : a.p_text,
    );
    m.content=a.p_content;
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
  if (op === "chat_attachments") return ok(attachments);
  if (op === "chat_finish_delivery" || op === "chat_finish_delivery_parts") {
    const m = ms.find((m) => m.id === a.p_message);
    if (m) {
      m.delivery_status = a.p_success ? "sent" : "failed";
      for(const n of a.p_ids??[a.p_telegram])if(n)links.set(`${a.p_chat}:${n}`,m.id);
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
  if(op==="chat_bot_album_target" || op==="chat_bot_receive_album") {
    const student=profiles.find(p=>p.telegram_user_id===a.p_user&&p.telegram_chat_id===a.p_chat&&p.role==="student"&&p.account_status==="active");
    if(!student)return ok({status:"unlinked"});if(updates.has(a.p_update))return ok({status:"duplicate"});
    const key=`${student.id}:${a.p_group}`;let album=albums.get(key);
    if(!album){const target=chatFixture("chat_bot_media_target",a,path,actor,profiles,assignments).value;if(target.status!=="ok")return ok(target);album={tutor:target.tutor,message:null};albums.set(key,album);}
    if(!active(student.id,album.tutor))return ok({status:"unavailable"});
    if(op==="chat_bot_album_target")return ok({status:"ok",student:student.id,tutor:album.tutor});
    const continuation=!!album.message;
    const m=album.message??append(student.id,album.tutor,"student","");album.message=m;
    m.body+=(m.body&&a.p_text?"\n":"")+a.p_text;m.content=[...(m.content??[]),...a.p_content];
    const f=a.p_file,row={id:f.id,message_id:m.id,storage_path:f.path,original_name:f.name,mime_type:f.type,size_bytes:f.size,kind:f.type.startsWith("image/")?"image":"file"};attachments.push(row);m.attachments=[...(m.attachments??[]),row];
    updates.add(a.p_update);state.delete(student.id);replies.delete(student.id);
    return ok({status:"sent",messageId:m.id,studentId:student.id,tutorId:album.tutor,studentName:student.full_name,tutorName:"Tutor",text:m.body+" 📎 "+m.attachments.map(f=>f.original_name).join(", "),albumContinuation:continuation,controlId:fixtureControlId(a.p_chat)});
  }
  if (op === "chat_bot_media_target" || op === "chat_bot_receive" || op === "chat_bot_receive_rich" || op === "chat_bot_receive_flow") {
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
    if(op==="chat_bot_media_target")return ok({status:"ok",student:s.id,tutor:t});
    const m = append(s.id, t, "student", a.p_text);m.content=a.p_content;
    if(a.p_file){const f=a.p_file;const row={id:f.id,message_id:m.id,storage_path:f.path,original_name:f.name,mime_type:f.type,size_bytes:f.size,kind:f.type.startsWith("image/")?"image":"file"};attachments.push(row);m.attachments=[row];}
    updates.add(a.p_update);
    const original=ms.find(m=>m.id===links.get(`${a.p_chat}:${a.p_reply}`));
    if(op==="chat_bot_receive_flow"){state.delete(s.id);replies.delete(s.id);}
    return ok({
      status: "sent",
      messageId: m.id,
      studentId: s.id,
      tutorId: t,
      studentName: s.full_name,
      tutorName: profiles.find(p=>p.id===t).full_name, originalText: original?.body, replyTelegramId: a.p_reply, controlId: fixtureControlId(a.p_chat),
      text: a.p_text,
    });
  }
  return ok(null);
}
