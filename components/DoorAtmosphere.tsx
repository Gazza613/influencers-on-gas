// THE DOOR ATMOSPHERE (Gary): the one background system shared by the landing page and the login page, so the
// click-through from one to the other feels like a single product. The ground is the same warm near-black as the
// team card artwork (so the cards dissolve into the page), lit by a quiet ember rising from the foot and a soft
// halo behind the mark, over a fine linen weave and a film grain that stop the big dark field from banding.
// Pure markup + the .door-* classes in globals.css; safe to render from a server component.
export default function DoorAtmosphere() {
  return (
    <>
      <div className="door-atmos" aria-hidden>
        <div className="door-orb door-orb-a" />
        <div className="door-orb door-orb-b" />
        <div className="door-orb door-orb-c" />
        <div className="door-orb door-orb-d" />
        <div className="door-ember" />
        <div className="door-halo" />
        <div className="door-dots" />
        <div className="door-linen" />
        <div className="door-grain" />
      </div>
      <div className="door-vignette" aria-hidden />
    </>
  );
}
