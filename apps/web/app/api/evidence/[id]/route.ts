import { readEvidence } from "@lp/db/evidence";
import { apiUser } from "../../../../lib/api";
import { pool } from "../../../../lib/pool";

export const dynamic = "force-dynamic";

// Serves one evidence picture to its author or the assigned moderator. Not
// signed in, not allowed and no such picture all look the same (D.2). The
// headers keep the browser from treating the bytes as anything but an image.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await apiUser(request);
  const found = user
    ? await readEvidence(pool(), {
        userId: user.id,
        evidenceId: (await params).id,
      })
    : null;
  if (!found) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "content-type": found.mediaType,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
