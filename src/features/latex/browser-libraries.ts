/** Only macro definitions, never arbitrary TeX package programs. */
export function libraryCommands(source:string):string{
 const text=source.replace(/(?<!\\)%[^\n]*/g,"").replace(/\\ProvidesPackage\{[\w-]+\}(?:\[[^\]]*\])?/g,"").trim();
 let cursor=0;const commands:string[]=[];
 while(cursor<text.length){while(/\s/.test(text[cursor]??"")&&cursor<text.length)cursor++;if(cursor===text.length)break;
  const match=text.slice(cursor).match(/^\\(?:newcommand|renewcommand|providecommand)\*?\s*\{\\[A-Za-z]+\}\s*(?:\[[0-9]\]\s*)?\{/);
  if(!match)throw new Error("Библиотека может содержать только определения newcommand, renewcommand и providecommand.");
  const start=cursor;cursor+=match[0].length;let depth=1;
  while(cursor<text.length&&depth){if(text[cursor]==="\\"){cursor+=2;continue;}if(text[cursor]==="{")depth++;if(text[cursor]==="}")depth--;cursor++;}
  if(depth)throw new Error("Незакрытое определение команды.");commands.push(text.slice(start,cursor));
 }
 return commands.join("\n");
}
