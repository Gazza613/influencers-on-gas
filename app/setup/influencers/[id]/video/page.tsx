import { notFound, redirect } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";

export const dynamic = "force-dynamic";

// Voice now leads the video flow as its own Script & Voice stage. This retired standalone page redirects any
// old bookmark to Script & Voice (the entry to the video-making flow), one source of truth.
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  redirect(`/setup/influencers/${id}/voice`);
}
