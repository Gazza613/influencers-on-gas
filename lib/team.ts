// THE TEAM (Gary): the thirteen people behind the platform, in Gary's order, with the card artwork in /public/team.
// One list, used by the landing-page cascade and anywhere else the team is shown, so the order and the roles can
// never drift between surfaces. The cards carry the name and role in the artwork; these fields are for alt text,
// links and any text rendering.
export type TeamMember = { slug: string; name: string; role: string };

export const TEAM: TeamMember[] = [
  { slug: "sam-michel", name: "Sam Michel", role: "Chief Executive Officer" },
  { slug: "gary-berman", name: "Gary Berman", role: "Managing Director" },
  { slug: "donovan-pretorius", name: "Donovan Pretorius", role: "Chief Growth Officer" },
  { slug: "busi-mntungwa", name: "Busi Mntungwa", role: "Account Director" },
  { slug: "claire-chrystal", name: "Claire Chrystal", role: "Senior Account Manager" },
  { slug: "aphelele-madlala", name: "Aphelele Madlala", role: "Junior Account Manager" },
  { slug: "angelique-greffrath", name: "Angelique Greffrath", role: "Operations Manager" },
  { slug: "nomsa-ntlemeza", name: "Nomsa Ntlemeza", role: "Traffic Manager" },
  { slug: "georgia-berman", name: "Georgia Berman", role: "AI Creative Engineer" },
  { slug: "rourke-paslovsky", name: "Rourke Paslovsky", role: "AI Systems Engineer" },
  { slug: "aidan-thompson", name: "Aidan Thompson", role: "Digital Designer" },
  { slug: "sune-vd-nest", name: "Suné vd Nest", role: "Junior Web Developer" },
  { slug: "cherice-len", name: "Cherice Len", role: "Accountant" },
];

// Where a team card clicks through to (quietly): the agency's About page.
export const TEAM_ABOUT_URL = "https://www.gasmarketing.co.za/about-gas";
