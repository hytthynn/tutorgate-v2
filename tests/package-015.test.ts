import test from "node:test";
import assert from "node:assert/strict";
import { validateAttachmentTotal, MAX_ATTACHMENT_BYTES } from "../src/features/chats/attachments";
import { linkedContent, plainContent, spliceContent } from "../src/features/chats/rich-text";
import { sentReceipt } from "../src/lib/telegram/templates";
test("015 combined attachment budget includes every file",()=>{
 validateAttachmentTotal([{size:MAX_ATTACHMENT_BYTES/2},{size:MAX_ATTACHMENT_BYTES/2}]);
 assert.throws(()=>validateAttachmentTotal([{size:6*1024*1024},{size:5*1024*1024}]),/10 МБ/);
});
test("015 consecutive typing merges identical formatting without losing the boundary",()=>{
 const content=spliceContent([{text:"С",marks:[{type:"bold"}]}],1,1,[{text:"разу",marks:[{type:"bold"}]}]);
 assert.deepEqual(content,[{text:"Сразу",marks:[{type:"bold"}]}]);
 assert.equal(spliceContent(content,5,5,[{text:"!",marks:[]}]).length,2);
});
test("015 plain links are clickable, punctuation and code remain unchanged",()=>{
 const content=linkedContent(plainContent("Сайт https://example.com/a, и www.example.org."));
 assert.equal(content.map(run=>run.text).join(""),"Сайт https://example.com/a, и www.example.org.");
 assert.deepEqual(content.flatMap(run=>run.marks.map(mark=>mark.href)),["https://example.com/a","https://www.example.org"]);
 assert.equal(linkedContent([{text:"https://example.com",marks:[{type:"code"}]}])[0].marks[0].type,"code");
 assert.equal(linkedContent(plainContent("javascript:alert(1)")).flatMap(run=>run.marks).length,0);
});
test("015 reply receipts preserve both sides, escape HTML and fit Bot API limit",()=>{
 const receipt=sentReceipt("teacher","Teacher","<answer>","<original>");
 assert.match(receipt.text,/&lt;original&gt;/);assert.match(receipt.text,/&lt;answer&gt;/);
 assert.ok(sentReceipt("teacher","Teacher","<&>".repeat(2000),"<&>".repeat(2000)).text.length<=4096);
 assert.match(JSON.stringify(receipt.options),/chat:to:teacher/);
});
