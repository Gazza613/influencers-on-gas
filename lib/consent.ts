import { db } from "./db";

export async function getActiveConsentText() {
  const rows = (await db().query(
    "select id, version, body from consent_texts where active = true order by version desc limit 1",
  )) as { id: string; version: number; body: string }[];
  return rows[0] ?? null;
}

// Write a POPIA/GDPR consent record (timestamped). granted_by must be a users.id.
export async function recordConsent(input: {
  subjectName: string;
  subjectEmail?: string | null;
  dataType: "image" | "voice";
  scope: string;
  consentTextId: string;
  grantedBy: string;
  clientId?: string | null;
  influencerRef?: string | null;
}): Promise<string> {
  const rows = (await db().query(
    `insert into consents
       (client_id, influencer_ref, subject_name, subject_email, data_type, scope, consent_text_id, granted_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.clientId ?? null,
      input.influencerRef ?? null,
      input.subjectName,
      input.subjectEmail ?? null,
      input.dataType,
      input.scope,
      input.consentTextId,
      input.grantedBy,
    ],
  )) as { id: string }[];
  return rows[0].id;
}
