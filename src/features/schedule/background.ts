export const BACKGROUND_BUCKET="schedule-backgrounds";
export const MAX_BACKGROUND_BYTES=7*1024*1024;
export const backgroundTypes=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm"];
export type ScheduleBackground={url:string;kind:"image"|"video";mimeType:string};
export function validateBackground(size:number,type:string){if(!Number.isSafeInteger(size)||size<1||size>MAX_BACKGROUND_BYTES)throw new Error("Размер фона должен быть до 7 МБ.");if(!backgroundTypes.includes(type))throw new Error("Поддерживаются JPEG, PNG, WebP, GIF, MP4, WebM.");}
