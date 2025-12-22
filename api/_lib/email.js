// api/_lib/email.js
import { Resend } from "resend";

export async function sendInviteEmail({ to, inviteUrl, websiteName }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "feedback@vyndow.com";

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const resend = new Resend(apiKey);

  const subject = `You’re invited to join ${websiteName} on Vyndow`;
  const html = `
    <div style="font-family: system-ui; line-height: 1.5;">
      <h2 style="margin:0 0 12px;">You’ve been invited</h2>
      <p style="margin:0 0 12px;">
        You’ve been invited to access <b>${escapeHtml(websiteName)}</b> on Vyndow.
      </p>
      <p style="margin:0 0 18px;">Click below to accept:</p>
      <p style="margin:0 0 18px;">
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 14px;border-radius:999px;
          background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;">
          Accept Invite
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0;">
        If you didn’t expect this invite, you can ignore this email.
      </p>
    </div>
  `;

  return resend.emails.send({
    from,
    to,
    subject,
    html,
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
