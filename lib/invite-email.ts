const BASE = "https://influencers.gasmarketing.co.za";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function inviteEmail(opts: { inviterName: string; inviteeName?: string; link: string }): { subject: string; html: string } {
  const hi = opts.inviteeName ? `Hi ${esc(opts.inviteeName)},` : "Hi,";
  const html = `
  <div style="background:#07090d;padding:28px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:0 18px;">
      <div style="text-align:center;padding:8px 0 14px;">
        <img src="${BASE}/gas-logo.png" width="68" height="68" style="border-radius:50%;" alt="GAS" />
        <div style="margin-top:12px;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
          <span style="background:linear-gradient(135deg,#ffb020,#ff6a00 45%,#ff2d55);-webkit-background-clip:text;background-clip:text;color:#ff6a00;">Influencers on GAS</span>
        </div>
      </div>
      <div style="border:1px solid rgba(168,85,247,0.3);border-radius:16px;background:#0c1117;padding:22px 22px;">
        <p style="color:#e6e8eb;font-size:15px;line-height:1.6;margin:0 0 10px;">${hi}</p>
        <p style="color:#9aa0a8;font-size:14px;line-height:1.65;margin:0 0 18px;">
          ${esc(opts.inviterName)} has invited you to <b style="color:#fff;">Influencers on GAS</b>, the studio for building and producing AI influencers. Set your password to get started.
        </p>
        <div style="text-align:center;margin:6px 0 4px;">
          <a href="${opts.link}" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:99px;">Set your password →</a>
        </div>
        <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:16px 0 0;text-align:center;">This link expires in 7 days. If you weren't expecting this, you can ignore it.</p>
      </div>
      <p style="text-align:center;color:#6b7280;font-size:11px;margin-top:16px;">Influencers on GAS · GAS Marketing</p>
    </div>
  </div>`;
  return { subject: "You're invited to Influencers on GAS", html };
}
