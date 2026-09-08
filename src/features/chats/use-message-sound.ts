"use client";
import { useCallback, useEffect, useRef } from "react";
export function useMessageSound(enabled: boolean) {
  const audio=useRef<AudioContext | null>(null), last=useRef(0);
  useEffect(()=>{
    if(!enabled)return;
    const unlock=()=>{
      try { audio.current ??= new AudioContext(); void audio.current.resume().catch(()=>{}); } catch { /* Audio is optional in unsupported browsers. */ }
    };
    document.addEventListener("pointerdown",unlock);document.addEventListener("keydown",unlock);
    return ()=>{
      document.removeEventListener("pointerdown",unlock);document.removeEventListener("keydown",unlock);
      void audio.current?.close().catch(()=>{});audio.current=null;
    };
  },[enabled]);
  return useCallback(()=>{
    const context=audio.current;
    if(!enabled || !context || context.state!=="running" || Date.now()-last.current<1200)return;
    last.current=Date.now();
    const oscillator=context.createOscillator(), gain=context.createGain(), time=context.currentTime;
    oscillator.type="sine";oscillator.frequency.setValueAtTime(660,time);oscillator.frequency.setValueAtTime(880,time+.11);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.08,time+.015);gain.gain.exponentialRampToValueAtTime(.001,time+.3);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+.32);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  },[enabled]);
}
