import { notFound, redirect } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";

export const dynamic = "force-dynamic";

// Voice + talking video now live inside the Producer flow (step 4). This standalone page is retired;
// redirect any old bookmark to the Producer so there's one source of truth (no stale persona.aroll path).
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  redirect(`/setup/influencers/${id}/producer`);
}
