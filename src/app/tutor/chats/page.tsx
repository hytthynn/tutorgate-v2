import { ChatsPage } from "@/features/chats/page";
export default function Page(props: { searchParams: Promise<{ student?: string }> }) { return <ChatsPage role="tutor" {...props} />; }
