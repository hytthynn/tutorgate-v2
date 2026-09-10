import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {fileURLToPath} from "node:url";
test("LaTeX broker rejects unauthenticated/oversized requests and handles missing Docker",async()=>{
 const socket=createServer();socket.listen(0,"127.0.0.1");await once(socket,"listening");const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
 const token="local-renderer-test-secret-32-characters";
 const child=spawn(process.execPath,[fileURLToPath(new URL("../services/latex/server.mjs",import.meta.url))],{windowsHide:true,env:{...process.env,PORT:String(port),HOST:"127.0.0.1",LATEX_RENDER_TOKEN:token,PATH:"",Path:""},stdio:["ignore","pipe","pipe"]});
 try{
  await Promise.race([once(child.stdout,"data"),once(child,"exit").then(()=>{throw new Error("Broker failed to start");}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Startup timeout")),10000).unref())]);
  const endpoint=`http://127.0.0.1:${port}/render`,headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(endpoint,{method:"POST",body:"{}"})).status,401);
  assert.equal((await fetch(endpoint,{method:"POST",headers,body:"x".repeat(200001)})).status,413);
  assert.equal((await fetch(endpoint,{method:"POST",headers,body:"not json"})).status,503);
  assert.equal((await fetch(endpoint,{method:"POST",headers,body:"{}"})).status,503);
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await once(child,"exit").catch(()=>{});}}
});
