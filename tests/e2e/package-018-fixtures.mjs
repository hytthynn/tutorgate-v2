// Isolated fixture contracts. Authorization and transactions are tested in PGlite.
const tutor=new Map(),pair=new Map(),backgrounds=new Map(),uploads=new Map(),gc=[];
let globalRate=1500;
export function reset018(){tutor.clear();pair.clear();backgrounds.clear();uploads.clear();gc.length=0;globalRate=1500;}
export const fixtureRate=(lesson)=>pair.get(`${lesson.tutor_id}/${lesson.student_id}`)??tutor.get(lesson.tutor_id)??globalRate;
export function fixture018(op,a,actor,lessons,method,params){
 const owner=a.p_owner??a.p_tutor,ok=value=>({value,status:200}),denied=()=>({value:{code:"42501"},status:403});
 if(op==="app_settings"){if(method==="PATCH")globalRate=a.hourly_rate;return ok([{hourly_rate:globalRate}]);}
 if(op==="tutor_billing_rates")return ok([...tutor].map(([tutor_id,hourly_rate])=>({tutor_id,hourly_rate})).filter(r=>!params.has("tutor_id")||params.get("tutor_id")===`eq.${r.tutor_id}`));
 if(op==="tutor_student_billing_rates")return ok([...pair].map(([key,hourly_rate])=>({tutor_id:key.split("/")[0],student_id:key.split("/")[1],hourly_rate})).filter(r=>["tutor_id","student_id"].every(k=>!params.has(k)||params.get(k)===`eq.${r[k]}`)));
 if(op==="admin_set_tutor_rate"||op==="admin_set_tutor_student_rate"){if(actor?.role!=="admin")return denied();let target=tutor,key=owner;if(a.p_lesson){const lesson=lessons.find(l=>l.id===a.p_lesson&&l.tutor_id===owner);if(!lesson)return denied();target=pair;key=`${owner}/${lesson.student_id}`;}if(a.p_rate===null)target.delete(key);else target.set(key,a.p_rate);return ok(null);}
 if(op==="schedule_background_read"){if(actor?.role!=="admin"&&actor?.id!==owner)return denied();return ok(backgrounds.get(owner)??null);}
 if(op==="schedule_background_prepare"){if(a.p_actor!==owner)return denied();const path=`${owner}/${a.p_id}`;uploads.set(a.p_id,{owner,storage_path:path,claimed_size:a.p_size});return ok(path);}
 if(op==="schedule_background_upload")return ok(uploads.get(a.p_id)??null);
 if(op==="schedule_background_set"){if(a.p_actor!==owner)return denied();const old=backgrounds.get(owner);if(old)gc.push(old.storage_path);if(a.p_id===null)backgrounds.delete(owner);else{const u=uploads.get(a.p_id);backgrounds.set(owner,{storage_path:u.storage_path,mime_type:a.p_mime,kind:a.p_mime.startsWith("video/")?"video":"image"});uploads.delete(a.p_id);}return ok(null);}
 if(op==="schedule_background_gc_paths")return ok([...gc]);
 if(op==="schedule_background_gc_done"){gc.length=0;return ok(null);}
}
