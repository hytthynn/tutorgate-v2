import test from "node:test";
import assert from "node:assert/strict";
import {latexConfigSchema,defaultLatexConfig} from "../src/features/latex/config";
import {renderableBlocks} from "../src/features/latex/blocks";
import type {RichBlock} from "../src/features/chats/rich-text";
const paragraph=(text:string):RichBlock=>({type:"paragraph",align:"left",content:[{text,marks:[]}]});
test("020 complete Asymptote environments span paragraphs; incomplete code is preserved",()=>{
 const blocks=[paragraph("Before"),paragraph(String.raw`\begin{asy}`),paragraph("draw(unitsquare);"),paragraph(String.raw`\end{asy}`),paragraph("After")];
 const result=renderableBlocks(blocks);assert.equal(result.length,3);assert.deepEqual(result[1],{source:"\\begin{asy}\ndraw(unitsquare);\n\\end{asy}",mode:"document"});
 assert.deepEqual(renderableBlocks(blocks.slice(0,3)),blocks.slice(0,3));
 assert.deepEqual(renderableBlocks([{type:"code_block",language:"asy",text:"draw(unitsquare);"}]),[{source:"draw(unitsquare);",mode:"asy"}]);
 assert.equal(renderableBlocks([{type:"code_block",language:"javascript",text:"alert(1)"}])[0].hasOwnProperty("type"),true);
});
test("020 custom packages and library names reject path traversal, duplicates and oversized source",()=>{
 assert.equal(latexConfigSchema.safeParse(defaultLatexConfig).success,true);
 for(const name of ["../secret.sty","/etc/passwd","a\\b.sty","x.sty;whoami","a.tex"])
 assert.equal(latexConfigSchema.safeParse({...defaultLatexConfig,libraries:[{name,source:""}]}).success,false);
 assert.equal(latexConfigSchema.safeParse({...defaultLatexConfig,packages:["x}\\input{secret"]}).success,false);
 assert.equal(latexConfigSchema.safeParse({...defaultLatexConfig,libraries:[{name:"mine.sty",source:""},{name:"mine.sty",source:""}]}).success,false);
 assert.equal(latexConfigSchema.safeParse({...defaultLatexConfig,preamble:"x".repeat(16001)}).success,false);
});
