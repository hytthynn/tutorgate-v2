"use client";
/* Private signed URLs and local blobs must bypass the public Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { chatAttachmentUrl } from "@/features/chats/attachment-actions";
import type { ChatAttachment } from "@/features/chats/types";

export function DraftFile({ file, remove }: { file: File; remove: () => void }) {
  const [url,setUrl] = useState("");
  useEffect(() => {
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) return;
    const objectUrl = URL.createObjectURL(file); let active = true;
    queueMicrotask(() => { if (active) setUrl(objectUrl); });
    return () => { active = false; URL.revokeObjectURL(objectUrl); };
  },[file]);
  return <div className="chat-file">{url && <img src={url} alt={file.name} width={80} height={60} />}<span>{file.name} · {(file.size/1024).toFixed(1)} КБ</span><Button type="button" variant="ghost" size="sm" aria-label={`Удалить файл ${file.name}`} onClick={remove}>Удалить</Button></div>;
}
export function MessageFile({ file }: { file: ChatAttachment }) {
  const [url,setUrl] = useState(""), [error,setError] = useState(""), [pending,setPending] = useState(false);
  async function open() {
    setPending(true); setError("");
    try { const result = await chatAttachmentUrl(file.id); if (result.error) setError(result.error); else setUrl(result.data!); }
    catch { setError("Не удалось загрузить файл."); } finally { setPending(false); }
  }
  useEffect(() => { if (!url) return; const timer = setTimeout(() => setUrl(""),55000); return () => clearTimeout(timer); },[url]);
  return <div className="chat-file">
    <span>{file.original_name} · {(file.size_bytes/1024).toFixed(1)} КБ</span>
    {url ? <>{file.kind === "image" && <img src={url} alt={file.original_name} width={160} height={120} />}<a href={url} download={file.original_name} rel="noopener noreferrer">Скачать</a></> : <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => void open()}>{file.kind === "image" ? "Открыть изображение" : "Скачать файл"}</Button>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
