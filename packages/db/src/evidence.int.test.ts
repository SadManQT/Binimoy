import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { grantStaffRole } from "./access";
import { claimReport, saveDraft, submitReport } from "./community";
import {
  addEvidence,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  listEvidence,
  readEvidence,
  removeEvidence,
  sniffImage,
} from "./evidence";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(moderator = false): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Person', $1) returning id",
    [`u-${randomUUID()}@example.test`],
  );
  const userId: string = rows[0].id;
  if (moderator) {
    await grantStaffRole(pool, {
      userId,
      role: "moderator",
      grantedBy: userId,
      reason: "test",
    });
  }
  return userId;
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

async function draft(userId: string) {
  const saved = await saveDraft(pool, {
    userId,
    subject: `Shop ${randomUUID().slice(0, 8)}`,
    category: "software_license",
    eventDate: "2026-08-03",
    experienceType: "negative",
    amountMinor: null,
    narrative: "I paid and got nothing, and I kept the payment screenshot.",
    publicText: "I paid on 3 August and did not receive the license.",
  });
  if (!saved.ok) throw new Error(`draft failed: ${saved.error}`);
  return saved;
}

test("the type is read from the file itself", () => {
  expect(sniffImage(PNG)).toBe("image/png");
  expect(sniffImage(JPEG)).toBe("image/jpeg");
  expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(
    "image/webp",
  );
  // A web page or a script named like a picture is not a picture.
  expect(
    sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")),
  ).toBeNull();
  expect(sniffImage(new TextEncoder().encode("<html><script>"))).toBeNull();
  expect(sniffImage(new Uint8Array())).toBeNull();
});

test("only the author adds pictures, only pictures, within size and count", async () => {
  const author = await newUser();
  const other = await newUser();
  const { reportId } = await draft(author);

  expect(
    await addEvidence(pool, { userId: other, reportId, bytes: PNG }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await addEvidence(pool, {
      userId: author,
      reportId,
      bytes: new TextEncoder().encode("<html>not a picture</html>"),
    }),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  const big = new Uint8Array(EVIDENCE_MAX_BYTES + 1);
  big.set(PNG);
  expect(
    await addEvidence(pool, { userId: author, reportId, bytes: big }),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });

  for (let n = 0; n < EVIDENCE_MAX_FILES; n += 1) {
    expect(
      (await addEvidence(pool, { userId: author, reportId, bytes: PNG })).ok,
    ).toBe(true);
  }
  expect(
    await addEvidence(pool, { userId: author, reportId, bytes: JPEG }),
  ).toEqual({ ok: false, error: "EVIDENCE_LIMIT" });
  expect(await listEvidence(pool, { userId: author, reportId })).toHaveLength(
    EVIDENCE_MAX_FILES,
  );
});

test("pictures are seen by the author and the assigned moderator, nobody else", async () => {
  const author = await newUser();
  const stranger = await newUser();
  const assigned = await newUser(true);
  const otherModerator = await newUser(true);
  const { reportId, version } = await draft(author);
  const added = await addEvidence(pool, {
    userId: author,
    reportId,
    bytes: JPEG,
  });
  if (!added.ok) throw new Error(added.error);
  const { evidenceId } = added;

  const mine = await readEvidence(pool, { userId: author, evidenceId });
  expect(mine?.mediaType).toBe("image/jpeg");
  expect(new Uint8Array(mine?.bytes ?? [])).toEqual(JPEG);
  // No scanner: nothing is called clean.
  expect(
    (await listEvidence(pool, { userId: author, reportId }))[0]?.scanState,
  ).toBe("UNKNOWN");

  for (const userId of [stranger, assigned, otherModerator]) {
    expect(await readEvidence(pool, { userId, evidenceId })).toBeNull();
    expect(await listEvidence(pool, { userId, reportId })).toEqual([]);
  }

  const submitted = await submitReport(pool, {
    userId: author,
    reportId,
    expectedVersion: version,
  });
  expect(submitted.ok).toBe(true);
  expect(
    (await claimReport(pool, { moderatorId: assigned, reportId })).ok,
  ).toBe(true);
  expect(
    (await readEvidence(pool, { userId: assigned, evidenceId }))?.mediaType,
  ).toBe("image/jpeg");
  // Another moderator, and the public, still see nothing.
  expect(
    await readEvidence(pool, { userId: otherModerator, evidenceId }),
  ).toBeNull();
  expect(await readEvidence(pool, { userId: stranger, evidenceId })).toBeNull();

  // Once submitted the author can no longer add or remove.
  expect(
    await addEvidence(pool, { userId: author, reportId, bytes: PNG }),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
  expect(await removeEvidence(pool, { userId: author, evidenceId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
});

test("removing a picture removes its bytes", async () => {
  const author = await newUser();
  const other = await newUser();
  const { reportId } = await draft(author);
  const added = await addEvidence(pool, {
    userId: author,
    reportId,
    bytes: PNG,
  });
  if (!added.ok) throw new Error(added.error);
  expect(
    await removeEvidence(pool, { userId: other, evidenceId: added.evidenceId }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await removeEvidence(pool, {
      userId: author,
      evidenceId: added.evidenceId,
    }),
  ).toEqual({ ok: true, reportId });
  expect(
    await readEvidence(pool, { userId: author, evidenceId: added.evidenceId }),
  ).toBeNull();
  const { rows } = await pool.query(
    "select content from report_evidence where id = $1",
    [added.evidenceId],
  );
  expect(rows[0].content).toBeNull();
  // The freed slot can be used again.
  expect(
    (await addEvidence(pool, { userId: author, reportId, bytes: PNG })).ok,
  ).toBe(true);
});
