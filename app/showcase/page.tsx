import AppHeader from "@/components/AppHeader";
import ShowcaseManager from "@/components/ShowcaseManager";
import { getShowcaseSlug, listFinishedVideos } from "@/lib/showcase";

export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  const videos = await listFinishedVideos();
  const token = getShowcaseSlug(); // clean shareable link, e.g. /s/showreel
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="flex-1 overflow-auto p-5">
        <ShowcaseManager token={token} initial={videos} />
      </main>
    </div>
  );
}
