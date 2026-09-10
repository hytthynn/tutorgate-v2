// Run on a dedicated Docker host. No application secrets enter the render container.
import http from "node:http";
import {spawn} from "node:child_process";
import {randomUUID,timingSafeEqual} from "node:crypto";
const token=process.env.LATEX_RENDER_TOKEN;
if(!token||token.length<32)throw new Error("LATEX_RENDER_TOKEN must contain at least 32 characters");
let active=0;
const server=http.createServer(async(req,res)=>{
 const respond=(status,value)=>{if(!res.destroyed){res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));}};
 const supplied=Buffer.from(req.headers.authorization??""),expected=Buffer.from(`Bearer ${token}`);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return respond(401,{error:"Unauthorized"});
 if(req.method!=="POST"||req.url!=="/render")return respond(404,{error:"Not found"});
 if(active>=2)return respond(429,{error:"Busy"});
 active++;
 const name=`tutorgate-latex-${randomUUID()}`;
 let child,timeout,finished=false;
 const kill=()=>{if(child&&!finished){const cleanup=spawn("docker",["rm","-f",name],{stdio:"ignore",windowsHide:true});cleanup.on("error",()=>{});child.kill();}};
 const disconnected=()=>{if(!res.writableEnded)kill();};
 res.on("close",disconnected);
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>200000)return respond(413,{error:"Too large"});chunks.push(chunk);}
  const payload=Buffer.concat(chunks);JSON.parse(payload.toString("utf8"));
  child=spawn("docker",["run","--rm","-i","--name",name,"--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--pids-limit","64","--memory","512m","--cpus","1","--tmpfs","/work:rw,noexec,nosuid,size=96m,mode=1777","--tmpfs","/tmp:rw,noexec,nosuid,size=32m,mode=1777",process.env.LATEX_RENDER_IMAGE??"tutorgate-latex:local"],{stdio:["pipe","pipe","pipe"],windowsHide:true});
  timeout=setTimeout(kill,45000);
  let output="";
  child.stdout.on("data",chunk=>{output+=chunk;if(output.length>8_000_000)kill();});
  child.stderr.resume();child.stdin.on("error",()=>{});child.stdin.end(payload);
  const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);});
  finished=true;
  if(code!==0)return respond(200,{error:"Компиляция не завершилась: проверьте код, размер рисунка и доступность Docker."});
  respond(200,JSON.parse(output));
 }catch{kill();respond(503,{error:"Компилятор недоступен."});}
 finally{clearTimeout(timeout);active--;res.off("close",disconnected);}
});
server.requestTimeout=15000;
server.listen(Number(process.env.PORT??3201),process.env.HOST??"127.0.0.1",()=>console.log("LaTeX renderer ready"));
