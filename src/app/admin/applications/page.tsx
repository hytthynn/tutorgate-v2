import { AdminApplicationsPage } from "@/features/applications/admin-page";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
 return <AdminApplicationsPage params={await searchParams} />;
}
