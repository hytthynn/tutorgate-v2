"use client";
import {useEffect,useRef} from "react";
const particles=[[9,18],[18,76],[27,42],[36,12],[44,84],[53,30],[62,67],[73,16],[81,48],[92,80],[14,53],[66,91]];
export function SiteBackground(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const media=matchMedia("(prefers-reduced-motion: reduce)"),fine=matchMedia("(pointer: fine)");let frame=0,x=0,y=0;
  const update=()=>{frame=0;root.current?.style.setProperty("--drift-x",`${x}px`);root.current?.style.setProperty("--drift-y",`${y}px`);};
  const move=(event:PointerEvent)=>{if(media.matches||!fine.matches||document.hidden)return;x=(event.clientX/innerWidth-.5)*14;y=(event.clientY/innerHeight-.5)*10;if(!frame)frame=requestAnimationFrame(update);};
  const visibility=()=>{if(root.current)root.current.dataset.paused=String(document.hidden||media.matches);if(document.hidden||media.matches){cancelAnimationFrame(frame);frame=0;x=y=0;update();}};
  window.addEventListener("pointermove",move,{passive:true});document.addEventListener("visibilitychange",visibility);media.addEventListener("change",visibility);visibility();
  return()=>{cancelAnimationFrame(frame);window.removeEventListener("pointermove",move);document.removeEventListener("visibilitychange",visibility);media.removeEventListener("change",visibility);};
 },[]);
 return <div ref={root} className="site-background" aria-hidden="true"><div className="site-background-art">
 <svg className="site-contours" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice" fill="none">
 <g className="site-orbit"><circle cx="1280" cy="170" r="225"/><circle cx="1280" cy="170" r="196" strokeDasharray="2 18"/><path d="M1055 170h32m193-225v32m225 193h-32m-193 225v-32"/></g>
 <g className="site-orbit is-second"><circle cx="140" cy="870" r="170"/><path d="M-30 870Q140 610 310 870Q140 1130-30 870Z"/></g>
 <path className="site-wave" d="M-160 540C160 310 360 810 730 560S1250 320 1600 540"/>
 <path className="site-wave is-second" d="M-100 580C220 350 460 850 830 600S1320 360 1660 580"/>
 </svg>
 {particles.map(([x,y],i)=><span key={i} className={`site-particle ${i%4===0?"is-diamond":""}`} style={{left:`${x}%`,top:`${y}%`,animationDelay:`-${i*2.7}s`,animationDuration:`${16+i%5*4}s`}}/>)}
 </div></div>;
}
