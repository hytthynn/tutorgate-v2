// Isolated UI fixtures. This process is never imported by application code.
// PostgreSQL/RLS behaviour is separately tested with real migrations in PGlite.
import http from "node:http";
import { spawn } from "node:child_process";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profiles = [
  {
    id: id(1),
    role: "admin",
    full_name: "Александр Волков",
    telegram_username: "alex_volkov",
  },
  {
    id: id(2),
    role: "tutor",
    full_name: "Мария Соколова",
    telegram_username: "maria_sokolova",
  },
  {
    id: id(3),
    role: "tutor",
    full_name: "Дмитрий Лебедев",
    telegram_username: "dmitry_lebedev",
  },
  {
    id: id(4),
    role: "student",
    full_name: "Анна Смирнова",
    telegram_username: "anna_smirnova",
  },
  {
    id: id(5),
    role: "student",
    full_name: "Михаил Кузнецов",
    telegram_username: "mikhail_kuznetsov",
  },
];
const subjects = [
  "Математика",
  "Физика",
  "Английский язык",
  "Русский язык",
  "Информатика",
  "Химия",
].map((name, i) => ({ id: id(10 + i), name, is_active: true }));
const tutorSubjects = [
  { tutor_id: id(1), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(10) },
  { tutor_id: id(2), subject_id: id(11) },
  { tutor_id: id(3), subject_id: id(12) },
];
const assignments = [
  { id: id(20), student_id: id(4), tutor_id: id(2), subject_id: id(10) },
  { id: id(21), student_id: id(5), tutor_id: id(2), subject_id: id(11) },
];
const sessions = new Map();
const jwt = (uid) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, email: "hidden_alias@internal.test", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture-signature`;
function user(uid) {
  return {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "hidden_alias@internal.test",
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  };
}
const server = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const args = text ? JSON.parse(text) : {};
  const url = new URL(req.url, "http://localhost");
  let uid;
  try {
    uid = JSON.parse(
      Buffer.from(
        (req.headers.authorization ?? "").split(".")[1],
        "base64url",
      ).toString(),
    ).sub;
  } catch {}
  const profile = profiles.find((p) => p.id === uid);
  let value = [];
  const op = url.pathname.split("/").at(-1);
  if (url.pathname === "/auth/v1/token") {
    const name = args.email?.split("@")[0];
    const p = profiles.find((p) => p.role === name) ?? profiles[0];
    value = {
      access_token: jwt(p.id),
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: user(p.id),
    };
  } else if (url.pathname === "/auth/v1/user") value = user(uid);
  else if (op === "session_read") value = sessions.get(args.p_hash) ?? null;
  else if (op === "session_write") {
    sessions.set(args.p_hash, args.p_cookies);
    value = null;
  } else if (op === "lookup_alias") value = `${args.p_username}@internal.test`;
  else if (op === "rate_limit") value = true;
  else if (op === "bind_session") value = null;
  else if (op === "profiles")
    value = profiles.filter(
      (p) =>
        !url.searchParams.get("id") ||
        `eq.${p.id}` === url.searchParams.get("id"),
    );
  else if (op === "visible_profiles") {
    value =
      profile?.role === "admin"
        ? profiles
        : profiles.filter(
            (p) =>
              p.id === uid ||
              assignments.some(
                (a) =>
                  (a.student_id === uid && a.tutor_id === p.id) ||
                  (a.tutor_id === uid && a.student_id === p.id),
              ),
          );
    if (url.searchParams.has("id"))
      value = value.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
  } else if (op === "subjects") value = subjects;
  else if (op === "tutor_subjects") value = tutorSubjects;
  else if (op === "student_tutor_assignments")
    value =
      profile?.role === "admin"
        ? assignments
        : assignments.filter((a) => a.student_id === uid || a.tutor_id === uid);
  else if (op === "app_settings") value = [{ hourly_rate: 1500 }];
  else if (op === "token_status") value = args.p_hash ? "valid" : null;
  if (req.headers.accept?.includes("vnd.pgrst.object") && Array.isArray(value))
    value = value[0] ?? null;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
});
server.listen(54329, "127.0.0.1");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SECRET_KEY: "fixture-secret",
      TELEGRAM_BOT_USERNAME: "tutorgate_fixture_bot",
      TELEGRAM_WEBHOOK_SECRET: "fixture-webhook",
      AUTH_ALIAS_DOMAIN: "internal.test",
      APP_URL: "http://localhost:3100",
    },
  },
);
function close() {
  child.kill();
  server.close();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", () => {
  server.close();
  process.exit();
});
