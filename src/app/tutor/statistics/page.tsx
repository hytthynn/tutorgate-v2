import { StatisticsPage } from "@/features/statistics/page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <StatisticsPage admin={false} params={await searchParams} />;
}
