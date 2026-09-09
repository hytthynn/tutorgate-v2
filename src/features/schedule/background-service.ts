import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient,serviceRpc } from "@/lib/supabase/admin";
import { BACKGROUND_BUCKET,type ScheduleBackground } from "./background";
export async function readBackground(owner:string):Promise<ScheduleBackground|null>{
 const db=await createClient(),result=await db.rpc("schedule_background_read",{p_owner:owner});if(result.error)throw new Error("Фон недоступен.");if(!result.data)return null;
 const b=result.data as {storage_path:string;mime_type:string;kind:"image"|"video"};const signed=await createAdminClient().storage.from(BACKGROUND_BUCKET).createSignedUrl(b.storage_path,3600);if(signed.error)throw signed.error;return {url:signed.data.signedUrl,mimeType:b.mime_type,kind:b.kind};
}
export async function cleanupBackgrounds(){for(;;){const paths=await serviceRpc<string[]>("schedule_background_gc_paths");if(!paths.length)return;const result=await createAdminClient().storage.from(BACKGROUND_BUCKET).remove(paths);if(result.error)throw result.error;await serviceRpc("schedule_background_gc_done",{p_paths:paths});}}
