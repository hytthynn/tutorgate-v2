import { cleanupBackgrounds } from "@/features/schedule/background-service";
import "server-only";
import { createAdminClient, serviceRpc } from "@/lib/supabase/admin";
import { CHAT_BUCKET } from "./attachments";
export async function cleanupRevokedChatFiles() {
  await cleanupBackgrounds();
  for (;;) {
    const paths = await serviceRpc<string[]>("chat_revoked_storage_paths",{});
    if (!paths.length) return;
    const result = await createAdminClient().storage.from(CHAT_BUCKET).remove(paths);
    if (result.error) throw new Error("Chat files cleanup pending");
    await serviceRpc("chat_revoked_storage_removed",{p_paths:paths});
  }
}
