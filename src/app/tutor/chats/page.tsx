import { requireRole } from "@/lib/auth/access";
import { chatSnapshotAction } from "@/features/chats/actions";
import { ChatView } from "@/components/chats/chat-view";
import { PageHeading } from "@/components/shared/page-heading";
import { z } from "zod";
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requireRole("tutor");
  const { student } = await searchParams;
  const selected =
    student && z.uuid().safeParse(student).success ? student : null;
  const result = await chatSnapshotAction(selected);
  return (
    <>
      <PageHeading
        title="Чаты"
        description="Переписка с учениками через Telegram."
      />
      <ChatView
        initial={
          result.data ?? {
            conversations: [],
            messages: [],
            hasMore: false,
            totalUnread: 0,
          }
        }
        initialError={result.error}
        initialStudent={selected}
      />
    </>
  );
}
