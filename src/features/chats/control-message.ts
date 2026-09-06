import type { TelegramMessage } from "@/lib/telegram/templates";

export type ControlClaim = { claimId: string; messageId: number | null };
export type ControlPorts = {
  claim: (chat: string) => Promise<ControlClaim | null>;
  edit: (chat: string, id: number, message: TelegramMessage) => Promise<boolean>;
  send: (chat: string, message: TelegramMessage) => Promise<number>;
  finish: (chat: string, claim: string, messageId: number | null) => Promise<void>;
};

/** Only the persisted control message can be edited; callback/reply IDs are never targets. */
export async function updateControlMessage(chat: string, message: TelegramMessage, ports: ControlPorts) {
  const claim = await ports.claim(chat);
  if (!claim) throw new Error("Telegram control busy");
  let delivered = false;
  try {
    let id = claim.messageId;
    if (id === null || !(await ports.edit(chat, id, message))) {
      id = await ports.send(chat, message);
    }
    delivered = true;
    await ports.finish(chat, claim.claimId, id);
  } catch (error) {
    // A transient edit error must not create another message. After delivery,
    // preserve the lease on an ambiguous DB failure instead of immediately resending.
    if (!delivered) {
      try { await ports.finish(chat, claim.claimId, null); } catch { /* lease expires */ }
    }
    throw error;
  }
}
