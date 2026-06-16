import { redirect } from "next/navigation";

// Cost Intelligence was renamed Cost Control and moved to a top-level route.
export default function LegacyCostsRedirect() {
  redirect("/cost-control");
}
