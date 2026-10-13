import { createHash } from "node:crypto";
import type { Pool } from "./index";

// Evidence pictures on a community report (D.9). They are server-readable and
// private: the author and the moderator assigned to the report can see them,
// nobody else, and they are never part of the published text. There is no
// scanner, so every file stays UNKNOWN and is only ever served as an image
// with headers that stop a browser treating it as anything else.

export const EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const starts = (bytes: Uint8Array, at: number, signature: number[]) =>
  signature.every((value, n) => bytes[at + n] === value);

// The type comes from the file's own first bytes. A file that only claims to
// be a picture (by name or by what the browser sent) is refused.
export function sniffImage(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (starts(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (starts(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    starts(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    starts(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
}

type Failure = {
  ok: false;
  error:
    | "NOT_AUTHORIZED"
    | "VALIDATION_FAILED"
    | "ILLEGAL_TRANSITION"
    | "EVIDENCE_LIMIT";
};

// Pictures can be added or removed only while the author can still edit.
const EDITABLE = ["DRAFT", "NEEDS_INFORMATION"];

export async function addEvidence(
  pool: Pool,
  input: { userId: string; reportId: string; bytes: Uint8Array },
): Promise<{ ok: true; evidenceId: string } | Failure> {
  if (!UUID.test(input.reportId)) return { ok: false, error: "NOT_AUTHORIZED" };
  const mediaType = sniffImage(input.bytes);
  if (
    !mediaType ||
    input.bytes.length === 0 ||
    input.bytes.length > EVIDENCE_MAX_BYTES
  ) {
    return { ok: false, error: "VALIDATION_FAILED" };
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    // The row lock makes the count below hold for concurrent uploads.
    const { rows } = await client.query(
      "select author_id, state from community_report where id = $1 for update",
      [input.reportId],
    );
    const report = rows[0];
    const refuse = async (error: Failure["error"]): Promise<Failure> => {
      await client.query("rollback");
      return { ok: false, error };
    };
    if (!report || report.author_id !== input.userId) {
      return refuse("NOT_AUTHORIZED");
    }
    if (!EDITABLE.includes(report.state)) return refuse("ILLEGAL_TRANSITION");
    const live = await client.query(
      "select count(*)::int as n from report_evidence where report_id = $1 and removed_at is null",
      [input.reportId],
    );
    if (live.rows[0].n >= EVIDENCE_MAX_FILES) return refuse("EVIDENCE_LIMIT");
    const inserted = await client.query(
      `insert into report_evidence (report_id, uploaded_by, media_type, byte_size, sha256, content)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        input.reportId,
        input.userId,
        mediaType,
        input.bytes.length,
        createHash("sha256").update(input.bytes).digest("hex"),
        Buffer.from(input.bytes),
      ],
    );
    await client.query("commit");
    return { ok: true, evidenceId: inserted.rows[0].id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function removeEvidence(
  pool: Pool,
  input: { userId: string; evidenceId: string },
): Promise<{ ok: true; reportId: string } | Failure> {
  if (!UUID.test(input.evidenceId)) {
    return { ok: false, error: "NOT_AUTHORIZED" };
  }
  const { rows } = await pool.query(
    `update report_evidence e set removed_at = now(), content = null
     from community_report r
     where e.id = $1 and r.id = e.report_id and r.author_id = $2
       and e.removed_at is null and r.state = any($3)
     returning e.report_id`,
    [input.evidenceId, input.userId, EDITABLE],
  );
  return rows[0]
    ? { ok: true, reportId: rows[0].report_id }
    : { ok: false, error: "NOT_AUTHORIZED" };
}

// Who may see a report's pictures: its author, and the moderator the report
// is assigned to. Being a moderator is not enough (D.2).
const MAY_SEE = "(r.author_id = $2 or r.moderator_id = $2)";

export type EvidenceItem = {
  id: string;
  mediaType: string;
  byteSize: number;
  scanState: "UNKNOWN" | "CLEAN" | "INFECTED";
};

export async function listEvidence(
  pool: Pool,
  input: { userId: string; reportId: string },
): Promise<EvidenceItem[]> {
  if (!UUID.test(input.reportId)) return [];
  const { rows } = await pool.query(
    `select e.id, e.media_type, e.byte_size, e.scan_state
     from report_evidence e join community_report r on r.id = e.report_id
     where e.report_id = $1 and e.removed_at is null and ${MAY_SEE}
     order by e.created_at`,
    [input.reportId, input.userId],
  );
  return rows.map((row) => ({
    id: row.id,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    scanState: row.scan_state,
  }));
}

// Null for anyone else, for a removed picture, and for one a scanner flagged.
export async function readEvidence(
  pool: Pool,
  input: { userId: string; evidenceId: string },
): Promise<{ mediaType: string; bytes: Buffer } | null> {
  if (!UUID.test(input.evidenceId)) return null;
  const { rows } = await pool.query(
    `select e.media_type, e.content
     from report_evidence e join community_report r on r.id = e.report_id
     where e.id = $1 and e.removed_at is null and e.scan_state <> 'INFECTED'
       and ${MAY_SEE}`,
    [input.evidenceId, input.userId],
  );
  return rows[0]
    ? { mediaType: rows[0].media_type, bytes: rows[0].content }
    : null;
}
