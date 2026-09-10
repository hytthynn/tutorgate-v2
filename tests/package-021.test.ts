import test from "node:test";
import assert from "node:assert/strict";
import {asymptoteToSvg} from "../src/features/latex/simple-asymptote";
import {libraryCommands} from "../src/features/latex/browser-libraries";
test("021 Asymptote draws actual 2D geometry and escapes labels",()=>{
 const svg=asymptoteToSvg('size(250); pair A=(0,0), B=(2,1); draw(A--B,red+Arrow); draw(circle((1,0),0.5)); label("<script>Привет</script>",(1,2));');
 assert.ok(svg.includes('M0,0 L2,1'));assert.ok(svg.includes('cx="1" cy="0" r="0.5"'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
 assert.ok(asymptoteToSvg('real r=sqrt(4);draw(circle((0,0),r));').includes('r="2"'));
});
test("021 unknown Asymptote syntax, nonfinite coordinates, loops and JS are explicit errors",()=>{
 for(const source of ['while(true){}','import graph;draw(unitsquare);','draw(circle((0,0),-1));','draw((0,0)--(1/0,2));','draw((0,0)..(1,1));','eval("alert(1)");','draw(unitsquare,unknown);','label("$x$",(0,0));'])assert.throws(()=>asymptoteToSvg(source),source);
 assert.throws(()=>asymptoteToSvg('draw(unitsquare);'.repeat(301)));
});
test("021 browser macro libraries reject executable package code",()=>{
 assert.equal(libraryCommands(String.raw`\ProvidesPackage{custom}
% comment
\newcommand{\R}{\mathbb{R}}`),String.raw`\newcommand{\R}{\mathbb{R}}`);
 for(const source of [String.raw`\input{secret}`,String.raw`\usepackage{foo}`,String.raw`\loop\iftrue\repeat`,String.raw`\newcommand{\R}{oops`])assert.throws(()=>libraryCommands(source));
});
