"use client";
/* Private signed URLs and local blobs bypass the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { AnimatedSticker } from "./animated-sticker";
import { MotionVideo, useReducedMotion } from "@/components/shared/motion-video";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImageIcon, X, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { chatAttachmentUrl } from "@/features/chats/attachment-actions";
import type { ChatAttachment } from "@/features/chats/types";
const sizeLabel = (size: number) => size >= 1048576 ? `${(size / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(size / 1024))} КБ`;

export function DraftFile({ file, remove }: { file: File; remove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return;
    const objectUrl = URL.createObjectURL(file); let active = true;
    queueMicrotask(() => { if (active) setUrl(objectUrl); });
    return () => { active = false; URL.revokeObjectURL(objectUrl); };
  }, [file]);
  return <div className="chat-draft-file">
    {url ? <img src={url} alt={file.name} width={44} height={44} /> : <FileText size={22} aria-hidden />}
    <span className="chat-file-details"><span className="chat-file-name" title={file.name}>{file.name}</span><small>{sizeLabel(file.size)}</small></span>
    <Button type="button" variant="ghost" size="icon" aria-label={`Удалить файл ${file.name}`} onClick={remove}><X size={16} /></Button>
  </div>;
}
export function MessageFile({ file }: { file: ChatAttachment }) {
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false), [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const reduce=useReducedMotion(),[playGif,setPlayGif]=useState(false);
  const pausedGif=file.mime_type==="image/gif"&&reduce&&!playGif;
  useEffect(() => {
    if (file.kind === "file") return;
    let disposed = false, objectUrl = "";
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        try {
          const result = await chatAttachmentUrl(file.id);
          if (result.error) throw new Error(result.error);
          if (disposed) return;
          const response = await fetch(result.data!, { signal: controller.signal });
          if (!response.ok) throw new Error("Не удалось загрузить изображение.");
          objectUrl = URL.createObjectURL(await response.blob());
          if (disposed) URL.revokeObjectURL(objectUrl); else setPreview(objectUrl);
        } catch { if (!disposed) setError(file.kind.startsWith("sticker")?"Не удалось отобразить стикер.":"Превью недоступно. Попробуйте скачать файл."); }
      })();
    }, { rootMargin: "200px" });
    if (container.current) observer.observe(container.current);
    return () => { disposed = true; controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, file.kind]);
  async function download() {
    setPending(true); setError("");
    try {
      const result = await chatAttachmentUrl(file.id);
      if (result.error) throw new Error(result.error);
      const anchor = document.createElement("a");
      anchor.href = result.data!; anchor.download = file.original_name; anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch { setError("Не удалось скачать файл. Попробуйте ещё раз."); }
    finally { setPending(false); }
  }
  return <div ref={container} className={`chat-file ${file.kind !== "file" ? "is-image" : ""} ${file.kind.startsWith("sticker") ? "chat-sticker" : ""}`}>
    {file.kind === "sticker_animated" && preview && <AnimatedSticker src={preview}/>}
    {(file.kind === "sticker_video" || (file.kind === "animation" && file.mime_type.startsWith("video/"))) && preview && <MotionVideo src={preview} className="chat-media-video"/>}
    {pausedGif&&preview&&<Button variant="secondary" onClick={()=>setPlayGif(true)}>Показать GIF</Button>}
    {!pausedGif&&(["image","sticker_static"].includes(file.kind) || (file.kind === "animation" && file.mime_type === "image/gif")) && (preview ? <button type="button" className="chat-image-preview" onClick={() => setExpanded(true)} aria-label={`Открыть изображение ${file.original_name}`}>
      <img src={preview} alt={file.original_name} width={360} height={240} onError={() => { setPreview(""); setError(file.kind.startsWith("sticker")?"Не удалось отобразить стикер.":"Превью недоступно. Попробуйте скачать файл."); }} /><span><Maximize2 size={16} /></span>
    </button> : <div className="chat-image-placeholder"><ImageIcon size={30} aria-hidden /><span>{error ? "Превью недоступно" : "Загрузка изображения…"}</span></div>)}
    {!file.kind.startsWith("sticker") && <div className="chat-file-row">
      {file.kind !== "image" && <span className="chat-file-icon"><FileText size={22} aria-hidden /></span>}
      <span className="chat-file-details"><span className="chat-file-name" title={file.original_name}>{file.original_name}</span><small>{sizeLabel(file.size_bytes)}</small></span>
      <Button type="button" variant="ghost" size="icon" aria-label={`Скачать файл ${file.original_name}`} title="Скачать файл" loading={pending} onClick={() => void download()}><Download size={18} /></Button>
    </div>}
    {error && <span className="field-error" role="alert">{error}</span>}
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="chat-image-dialog">
      <DialogTitle>{file.original_name}</DialogTitle><DialogDescription>{sizeLabel(file.size_bytes)}</DialogDescription>
      {preview && <img src={preview} alt={file.original_name} />}
      <Button variant="secondary" loading={pending} onClick={() => void download()}><Download size={16} />Скачать</Button>
    </DialogContent></Dialog>
  </div>;
}
