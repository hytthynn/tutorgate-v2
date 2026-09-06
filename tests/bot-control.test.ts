import test from "node:test";
import assert from "node:assert/strict";
import { updateControlMessage, type ControlPorts } from "../src/features/chats/control-message";
import { editResult } from "../src/lib/telegram/edit-result";
import { html } from "../src/lib/telegram/templates";

function fixture() {
  let id: number | null = null, locked = false;
  const sent: string[] = [], edited: number[] = [];
  const ports: ControlPorts = {
    claim: async () => { if (locked) return null; locked = true; return { claimId: "lease", messageId: id }; },
    edit: async (_, messageId) => { edited.push(messageId); return true; },
    send: async (_, message) => { sent.push(message.text); return 42; },
    finish: async (_, __, messageId) => { id = messageId ?? id; locked = false; },
  };
  return { ports, sent, edited };
}
test("bot controls create once then edit the persisted ID through all menu states", async () => {
  const f = fixture();
  for (const text of ["Start", "Picker", "Next page", "Recipient", "Sent", "Cancel", "Cancel"])
    await updateControlMessage("1", html(text), f.ports);
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.edited, [42,42,42,42,42,42]);
});
test("deleted control is replaced once; temporary edit errors never send a replacement", async () => {
  const f = fixture();
  await updateControlMessage("1", html("Start"), f.ports);
  f.ports.edit = async () => { throw Error("timeout"); };
  await assert.rejects(updateControlMessage("1", html("Next"), f.ports));
  assert.equal(f.sent.length, 1);
  f.ports.edit = async () => false;
  await updateControlMessage("1", html("Next"), f.ports);
  assert.equal(f.sent.length, 2);
});
test("concurrent claim cannot create a second panel; audit failure does not resend", async () => {
  const f = fixture();
  await f.ports.claim("1");
  await assert.rejects(updateControlMessage("1", html("Next"), f.ports), /busy/);
  assert.equal(f.sent.length, 0);
  const g = fixture();
  g.ports.finish = async () => { throw Error("DB down"); };
  await assert.rejects(updateControlMessage("1", html("Start"), g.ports));
  await assert.rejects(updateControlMessage("1", html("Retry"), g.ports));
  assert.equal(g.sent.length, 1);
});
test("Telegram identical edits succeed; only a deleted message permits replacement", () => {
  assert.equal(editResult(200, {ok:true}), "edited");
  assert.equal(editResult(400, {ok:false,description:"Bad Request: message is not modified"}), "edited");
  assert.equal(editResult(400, {ok:false,description:"Bad Request: message to edit not found"}), "missing");
  for (const status of [400,403,429,500])
    assert.equal(editResult(status, {ok:false,description:"Some failure"}), "error");
});
