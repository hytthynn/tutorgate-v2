import {notFound} from "next/navigation";
import Link from "next/link";
import {AdminChatView} from "@/components/chats/admin-chat-view";
import {adminChatSnapshot} from "./admin-actions";
import { requireRole } from "@/lib/auth/access";
import { chatSnapshotAction } from "@/features/chats/actions";
import { ChatView } from "@/components/chats/chat-view";
import { PageHeading } from "@/components/shared/page-heading";
import { z } from "zod";
export async function ChatsPage({
  role,
  searchParams,
}: {
  role: "tutor" | "admin";
  searchParams: Promise<{ student?: string; tutor?:string }>;
}) {
  await requireRole(role);
  const { student,tutor } = await searchParams;
  const selected =
    student && z.uuid().safeParse(student).success ? student : null;
  if(tutor!==undefined){if(role!=="admin"||!z.uuid().safeParse(tutor).success)notFound();let result=await adminChatSnapshot(tutor,selected);if(!result.data)notFound();const target=selected??result.data.conversations[0]?.studentId??null;if(target!==selected){result=await adminChatSnapshot(tutor,target);if(!result.data)notFound();}return <><PageHeading title="Чаты репетитора" description={result.data.ownerName} actions={<Link className="button button-secondary" href="/admin/tutors">К репетиторам</Link>}/><AdminChatView key={tutor} owner={tutor} initial={result.data} student={target}/></>;}
  const result = await chatSnapshotAction(selected);
  return (
    <>
      <PageHeading
        title="Чаты"
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
