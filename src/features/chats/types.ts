import type { RichContent } from "./rich-text";
export type ChatAttachment = { id: string; original_name: string; mime_type: string; size_bytes: number; kind: "image" | "file" };
export type ChatMessage = {
  id: string;
  sender_role: "student" | "tutor";
  body: string;
  content?: RichContent;
  attachments?: ChatAttachment[];
  delivery_status: "pending" | "sent" | "failed";
  created_at: string;
};
export type ChatConversation = {
  studentId: string;
  studentName: string;
  conversationId: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
};
export type ChatSnapshot = {
  cursor?: string;
  directoryVersion?: string;
  conversations: ChatConversation[];
  messages: ChatMessage[];
  hasMore: boolean;
  totalUnread: number;
};
export type ChatResult<T> =
  { data: T; error?: never } | { error: string; data?: never };
