/* TutorGate adapter: TikZJax executes in a disposable worker, never in the page DOM. */
let input,diagnostic="";
const nativeFetch=self.fetch.bind(self);
self.fetch=(url,options)=>{
 const target=new URL(url,self.location.href);
 if(target.origin!==self.location.origin||!/^\/vendor\/tikzjax\/[a-f0-9]+\.(wasm|gz)$/.test(target.pathname))throw new Error("Resource denied");
 return nativeFetch(target,{...options,credentials:"omit"});
};
self.window=self;
self.document={
 currentScript:{src:new URL("tikzjax-local.js",self.location.href).href},
 getElementsByTagName:()=>[input],
 createElement:()=>{
  const attributes={};
  return {style:{},innerHTML:"",attributes,getElementsByTagName(){return this.innerHTML.includes("<svg")?[{setAttribute:(key,value)=>attributes[key]=value}]:[];}};
 }
};
console.log=(...values)=>{const text=values.join(" ");if(text.startsWith("!"))diagnostic=text.slice(0,500);};
console.error=(...values)=>{diagnostic=values.join(" ").slice(0,500);};
self.onunhandledrejection=event=>{self.postMessage({error:diagnostic||String(event.reason).slice(0,500)});};
self.onmessage=event=>{
 if(typeof event.data!=="string"||event.data.length>16000)return self.postMessage({error:"Код слишком большой."});
 input={getAttribute:()=>"text/tikz",childNodes:[{nodeValue:event.data}],parentNode:{replaceChild(node){self.postMessage(diagnostic?{error:diagnostic}:{html:node.innerHTML,attributes:node.attributes});}}};
 try{importScripts("tikzjax-local.js");self.onload();}catch(error){self.postMessage({error:String(error).slice(0,500)});}
};
