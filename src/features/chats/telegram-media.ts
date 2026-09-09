import { z } from "zod";
export const telegramMediaSchema=z.object({file_id:z.string().min(1).max(1024),file_size:z.number().int().nonnegative().safe().optional(),file_name:z.string().max(1024).optional()});
export const animationSchema=telegramMediaSchema.extend({mime_type:z.string().max(100).optional(),width:z.number().int().nonnegative().optional(),height:z.number().int().nonnegative().optional(),duration:z.number().nonnegative().optional()});
export const stickerSchema=telegramMediaSchema.extend({width:z.number().int().nonnegative(),height:z.number().int().nonnegative(),is_animated:z.boolean().optional(),is_video:z.boolean().optional(),emoji:z.string().max(100).optional()});
export type IncomingMedia=z.infer<typeof telegramMediaSchema>&{kind?:"image"|"file"|"animation"|"sticker_static"|"sticker_animated"|"sticker_video"};
export function incomingMedia(message:{animation?:z.infer<typeof animationSchema>;sticker?:z.infer<typeof stickerSchema>;document?:z.infer<typeof telegramMediaSchema>;photo?:z.infer<typeof telegramMediaSchema>[]}):IncomingMedia|undefined {
 if(message.sticker){const s=message.sticker;return {...s,kind:s.is_video?"sticker_video":s.is_animated?"sticker_animated":"sticker_static",file_name:s.is_video?"Стикер.webm":s.is_animated?"Стикер.tgs":"Стикер.webp"};}
 if(message.animation)return {...message.animation,kind:"animation",file_name:message.animation.file_name??"Анимация.mp4"};
 return message.document??message.photo?.at(-1);
}
/** Lottie vector-only contract: no expressions, external images/fonts or unbounded scene trees. */
export function validateLottie(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid sticker");const data=value as Record<string,unknown>;
 if(typeof data.v!=="string"||!Array.isArray(data.layers)||data.layers.length>500||typeof data.fr!=="number"||data.fr<=0||data.fr>120||typeof data.w!=="number"||data.w<=0||data.w>2048||typeof data.h!=="number"||data.h<=0||data.h>2048||typeof data.ip!=="number"||typeof data.op!=="number"||data.op<=data.ip||data.op-data.ip>3600)throw new Error("Invalid sticker");
 if(data.assets!==undefined&&(!Array.isArray(data.assets)||data.assets.some(a=>!a||typeof a!=="object"||"p" in a||"u" in a||"e" in a)))throw new Error("Only embedded vector assets allowed");
 let count=0;function check(node:unknown,depth:number){if(++count>100000||depth>64)throw new Error("Sticker too complex");if(Array.isArray(node)){for(const child of node)check(child,depth+1);}else if(node&&typeof node==="object")for(const [key,child] of Object.entries(node)){if((key==="x"&&typeof child==="string")||["fPath","url","href"].includes(key)||(key==="p"&&typeof child==="string")||(key==="u"&&typeof child==="string"&&child!==""))throw new Error("External assets or expressions forbidden");check(child,depth+1);}}
 check(data,0);return data;
}
