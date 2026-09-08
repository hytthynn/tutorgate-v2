const objects=new Map();
export const fixturePng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=","base64");
export function storageFixture(req,res,url,bytes) {
  if(!url.pathname.startsWith("/storage/v1/"))return false;
  res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","GET,PUT,POST,DELETE,OPTIONS");res.setHeader("Access-Control-Allow-Headers","*");
  if(req.method==="OPTIONS"){res.end();return true;}
  const json=(value,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(value));};
  const key=decodeURIComponent(url.pathname.split("chat-attachments/")[1]??"");
  if(url.pathname.includes("/upload/sign/")&&req.method==="POST")json({url:`/object/upload/sign/chat-attachments/${key}?token=fixture`});
  else if(req.method==="PUT" || (req.method==="POST" && !url.pathname.includes("/sign/"))) {objects.set(key,bytes);json({Key:key});}
  else if(req.method==="POST"&&url.pathname.includes("/object/sign/"))json({signedURL:`/object/sign/chat-attachments/${key}?token=fixture`});
  else if(req.method==="GET") {const file=objects.get(key);res.writeHead(file?200:404,{"Content-Type":"application/octet-stream"});res.end(file??"");}
  else if(req.method==="DELETE") {for(const path of JSON.parse(bytes.toString()).prefixes??[])objects.delete(path);json([]);}
  else json({error:"Unsupported fixture"},400);
  return true;
}
