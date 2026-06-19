// The "production crew", each build step is fronted by a named AI specialist so the
// journey feels like collaborating with a real studio team, not waiting on a spinner.
// Purely cosmetic identity + flex copy; the actual work is done by the pipeline.

export type CrewMember = {
  emoji: string;
  name: string;
  role: string;
  // First-person line shown the instant a step kicks off, to build anticipation.
  greeting: string;
};

export const CREW: Record<string, CrewMember> = {
  casting: {
    emoji: "🎬",
    name: "Zara",
    role: "Casting Director",
    greeting: "I'm reading your character brief and auditioning faces now.",
  },
  photoshoot: {
    emoji: "📸",
    name: "Kofi",
    role: "Lead Photographer",
    greeting: "On set. I'll shoot every angle so the camera never loses them.",
  },
  lockdown: {
    emoji: "🧬",
    name: "Neo",
    role: "Identity Engineer",
    greeting: "I'm training a dedicated model on this exact face, locking it forever.",
  },
  creatives: {
    emoji: "✨",
    name: "Lebo",
    role: "Art Director",
    greeting: "Let's make scroll-stopping shots. Same face, every format.",
  },
  producer: {
    emoji: "🎬",
    name: "Kiara",
    role: "Producer",
    greeting: "I'll direct the whole ad with you, shot by shot, then we shoot and cut it.",
  },
};
