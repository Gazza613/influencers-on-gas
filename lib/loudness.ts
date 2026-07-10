import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

// LOUDNESS (EBU R128 / ITU-R BS.1770) for the three-layer mix: voiceover, music bed, ambient.
//
// THE BUG THIS FIXES. Shotstack's `volume` is a LINEAR MULTIPLIER on whatever the clip already is. We were
// applying fixed multipliers (music 0.18, ambient 0.16) to ElevenLabs stems whose ABSOLUTE loudness varies
// wildly per generation. Measured on a real production (Dave):
//     voiceover  -22.2 LUFS  x 1.00  ->  -22.2 LUFS
//     music      -18.8 LUFS  x 0.18  ->  -33.7 LUFS   (11.5 dB under VO - defensible)
//     ambient    -47.8 LUFS  x 0.16  ->  -63.7 LUFS   (40 dB under VO - inaudible)
// The ambient stem left ElevenLabs 29 dB quieter than the music. It was never a slider problem: the mix is
// unrepeatable by construction, because 0.18 means something different on every render. Worse, ambient could
// not be rescued at the mixer at all - Shotstack caps volume at 1.0, so a -47.8 LUFS stem can never reach its
// target. The gain has to be baked into the file.
//
// TARGETS (see the research): VO is the anchor element (ATSC A/85 anchors loudness to dialogue). Music sits
// 12-18 dB under speech, ambient 18-26 dB under. We normalise both BEDS to the same -16 LUFS reference here,
// then the mixer applies the dB offset from the measured VO - so the offsets are honest whatever ElevenLabs
// hands us. True peak is held at -2 dBTP: every platform re-encodes to lossy AAC/Opus, where inter-sample
// peaks can overshoot a 0 dBFS file by 1-2 dB and clip (Netflix mandate -2 dBTP for the same reason).
//
// WHY A STATIC GAIN AND NOT ffmpeg's `loudnorm`. loudnorm in single-pass mode is a DYNAMIC normaliser: it
// rides the gain and squashes transients. Transients are exactly what makes a bed read as "present" rather
// than "nothing" at the same RMS - a sustained pad sits under the masking curve, a track with rhythmic
// transients pokes through between words. So: measure once, apply one constant gain, and catch the peaks
// with a limiter. Dynamics preserved.
export const VO_REFERENCE_LUFS = -16; // the anchor we aim the voice at
export const BED_REFERENCE_LUFS = -16; // beds normalised to the SAME reference, then offset at the mixer
export const MUSIC_UNDER_VO_DB = Number(process.env.MUSIC_UNDER_VO_DB) || -14; // within the 12-18 dB band
export const AMBIENT_UNDER_VO_DB = Number(process.env.AMBIENT_UNDER_VO_DB) || -20; // within the 18-26 dB band
const TRUE_PEAK_DB = -2;
const TIMEOUT_MS = 120_000;

function bin(): string | null {
  return (ffmpegPath as string | null) || null;
}

function exec(args: string[]): Promise<string> {
  const b = bin();
  if (!b) return Promise.reject(new Error("ffmpeg unavailable"));
  return new Promise((resolve, reject) => {
    const p = spawn(b, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); if (err.length > 40_000) err = err.slice(-20_000); });
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("ffmpeg timed out")); }, TIMEOUT_MS);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      // ebur128 reports on stderr and still exits 0; a real failure is a non-zero code.
      if (code === 0) resolve(err); else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-300)}`));
    });
  });
}

// Integrated loudness (LUFS) of an audio file. Null if it can't be measured - callers must fail open.
export async function measureLufs(path: string): Promise<number | null> {
  try {
    const out = await exec(["-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"]);
    // The SUMMARY block's "I:  -18.8 LUFS" is the last one printed.
    const all = [...out.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
    const last = all[all.length - 1];
    return last ? Number(last[1]) : null;
  } catch {
    return null;
  }
}

export function linearFromDb(db: number): number {
  return Math.pow(10, db / 20);
}

// Measure a buffer's loudness, apply ONE constant gain to land it on `targetLufs`, and limit the true peak.
// Returns the original buffer untouched on any failure, so a measurement problem can never silence a bed.
export async function normaliseToLufs(input: Buffer, ext: string, targetLufs: number): Promise<Buffer> {
  if (!bin() || !input.length) return input;
  let dir = "";
  try {
    await chmod(bin() as string, 0o755).catch(() => {});
    dir = await mkdtemp(join(tmpdir(), "lufs-"));
    const inPath = join(dir, `in.${ext}`);
    const outPath = join(dir, `out.${ext}`);
    await writeFile(inPath, input);

    const measured = await measureLufs(inPath);
    if (measured === null || !Number.isFinite(measured)) return input;
    const gainDb = targetLufs - measured;
    // Nothing worth doing for a sub-dB correction; avoid a needless re-encode.
    if (Math.abs(gainDb) < 0.5) return input;

    // WAV: write a CANONICAL header (fmt + data, no LIST/INFO chunk). ffmpeg normally inserts a LIST chunk,
    // which pushes the sample data from byte 44 to byte 78. Our in-house WAV DSP now walks the chunks properly,
    // but emitting the plain header keeps these buffers byte-compatible with every other WAV in the pipeline.
    const codec = ext === "wav"
      ? ["-c:a", "pcm_s16le", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-map_metadata", "-1"]
      : ["-c:a", "libmp3lame", "-b:a", "192k"];
    await exec([
      "-hide_banner", "-loglevel", "error", "-y", "-i", inPath,
      "-af", `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${linearFromDb(TRUE_PEAK_DB).toFixed(4)}:level=disabled`,
      ...codec, outPath,
    ]);
    const out = await readFile(outPath);
    return out.length ? out : input;
  } catch {
    return input; // fail open - an un-normalised bed beats a missing one
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Measure a hosted audio file (blob url). Null on any failure.
export async function measureLufsUrl(url: string): Promise<number | null> {
  if (!bin()) return null;
  let dir = "";
  try {
    await chmod(bin() as string, 0o755).catch(() => {});
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    dir = await mkdtemp(join(tmpdir(), "lufsm-"));
    const p = join(dir, "a.bin");
    await writeFile(p, Buffer.from(await res.arrayBuffer()));
    return await measureLufs(p);
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// The Shotstack `volume` that puts a bed `offsetDb` below the measured voiceover.
// Both beds are pre-normalised to BED_REFERENCE_LUFS, so this is pure arithmetic on the VO anchor.
// `trim` is the producer's slider, expressed as a multiplier around 1.0 (their dial, not a quality cap).
export function bedVolume(voLufs: number | null, offsetDb: number, trim = 1): number {
  const vo = voLufs === null || !Number.isFinite(voLufs) ? VO_REFERENCE_LUFS : voLufs;
  const wanted = vo + offsetDb; // absolute LUFS we want the bed to sit at
  const v = linearFromDb(wanted - BED_REFERENCE_LUFS) * trim;
  return Math.max(0, Math.min(1, Number(v.toFixed(4))));
}
