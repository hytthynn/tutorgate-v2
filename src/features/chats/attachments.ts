export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const CHAT_BUCKET = "chat-attachments";
export function validateAttachmentTotal(files: { size: number }[]) {
  if (files.reduce((sum,file)=>sum+file.size,0)>MAX_ATTACHMENT_BYTES) throw new Error("Общий размер файлов в сообщении не должен превышать 10 МБ.");
}
export const safeImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export type AttachmentInput = { name: string; size: number; type: string };
export function validateAttachment(file: AttachmentInput) {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) throw new Error("Размер файла должен быть от 1 байта до 10 МБ.");
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0,200);
  if (!name) throw new Error("Укажите имя файла.");
  return { name, size: file.size, type: file.type.slice(0,100) || "application/octet-stream" };
}
export function detectedImage(bytes: Uint8Array): string | null {
  const hex = (n: number) => Array.from(bytes.slice(0,n), x => x.toString(16).padStart(2,"0")).join("");
  if (hex(3) === "ffd8ff") return "image/jpeg";
  if (hex(8) === "89504e470d0a1a0a") return "image/png";
  if (["474946383761","474946383961"].includes(hex(6))) return "image/gif";
  if (hex(4) === "52494646" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}

export function detectedMedia(bytes:Uint8Array):string|null {
 const image=detectedImage(bytes);if(image)return image;
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==="ftyp")return "video/mp4";
 if(bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return "video/webm";
 return null;
}
