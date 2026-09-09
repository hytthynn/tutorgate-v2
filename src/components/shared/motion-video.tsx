"use client";
import { useEffect,useRef,useSyncExternalStore } from "react";
const subscribe=(notify:()=>void)=>{const media=matchMedia("(prefers-reduced-motion: reduce)");media.addEventListener("change",notify);return ()=>media.removeEventListener("change",notify);};
export const useReducedMotion=()=>useSyncExternalStore(subscribe,()=>matchMedia("(prefers-reduced-motion: reduce)").matches,()=>true);
export function MotionVideo({src,className}:{src:string;className?:string}){
 const ref=useRef<HTMLVideoElement>(null),reduce=useReducedMotion();
 useEffect(()=>{const video=ref.current;if(!video)return;if(reduce)video.pause();else void video.play().catch(()=>{video.controls=true;});},[src,reduce]);
 return <video ref={ref} src={src} className={className} autoPlay={!reduce} controls={reduce} muted loop playsInline preload="metadata"/>;
}
