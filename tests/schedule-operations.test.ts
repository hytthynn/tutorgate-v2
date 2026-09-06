import test from "node:test";
import assert from "node:assert/strict";
import { applyAvailability, conflictClass, isMultiSelectable, isTransferAllowed, overlapLanes, placeGroup, shiftGroup } from "../src/features/schedule/operations";
import type { ScheduleLesson } from "../src/features/schedule/types";
import { confirmHistory, inverseEntry, replaceTemporaryLessons } from "../src/features/schedule/history";
import type { HistoryEntry } from "../src/features/schedule/types";
const lesson:ScheduleLesson={id:"a",tutorId:"t",studentId:"s",studentName:"S",tutorName:"T",subjectId:null,subjectName:"Math",startsAt:"2026-09-07T07:00:00Z",endsAt:"2026-09-07T08:00:00Z",durationMinutes:60,color:"default",completed:false};
test("conflict classes and selection keep gray active and coral individually editable",()=>{
  assert.equal(conflictClass({...lesson,color:"gray"}),"normal");
  assert.equal(conflictClass({...lesson,color:"coral"}),"coral");
  assert.equal(conflictClass({...lesson,inactiveReason:"transferred"}),null);
  assert.equal(isMultiSelectable({...lesson,color:"coral"}),false);
  assert.equal(isMultiSelectable({...lesson,inactiveReason:"available_from"}),false);
  assert.equal(isTransferAllowed({...lesson,isTransferTarget:true}),false);
});
test("group placement preserves offsets and chooses later common delta on tie",()=>{
  const b={...lesson,id:"b",startsAt:"2026-09-07T09:00:00Z",endsAt:"2026-09-07T10:00:00Z"};
  const placed=placeGroup([lesson,b],"2026-09-07T07:30:00Z",[{...lesson,id:"busy"}],0)!;
  assert.equal(placed[0].startsAt,"2026-09-07T08:00:00.000Z");
  assert.equal(Date.parse(placed[1].startsAt)-Date.parse(placed[0].startsAt),120*60000);
  assert.equal(shiftGroup([lesson,b],"2026-09-08T07:00:00Z")[1].startsAt,"2026-09-08T09:00:00.000Z");
  assert.equal(placeGroup([lesson],lesson.startsAt,[{...lesson,id:"coral",color:"coral"}],0)![0].startsAt,"2026-09-07T07:00:00.000Z");
});
test("availability date is inclusive and never reactivates transferred sources",()=>{
  assert.equal(applyAvailability([lesson],[{studentId:"s",availableFrom:"2026-09-07"}],0)[0].inactiveReason,null);
  assert.equal(applyAvailability([lesson],[{studentId:"s",availableFrom:"2026-09-08"}],0)[0].inactiveReason,"available_from");
  assert.equal(applyAvailability([{...lesson,inactiveReason:"transferred"}],[],0)[0].inactiveReason,"transferred");
});
test("overlap lanes expose every card including connected overlap chains",()=>{
  const rows=overlapLanes([{lesson,segment:{startMinute:0,endMinute:60}},{lesson:{...lesson,id:"b"},segment:{startMinute:30,endMinute:90}},{lesson:{...lesson,id:"c"},segment:{startMinute:60,endMinute:120}}]);
  assert.deepEqual(rows.map(r=>[r.lane,r.lanes]),[[0,2],[1,2],[0,2]]);
});
test("confirmed undo/redo stacks invert canonical snapshots; a new action clears redo",()=>{
  const entry:HistoryEntry={before:{payload:{version:0},signature:"before"},after:{payload:{version:1},signature:"after"},previous:[],next:[lesson],oldRules:[],newRules:[],oldOffset:0,newOffset:1};
  const committed=confirmHistory({undo:[],redo:[]},entry,"commit");
  const undone=confirmHistory(committed,inverseEntry(entry),"undo");
  assert.equal(undone.undo.length,0);assert.deepEqual(undone.redo,[entry]);
  assert.deepEqual(confirmHistory(undone,entry,"redo"),committed);
  assert.equal(confirmHistory(undone,entry,"commit").redo.length,0);
});
test("temporary IDs are removed and canonical fields win",()=>{
  const canonical={...lesson,startsAt:"2026-09-07T09:00:00Z"};
  assert.deepEqual(replaceTemporaryLessons([{...lesson,id:"temp-new"},lesson],[canonical]),[canonical]);
});
