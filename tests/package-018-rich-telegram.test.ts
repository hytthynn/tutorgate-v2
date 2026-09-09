import test from "node:test";
import assert from "node:assert/strict";
import { telegramRichMessage } from "../src/features/chats/telegram-rich";
import { plainContent } from "../src/features/chats/rich-text";
test("018 Telegram native math uses structured entities and keeps code literal",()=>{
 const result=telegramRichMessage({version:2,blocks:[{type:"paragraph",align:"left",content:plainContent(String.raw`$x^2$ и \(y\)`)},{type:"paragraph",align:"left",content:plainContent(String.raw`\[z^2\]`)},{type:"paragraph",align:"left",content:[{text:"$literal$",marks:[{type:"code"}]}]},{type:"code_block",language:"js",text:"\tconst x = '$literal$';\n"}]},"<Teacher>")!;
 assert.equal(result.blocks[0].text&&typeof result.blocks[0].text,"object");
 assert.equal((JSON.stringify(result).match(/mathematical_expression/g)??[]).length,3);
 assert.deepEqual(result.blocks[2],{type:"mathematical_expression",expression:"z^2"});
 assert.deepEqual(result.blocks.at(-1),{type:"pre",language:"js",text:"\tconst x = '$literal$';\n"});
 assert.ok(JSON.stringify(result).includes("<Teacher>"));
});
test("018 Telegram alignment and styles remain native data without HTML interpolation",()=>{
 const result=telegramRichMessage({version:2,blocks:[{type:"paragraph",align:"center",content:[{text:"Center",marks:[{type:"bold"}]}]},{type:"paragraph",align:"right",content:plainContent("<img src=x>")},{type:"bullet_list",items:[{content:plainContent("Item")}]}]},"Tutor")!;
 assert.equal(result.blocks[1].cells?.[0][0].align,"center");assert.equal(result.blocks[2].cells?.[0][0].align,"right");assert.equal(result.blocks[3].type,"list");
 assert.match(JSON.stringify(result.blocks[1]),/"type":"bold"/);
});
test("018 Telegram simple messages retain the established delivery path; malformed math falls back",()=>{
 assert.equal(telegramRichMessage(plainContent("Plain text"),"Tutor"),null);
 assert.equal(telegramRichMessage([{text:"$code$",marks:[{type:"code"}]}],"Tutor"),null);
 const result=telegramRichMessage(plainContent(String.raw`$\notARealCommand{x}$`),"Tutor")!;
 assert.doesNotMatch(JSON.stringify(result),/mathematical_expression/);
});
