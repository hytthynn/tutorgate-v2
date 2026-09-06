export type ChatMessage = {
  id: string;
  sender_role: "student" | "tutor";
  body: string;
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
  conversations: ChatConversation[];
  messages: ChatMessage[];
  hasMore: boolean;
  totalUnread: number;
};
export type ChatResult<T> =
  { data: T; error?: never } | { error: string; data?: never };
