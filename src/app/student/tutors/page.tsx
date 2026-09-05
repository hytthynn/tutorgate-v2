import { PeoplePage } from "@/features/people/page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string; tutor?: string }>;
}) {
  return (
    <PeoplePage
      role="student"
      kind="tutors"
      searchParams={await searchParams}
    />
  );
}
