import { z } from "zod";
import type { Terms } from "./agreements";
import type { Pool } from "./index";
import { dealBalances } from "./ledger";

// Spec D.12, FE-24: a private record of one deal at its bound versions. It
// lists what was agreed, what was delivered and checked, and where the money
// went or is waiting. It holds no secret, no conversation and no opinion of
// either party. It is not a publication and not a reputation.

export type Receipt = {
  generatedAt: string;
  // INV-15: every receipt in this build is of synthetic money and checks.
  synthetic: true;
  dealId: string;
  title: string;
  parties: { role: "buyer" | "seller"; name: string }[];
  agreement: {
    versionNo: number;
    termsHash: string;
    state: string;
    templateId: string;
    templateVersion: number;
    categoryId: string;
    policyVersion: string;
    capabilityVersion: string;
    mode: string;
    currency: string;
    amountMinor: string;
    feeMinor: string;
    milestones: { title: string; amountMinor: string }[];
  };
  funding: { state: string; amountMinor: string } | null;
  packages: {
    packageId: string;
    versionNo: number;
    milestoneNo: number | null;
    state: string;
    submittedAt: string;
    accepted: boolean;
    inspections: {
      itemId: string;
      title: string;
      mandatory: boolean;
      state: string;
      proofType: string | null;
      recordedAt: string | null;
    }[];
  }[];
  allocations: {
    path: string;
    state: string;
    toSellerMinor: string;
    toBuyerMinor: string;
    createdAt: string;
    operations: { kind: string; amountMinor: string; state: string }[];
  }[];
  disputes: { claim: string; state: string; openedAt: string }[];
  balances: {
    heldMinor: string;
    reservedMinor: string;
    sellerPaidMinor: string;
    buyerRefundedMinor: string;
  };
  // True while any transfer is not final or any mandatory check on the
  // current package is not passed.
  pending: boolean;
};

export async function getReceipt(
  pool: Pool,
  input: { userId: string; dealId: string },
): Promise<Receipt | null> {
  if (!z.uuid().safeParse(input.dealId).success) return null;
  const parties = await pool.query(
    `select p.role, p.user_id, u.name from deal_party p
     join app_user u on u.id = p.user_id where p.deal_id = $1 order by p.role`,
    [input.dealId],
  );
  if (!parties.rows.some((p) => p.user_id === input.userId)) return null;

  const head = await pool.query(
    `select d.title, a.state, v.version_no, v.terms_hash, v.terms
     from deal d join aggregate a on a.deal_id = d.id and a.type = 'agreement'
     join lateral (select * from agreement_version where agreement_id = a.id
                   order by version_no desc limit 1) v on true
     where d.id = $1`,
    [input.dealId],
  );
  const row = head.rows[0];
  if (!row) return null;
  const terms: Terms = row.terms;

  const funding = await pool.query(
    `select a.state, f.amount_minor::text as amount from funding_invoice f
     join aggregate a on a.id = f.invoice_id
     where f.deal_id = $1 order by f.created_at desc limit 1`,
    [input.dealId],
  );
  const packages = await pool.query(
    `select p.package_id, p.version_no, p.milestone_no, p.submitted_at, a.state,
       exists (select 1 from delivery_acceptance d where d.package_id = p.package_id) as accepted
     from delivery_package p join aggregate a on a.id = p.package_id
     where p.deal_id = $1 order by p.version_no`,
    [input.dealId],
  );
  const inspections = await pool.query(
    `select i.package_id, i.item_id, i.mandatory, a.state, r.proof_type, r.recorded_at
     from inspection_item i join aggregate a on a.id = i.inspection_id
     left join lateral (select proof_type, recorded_at from inspection_result
                        where inspection_id = i.inspection_id order by id desc limit 1) r on true
     where i.deal_id = $1 order by a.created_at, i.item_id`,
    [input.dealId],
  );
  const allocations = await pool.query(
    `select s.authorization_id, s.path, a.state, s.to_seller_minor::text as to_seller,
       s.to_buyer_minor::text as to_buyer, s.created_at
     from settlement_authorization s join aggregate a on a.id = s.authorization_id
     where s.deal_id = $1 order by s.created_at`,
    [input.dealId],
  );
  const operations = await pool.query(
    `select o.authorization_id, o.kind, o.amount_minor::text as amount, a.state
     from adapter_operation o join aggregate a on a.id = o.operation_id
     where o.deal_id = $1 order by o.kind`,
    [input.dealId],
  );
  const disputes = await pool.query(
    `select d.claim, a.state, d.opened_at from dispute d
     join aggregate a on a.id = d.dispute_id where d.deal_id = $1 order by d.opened_at`,
    [input.dealId],
  );
  const balances = await dealBalances(pool, input.dealId);

  const title = (itemId: string) =>
    terms.items.find((i) => i.itemId === itemId)?.title.bn ?? itemId;
  const packageList = packages.rows.map((p) => ({
    packageId: p.package_id as string,
    versionNo: p.version_no as number,
    milestoneNo: p.milestone_no as number | null,
    state: p.state as string,
    submittedAt: (p.submitted_at as Date).toISOString(),
    accepted: p.accepted as boolean,
    inspections: inspections.rows
      .filter((i) => i.package_id === p.package_id)
      .map((i) => ({
        itemId: i.item_id as string,
        title: title(i.item_id),
        mandatory: i.mandatory as boolean,
        state: i.state as string,
        proofType: i.proof_type as string | null,
        recordedAt: i.recorded_at?.toISOString() ?? null,
      })),
  }));
  const allocationList = allocations.rows.map((s) => ({
    path: s.path as string,
    state: s.state as string,
    toSellerMinor: s.to_seller as string,
    toBuyerMinor: s.to_buyer as string,
    createdAt: (s.created_at as Date).toISOString(),
    operations: operations.rows
      .filter((o) => o.authorization_id === s.authorization_id)
      .map((o) => ({
        kind: o.kind as string,
        amountMinor: o.amount as string,
        state: o.state as string,
      })),
  }));
  const current = packageList.at(-1);
  const pending =
    balances.reserved > 0n ||
    allocationList.some(
      (a) =>
        a.state !== "INVALIDATED" &&
        a.operations.some(
          (o) => !["SUCCEEDED", "FAILED_FINAL"].includes(o.state),
        ),
    ) ||
    (current !== undefined &&
      current.state === "SUBMITTED" &&
      current.inspections.some((i) => i.mandatory && i.state !== "PASSED"));

  return {
    generatedAt: new Date().toISOString(),
    synthetic: true,
    dealId: input.dealId,
    title: row.title,
    parties: parties.rows.map((p) => ({ role: p.role, name: p.name })),
    agreement: {
      versionNo: row.version_no,
      termsHash: row.terms_hash,
      state: row.state,
      templateId: terms.templateId,
      templateVersion: terms.templateVersion,
      categoryId: terms.categoryId,
      policyVersion: terms.policyVersion,
      capabilityVersion: terms.capabilityVersion,
      mode: terms.mode,
      currency: terms.currency,
      amountMinor: terms.amountMinor,
      feeMinor: terms.feeMinor,
      milestones: terms.milestones ?? [],
    },
    funding: funding.rows[0]
      ? { state: funding.rows[0].state, amountMinor: funding.rows[0].amount }
      : null,
    packages: packageList,
    allocations: allocationList,
    disputes: disputes.rows.map((d) => ({
      claim: d.claim as string,
      state: d.state as string,
      openedAt: (d.opened_at as Date).toISOString(),
    })),
    balances: {
      heldMinor: balances.held.toString(),
      reservedMinor: balances.reserved.toString(),
      sellerPaidMinor: balances.sellerPaid.toString(),
      buyerRefundedMinor: balances.buyerRefunded.toString(),
    },
    pending,
  };
}
