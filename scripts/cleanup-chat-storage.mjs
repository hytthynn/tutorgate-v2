// Run hourly from a trusted scheduler with the same server environment as the app.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{ auth:{ persistSession:false,autoRefreshToken:false } });
// First retry immediate removal of files from revoked assignments.
for (;;) {
  const pending = await db.rpc("chat_revoked_storage_paths");
  if (pending.error) throw new Error("Revoked file lookup failed");
  if (!pending.data.length) break;
  const removed = await db.storage.from("chat-attachments").remove(pending.data);
  if (removed.error) throw new Error("Revoked file cleanup failed; retry is safe");
  const ack = await db.rpc("chat_revoked_storage_removed", { p_paths:pending.data });
  if (ack.error) throw new Error("Revoked file cleanup audit failed");
}
for (;;) {
  const batch = await db.rpc("chat_storage_cleanup_candidates");
  if (batch.error) throw new Error("Storage cleanup candidate lookup failed");
  if (!batch.data.length) break;
  const removed = await db.storage.from("chat-attachments").remove(batch.data);
  if (removed.error) throw new Error("Storage cleanup failed; retry is safe");
  const finished = await db.rpc("chat_storage_cleanup_finished",{ p_paths:batch.data });
  if (finished.error) throw new Error("Storage cleanup audit failed; retry is safe");
  console.log(`Cleaned ${batch.data.length} chat objects`);
}
