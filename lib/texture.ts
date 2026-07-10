import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { putBytes } from "./blob";
import { isSafePublicUrl } from "./safe-url";

// THE TEXTURE PASS (post-render realism) - the other half of the Humaniser.
//
// The Humaniser fixes the KEYFRAME's skin so it reads as a real photograph. But every animator then
// RE-RENDERS that frame and smooths it back out. Measured on real production clips (Laplacian edge energy,
// resolution-matched so downscaling can't explain it):
//   HeyGen a-roll : face detail 2.97 -> 2.26  (-24%)  - it only touches the face, so the frame looks real
//                                                        and the FACE looks plastic. Exactly the complaint.
//   Kling  b-roll : whole frame  3.47 -> 2.25  (-35%)  - it re-renders everything.
// So the Humaniser's work is real, and then it is partly destroyed downstream. No prompt fixes that: it is
// what a diffusion video model does. The fix has to come after the animation, which is also what Shotstack
// themselves advise (they expose only 7 colour filters - boost/contrast/muted/darken/lighten/greyscale/
// negative - and tell you to run ffmpeg BEFORE upload).
//
// WHY UNSHARP AND NOT FILM GRAIN. Grain looked right in isolation but Shotstack RE-ENCODES the final cut,
// and a codec discards noise first. Measured end to end, through a simulated final render:
//   baseline               2.01   (target: the humanised still = 3.47)
//   unsharp only           2.89   12 MB
//   unsharp + grain        5.26   50 MB   <- overshoots into visible noise, triples the file
//   strong unsharp + grain 7.74   77 MB
// Grain buys noise, not skin, and pays for it in bitrate. Micro-contrast is structural, so it survives the
// second encode. Unsharp alone restores the detail AND lands the clip smaller than the original (12 vs 23 MB).
//
// STRENGTH is per-role because the two engines damage differently: b-roll needs more push to reach the
// still's texture, a-roll's face reaches it sooner and rings around hair/glasses if pushed. Both env-tunable;
// TEXTURE_PASS=0 is the global off switch.
const AMOUNT_AROLL = Number(process.env.TEXTURE_UNSHARP_AROLL) || 1.0;
const AMOUNT_BROLL = Number(process.env.TEXTURE_UNSHARP_BROLL) || 1.4;
const CRF = String(Number(process.env.TEXTURE_CRF) || 18);
const TIMEOUT_MS = 240_000;

export function texturePassEnabled(): boolean {
  return process.env.TEXTURE_PASS !== "0" && !!ffmpegPath;
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err = (err + String(d)).slice(-1500); });
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("ffmpeg timed out")); }, TIMEOUT_MS);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-300)}`));
    });
  });
}

// Restore the fine detail the animator smoothed away, and re-host. Returns the NEW clip url, or null on any
// failure - the caller keeps the original clip, so a texture failure can never lose a render or block a stitch.
export async function texturiseClip(url: string, role: string): Promise<string | null> {
  if (!texturePassEnabled() || !isSafePublicUrl(url)) return null;
  const bin = ffmpegPath as string;
  const amount = role === "a-roll" ? AMOUNT_AROLL : AMOUNT_BROLL;
  if (!(amount > 0)) return null;

  let dir = "";
  try {
    // The tracing step copies the binary in without its exec bit on some builds.
    await chmod(bin, 0o755).catch(() => {});
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());

    dir = await mkdtemp(join(tmpdir(), "tex-"));
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "out.mp4");
    await writeFile(inPath, input);

    // Luma-only unsharp (the chroma terms are 0): sharpen skin and hair, never colour edges.
    await run(bin, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inPath,
      "-vf", `unsharp=5:5:${amount}:5:5:0`,
      "-c:v", "libx264", "-crf", CRF, "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-c:a", "copy", // a-roll carries HeyGen's audio; the stitch mutes it, but never drop a stream here
      "-movflags", "+faststart",
      outPath,
    ]);

    const out = await readFile(outPath);
    if (!out.length) return null;
    return await putBytes(out, "clips", "mp4", "video/mp4");
  } catch {
    return null; // fail open - keep the original clip
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
