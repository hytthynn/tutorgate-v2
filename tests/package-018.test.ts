import { renderLatex } from "../src/features/chats/latex";
import test from "node:test";
import assert from "node:assert/strict";
import { parseRichContent,plainText,plainContent,telegramContent,fromTelegram,markdownDocument,latexSegments,contentSchema } from "../src/features/chats/rich-text";
import { billingRateSchema,effectiveRate } from "../src/features/schedule/rates";
import { aggregateLessons } from "../src/features/statistics/aggregate";
import { incomingMedia,stickerSchema,animationSchema,validateLottie } from "../src/features/chats/telegram-media";
import { detectedMedia } from "../src/features/chats/attachments";
import { validateBackground,MAX_BACKGROUND_BYTES } from "../src/features/schedule/background";
test("018 rich v1/v2, block boundaries, source code and Telegram entities",()=>{
 const legacy=parseRichContent([{text:"old",marks:[{type:"bold"},{type:"italic"},{type:"underline"},{type:"strike"}]}]);assert.equal(legacy.version,2);assert.equal(plainText(legacy),"old");
 const doc=parseRichContent({version:2,blocks:[{type:"paragraph",align:"right",content:plainContent("$x$ ")},{type:"ordered_list",items:[{content:plainContent("one")},{content:plainContent("two")}]},{type:"code_block",language:"JS",text:"\tconst x = '<&>';\n"}]});
 assert.equal(plainText(doc),"$x$ \none\ntwo\n\tconst x = '<&>';\n");assert.match(telegramContent(doc).join(""),/<pre><code class="language-js">/);assert.match(telegramContent(doc).join(""),/&lt;&amp;&gt;/);
 const code=markdownDocument(plainContent("```python\n  print('$x$')\n```\n"));assert.deepEqual(code.blocks,[{type:"code_block",language:"python",text:"  print('$x$')\n"}]);
 assert.deepEqual(fromTelegram("a\t b\n",[{type:"pre",offset:0,length:5,language:"python"}]).blocks,[{type:"code_block",language:"python",text:"a\t b\n"}]);
 assert.match(telegramContent(markdownDocument(plainContent("`hello`")))[0],/<code>hello<\/code>/);
 const chunks=telegramContent({version:2,blocks:[{type:"code_block",text:"<&".repeat(2000)}]});assert.ok(chunks.length>1);for(const chunk of chunks){assert.ok(chunk.length<=3900);assert.equal((chunk.match(/<pre>/g)??[]).length,(chunk.match(/<\/pre>/g)??[]).length);}
 for(const blocks of [[{type:"html",text:"<script>"}],[{type:"paragraph",align:"left",content:[{text:"x",marks:[{type:"link",href:"javascript:bad"}]}]}],[{type:"code_block",text:"x",language:'js" onclick="x'}]])assert.equal(contentSchema.safeParse({version:2,blocks}).success,false);
 assert.throws(()=>parseRichContent({version:2,blocks:[{type:"code_block",text:"😀".repeat(4001)}]}));
});
test("018 all math delimiters and incomplete source fallback",()=>{const text=String.raw`$x$ $$y$$ \(z\) \[w\]`;const segments=latexSegments(text).filter(s=>s.source);assert.deepEqual(segments.map(s=>s.source),["x","y","z","w"]);assert.deepEqual(segments.map(s=>s.display),[false,true,false,true]);assert.equal(latexSegments("$unclosed")[0].text,"$unclosed");});
test("018 rate priority, finite cents and snapshot earnings across midnight",()=>{
 assert.equal(effectiveRate(0,1500,1200),0);assert.equal(effectiveRate(null,1500,1200),1500);assert.equal(effectiveRate(null,null,1200),1200);
 for(const rate of [0,.01,1000000])assert.equal(billingRateSchema.safeParse(rate).success,true);
 for(const rate of [-1,1000000.01,NaN,Infinity,1.001])assert.equal(billingRateSchema.safeParse(rate).success,false);
 const lessons=[{startsAt:"2026-09-07T20:30:00Z",endsAt:"2026-09-07T21:30:00Z",completed:true,hourlyRateSnapshot:1200},{startsAt:"2026-09-08T10:00:00Z",endsAt:"2026-09-08T11:00:00Z",completed:true,hourlyRateSnapshot:1800}];
 const result=aggregateLessons(lessons,"2026-09-07","2026-09-08",0,"earnings");assert.deepEqual(result.points.map(p=>p.value),[600,2400]);assert.equal(result.totals.earnings,3000);
});
test("018 Telegram kinds, signatures, bounded vector stickers and background formats",()=>{
 for(const [extra,kind] of [[{},"sticker_static"],[{is_animated:true},"sticker_animated"],[{is_video:true},"sticker_video"]] as const){const sticker=stickerSchema.parse({file_id:"x",width:512,height:512,...extra});assert.equal(incomingMedia({sticker})?.kind,kind);}
 assert.equal(incomingMedia({animation:animationSchema.parse({file_id:"gif"})})?.kind,"animation");
 assert.equal(detectedMedia(new TextEncoder().encode("GIF89a")),"image/gif");assert.equal(detectedMedia(new Uint8Array([0x1a,0x45,0xdf,0xa3])),"video/webm");assert.equal(detectedMedia(new TextEncoder().encode("0000ftypisom")),"video/mp4");assert.equal(detectedMedia(new TextEncoder().encode("RIFF0000WEBP")),"image/webp");
 const safe={v:"5.5.0",fr:30,w:512,h:512,ip:0,op:60,layers:[]};assert.equal(validateLottie(safe),safe);assert.throws(()=>validateLottie({...safe,assets:[{p:"https://bad.test/a"}]}));assert.throws(()=>validateLottie({...safe,layers:[{x:"alert(1)"}]}));assert.throws(()=>validateLottie({...safe,op:10000}));
 validateBackground(MAX_BACKGROUND_BYTES,"video/mp4");assert.throws(()=>validateBackground(MAX_BACKGROUND_BYTES+1,"image/png"));assert.throws(()=>validateBackground(100,"image/svg+xml"));
});

test("018 KaTeX errors retain source and untrusted commands cannot emit links",()=>{assert.match(renderLatex("x^2")!,/katex/);assert.equal(renderLatex(String.raw`\invalidcommand{x}`),null);const unsafe=renderLatex(String.raw`\href{javascript:alert(1)}{click}`);if(unsafe!==null)assert.doesNotMatch(unsafe,/<a[^>]+href=/);});

test("018 inline code is recognized inside styled paragraphs and lists",()=>{
 const doc=parseRichContent({version:2,blocks:[{type:"paragraph",align:"left",content:[{text:"Bold `code`",marks:[{type:"bold"}]}]},{type:"bullet_list",items:[{content:[{text:"`listCode`",marks:[]}]}]}]});
 assert.match(telegramContent(doc).join(""),/<b>Bold <\/b><code>code<\/code>/);assert.match(telegramContent(doc).join(""),/<code>listCode<\/code>/);
});
