import { TokenPage } from "@/components/shared/token-page";
export const metadata = { title: "Новый пароль" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <TokenPage token={(await searchParams).token ?? ""} kind="reset" />;
}
