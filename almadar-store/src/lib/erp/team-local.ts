import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listUsers } from "@/lib/erp/auth-system";
import type { TeamActor, TeamContact, TeamConversation, TeamCursor, TeamMessage } from "@/lib/erp/team-types";

const STORE_PATH = path.join(process.cwd(), "data", "team-messages.json");

function readMessages(): TeamMessage[] {
  let raw: string;
  try {
    raw = fs.readFileSync(STORE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isMessage)) {
    throw new Error("تنسيق ملف الرسائل غير صالح؛ لم يتم تعديله.");
  }
  return parsed;
}

function isMessage(value: unknown): value is TeamMessage {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return ["id", "senderId", "senderName", "recipientId", "recipientName", "body", "createdAt"]
    .every((key) => typeof entry[key] === "string")
    && (entry.readAt === null || typeof entry.readAt === "string");
}

function writeMessages(messages: TeamMessage[]) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const temp = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(messages, null, 2), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temp, STORE_PATH);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function localTeamContacts(): TeamContact[] {
  return listUsers().filter((user) => user.active).map(({ id, fullName, username, department, title }) => ({
    id, fullName, username, department, title,
  }));
}

export function localTeamMessages(actor: TeamActor, all: boolean, inbox = false): TeamMessage[] {
  if (all && actor.role !== "super_admin") throw new Error("forbidden");
  return readMessages().filter((message) =>
    inbox ? message.recipientId === actor.id && message.readAt === null
      : all || message.senderId === actor.id || message.recipientId === actor.id
  ).slice(-200).reverse();
}

export function localUnreadCount(actor: TeamActor): number {
  return readMessages().filter((message) => message.recipientId === actor.id && message.readAt === null).length;
}

export function localTeamConversations(actor: TeamActor): TeamConversation[] {
  const conversations = new Map<string, TeamConversation>();
  const messages = readMessages().filter((message) => message.senderId === actor.id || message.recipientId === actor.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const message of messages) {
    const incoming = message.recipientId === actor.id;
    const contactId = incoming ? message.senderId : message.recipientId;
    let conversation = conversations.get(contactId);
    if (!conversation) {
      conversation = {
        contactId, contactName: incoming ? message.senderName : message.recipientName,
        lastBody: message.body, lastAt: message.createdAt, lastSenderId: message.senderId, unreadCount: 0,
      };
      conversations.set(contactId, conversation);
    }
    if (incoming && !message.readAt) conversation.unreadCount += 1;
  }
  return [...conversations.values()];
}

export function localConversationMessages(actor: TeamActor, contactId: string, before?: TeamCursor): TeamMessage[] {
  return readMessages().filter((message) => {
    const participant = (message.senderId === actor.id && message.recipientId === contactId) ||
      (message.recipientId === actor.id && message.senderId === contactId);
    return participant && (!before || message.createdAt < before.createdAt ||
      (message.createdAt === before.createdAt && message.id < before.id));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 50);
}

export function markLocalConversationRead(actor: TeamActor, contactId: string, ids: string[]): void {
  const messages = readMessages();
  const now = new Date().toISOString();
  const selectedIds = new Set(ids);
  let changed = false;
  for (const message of messages) {
    if (selectedIds.has(message.id) && message.recipientId === actor.id && message.senderId === contactId && message.readAt === null) {
      message.readAt = now;
      changed = true;
    }
  }
  if (changed) writeMessages(messages);
}

export function sendLocalTeamMessage(actor: TeamActor, recipientId: string, body: string): TeamMessage {
  const recipient = localTeamContacts().find((contact) => contact.id === recipientId);
  if (!recipient || recipient.id === actor.id) throw new Error("recipient_unavailable");
  const message: TeamMessage = {
    id: crypto.randomUUID(),
    senderId: actor.id,
    senderName: actor.fullName,
    recipientId: recipient.id,
    recipientName: recipient.fullName,
    body,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  const messages = readMessages();
  messages.push(message);
  writeMessages(messages);
  return message;
}

export function markLocalTeamMessageRead(actor: TeamActor, id: string): boolean {
  const messages = readMessages();
  const message = messages.find((entry) => entry.id === id && entry.recipientId === actor.id);
  if (!message) return false;
  if (message.readAt === null) {
    message.readAt = new Date().toISOString();
    writeMessages(messages);
  }
  return true;
}
