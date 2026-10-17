import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const bds=path.join(here,'../../main/bds-assets/bds');
const SOURCE=fs.readFileSync(path.join(bds,'sd-mission-control.js'),'utf8');
const CSS=fs.readFileSync(path.join(bds,'sd-mission-control.css'),'utf8');
test('Mission Control has no executable or HTML injection sink',()=>{
 assert.doesNotThrow(()=>new Function(SOURCE));
 assert.doesNotMatch(SOURCE,/\beval\s*\(/);
 assert.doesNotMatch(SOURCE,/\bnew\s+Function\s*\(/);
 assert.doesNotMatch(SOURCE,/\.innerHTML\s*=/);
 assert.match(SOURCE,/textContent/);assert.match(SOURCE,/getSnapshot/);assert.match(SOURCE,/sd:agent-state/);
});
test('Mission Control formats durations and reports real agent state',()=>{
 const document={body:null,documentElement:{lang:'en'},visibilityState:'visible',createElement:()=>({}),addEventListener(){}};
 const window={document,navigator:{language:'en'},__sdEngine:{locale:()=> 'en'},__sdAgent:{getSnapshot:()=>({active:false,pending:0,stopped:false,mode:'auto',supported:true,activities:[]})},addEventListener(){},setInterval(){return 1;}};
 window.window=window;
 const ctx=vm.createContext({window,document,console,CustomEvent:function(){},Date,JSON,Math,String,Number,Array,Object});
 vm.runInContext(SOURCE,ctx,{filename:'sd-mission-control.js'});
 const api=window.__sdMissionControl;
 assert.equal(api.version,1);assert.equal(api._formatDuration(42),'42 ms');assert.equal(api._formatDuration(1250),'1.3 s');
 assert.equal(api._formatDuration(61000),'1m 1s');assert.equal(api._statusLabel({stopped:true,active:false}),'Stopped');
 assert.equal(api._statusLabel({active:true,pending:1}),'Running');assert.equal(api._statusLabel({active:false,activities:[]}),'Ready when you are');
});
test('Mission Control styles account for phone safe areas and reduced motion',()=>{
 assert.match(CSS,/max-width:400px/);assert.match(CSS,/prefers-reduced-motion:reduce/);assert.match(CSS,/safe-area-inset-bottom/);assert.match(CSS,/focus-visible/);
});
