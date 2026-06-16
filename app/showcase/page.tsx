import AppHeader from "@/components/AppHeader";
import ShowcaseManager from "@/components/ShowcaseManager";
import { getShowcaseToken, listFinishedVideos } from "@/lib/showcase";

export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  const [token, videos] = await Promise.all([getShowcaseToken(), listFinishedVideos()]);
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="flex-1 overflow-auto p-5">
        <ShowcaseManager token={token} initial={videos} />
      </main>
    </div>
  );
}
