import { randomUUID } from "node:crypto";
import { createPool } from "@lp/db";
import { grantStaffRole } from "@lp/db/access";
import {
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
} from "@lp/db/agreements";
import {
  addFollowup,
  claimReport,
  decideFollowup,
  decideReport,
  saveDraft,
  submitReport,
} from "@lp/db/community";
import { submitDelivery } from "@lp/db/delivery";
import { LAB_SCHEMA, labRefusal } from "@lp/db/lab";
import {
  createInvoice,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "@lp/db/ledger";
import { migrate } from "@lp/db/migrate";
import { createSafetyAlert } from "@lp/db/shops";
import { setMockFact } from "@lp/db/verification";
import { createAuth } from "./auth";

// Scenario Lab data (spec A11, FE-25). Everything here is synthetic and lives
// in its own schema.
//   DB_SCHEMA=lp_lab pnpm demo:seed    add the demo people and deals
//   DB_SCHEMA=lp_lab pnpm demo:reset   remove the lab schema, rebuild it, seed it
// Then run the app on the lab:  DB_SCHEMA=lp_lab pnpm dev

const action = process.argv[2];
const refusal = labRefusal(process.env);
const url = process.env.DATABASE_URL;
if (refusal || !url || (action !== "seed" && action !== "reset")) {
  console.error(
    refusal ?? "Usage: DB_SCHEMA=lp_lab pnpm demo:seed | demo:reset",
  );
  process.exit(1);
}

const LAB_PASSWORD = "binimoy lab 2026";
const PEOPLE = ["seller", "buyer", "reviewer", "moderator"] as const;
const SECRET = "lab-webhook-secret";

// The schema name is the constant, never anything read from the environment.
const admin = createPool(url);
if (action === "reset") {
  await admin.query(`drop schema if exists ${LAB_SCHEMA} cascade`);
}
await admin.query(`create schema if not exists ${LAB_SCHEMA}`);
await admin.end();

const pool = createPool(url, LAB_SCHEMA);
try {
  await migrate(pool);
  const auth = createAuth({
    pool,
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    secret: process.env.AUTH_SECRET ?? "lab-only-secret-lab-only-secret-lab",
    send: async () => {},
    social: {},
  });
  const run = randomUUID().slice(0, 6);
  const ids = {} as Record<(typeof PEOPLE)[number], string>;
  const emails = {} as Record<(typeof PEOPLE)[number], string>;
  for (const person of PEOPLE) {
    emails[person] = `${person}-${run}@lab.binimoy.test`;
    const created = await auth.api.signUpEmail({
      body: {
        name: `Lab ${person}`,
        email: emails[person],
        password: LAB_PASSWORD,
      },
    });
    ids[person] = created.user.id;
  }
  for (const role of ["reviewer", "moderator"] as const) {
    await grantStaffRole(pool, {
      userId: ids[role],
      role,
      grantedBy: "operator:demo-seed",
      reason: "Scenario Lab fixture staffing (synthetic)",
    });
  }

  const envelope = (version: number, payload = {}) => ({
    commandId: randomUUID(),
    idempotencyKey: `seed-${randomUUID()}`,
    expectedAggregateVersion: version,
    payload,
  });
  async function deal(input: Record<string, unknown>, fund: boolean) {
    const created = await createDeal(pool, ids.seller, {
      role: "seller",
      templateVersion: 1,
      mode: "ai_first",
      ...input,
    });
    if (!created.ok) throw new Error(`createDeal: ${JSON.stringify(input)}`);
    const invite = await createInvite(pool, ids.seller, created.dealId);
    if (!invite.ok) throw new Error("invite failed");
    await acceptInvite(pool, ids.buyer, invite.token);
    for (const [userId, command] of [
      [ids.seller, "ProposeAgreement"],
      [ids.buyer, "AcceptAgreement"],
      [ids.seller, "AcceptAgreement"],
    ] as const) {
      const view = await getDealView(pool, userId, created.dealId);
      if (!view) throw new Error("no view");
      await agreementCommand(pool, "lab", {
        userId,
        agreementId: created.agreementId,
        command,
        envelope: envelope(view.agreement.aggregateVersion, {
          termsHash: view.agreement.termsHash,
        }),
      });
    }
    if (fund) {
      const invoice = await createInvoice(pool, ids.buyer, created.dealId);
      if (!invoice.ok) throw new Error(`invoice: ${invoice.error}`);
      await startFunding(pool, "lab", {
        userId: ids.buyer,
        invoiceId: invoice.invoiceId,
        envelope: envelope(1),
      });
      const funding = await getFunding(pool, created.dealId);
      const body = JSON.stringify({
        eventId: `evt-${randomUUID()}`,
        type: "payment.succeeded",
        paymentRef: funding?.paymentRef,
        amountMinor: input.amountMinor,
        currency: "BDT",
      });
      await ingestPaymentEvent(pool, "lab", {
        rawBody: body,
        signature: signMockEvent(body, SECRET),
        secret: SECRET,
      });
    }
    return created.dealId;
  }

  await deal(
    {
      templateId: "software_license",
      title: "Lab 1: license, agreed, not funded",
      amountMinor: "150000",
      product: {
        product: "EditorPro",
        edition: "Pro",
        region: "BD",
        duration: "12 months",
        device_limit: "2",
        activation_destination: "buyer@lab.binimoy.test",
      },
    },
    false,
  );
  const topUp = await deal(
    {
      templateId: "game_topup",
      title: "Lab 2: top-up, delivered, provider says wrong player",
      amountMinor: "80000",
      product: {
        game: "Sky Racers",
        server: "Asia-1",
        region: "BD",
        player_id: "PLAYER-7781",
        quantity: "500 gems",
      },
    },
    true,
  );
  await submitDelivery(pool, async () => true, {
    userId: ids.seller,
    dealId: topUp,
    items: [{ itemId: "order_reference", declared: true }],
  });
  for (const [predicate, boundTo] of [
    ["mock_topup.supplier_authorized", undefined],
    ["mock_topup.fulfilled_to_destination", "PLAYER-0000"],
  ] as const) {
    await setMockFact(pool, {
      userId: ids.seller,
      dealId: topUp,
      fact: { predicate, outcome: "PASSED", boundTo },
    });
  }
  await deal(
    {
      templateId: "service_milestones",
      title: "Lab 3: logo design in two milestones, funded",
      amountMinor: "250000",
      product: {
        scope: "Logo and brand sheet",
        exclusions: "Printing",
        acceptance_criteria: "Vector file opens; three colour variants",
        revision_limit: "Two rounds, reply within 48 hours",
        handover: "Source files and full rights on final payment",
      },
      milestones: [
        { title: "Three draft concepts", amountMinor: "100000" },
        { title: "Final files", amountMinor: "150000" },
      ],
    },
    true,
  );

  // Shops, reviews, complaints and one general warning. Every shop and every
  // experience here is invented.
  const RULES = "Follows the publication rules (lab fixture).";
  async function review(
    author: "buyer" | "seller" | "reviewer",
    subject: string,
    shopCategory: string,
    fields: {
      experienceType: string;
      rating: number;
      issue?: string;
      product: string;
      text: string;
    },
  ) {
    const saved = await saveDraft(pool, {
      userId: ids[author],
      subject,
      shopCategory,
      category: fields.product,
      eventDate: "2026-09-14",
      experienceType: fields.experienceType,
      amountMinor: null,
      narrative: `Lab fixture original. ${fields.text}`,
      publicText: fields.text,
      rating: fields.rating,
      issue: fields.issue ?? null,
    });
    if (!saved.ok) throw new Error(`review draft: ${saved.error}`);
    const submitted = await submitReport(pool, {
      userId: ids[author],
      reportId: saved.reportId,
      expectedVersion: saved.version,
    });
    if (!submitted.ok) throw new Error(`review submit: ${submitted.error}`);
    await claimReport(pool, {
      moderatorId: ids.moderator,
      reportId: saved.reportId,
    });
    await decideReport(pool, {
      moderatorId: ids.moderator,
      reportId: saved.reportId,
      decision: "PUBLISHED",
      reason: RULES,
    });
    return saved.reportId;
  }
  await review("buyer", "গেমার্স হাব বিডি", "game_topup", {
    experienceType: "positive",
    rating: 5,
    product: "ডায়মন্ড টপ-আপ",
    text: "অর্ডারের দশ মিনিটের মধ্যে টপ-আপ পেয়েছি। আইডি মিলিয়ে নিয়ে তারপর পাঠিয়েছে।",
  });
  await review("seller", "গেমার্স হাব বিডি", "game_topup", {
    experienceType: "positive",
    rating: 4,
    product: "উইকলি পাস",
    text: "পেয়েছি, তবে উত্তর দিতে ঘণ্টাখানেক দেরি করেছে।",
  });
  const refunded = await review("reviewer", "গেমার্স হাব বিডি", "game_topup", {
    experienceType: "negative",
    rating: 2,
    issue: "no_refund",
    product: "ডায়মন্ড টপ-আপ",
    text: "ভুল সার্ভারে টপ-আপ গেছে। টাকা ফেরত চেয়ে তিন দিন অপেক্ষা করতে হয়েছে।",
  });
  for (const [who, kind, body] of [
    ["seller", "RESPONSE", "অর্ডারটি আমরা মিলিয়ে দেখেছি এবং পুরো টাকা ফেরত দিয়েছি।"],
    ["reviewer", "RESOLUTION", "চতুর্থ দিনে পুরো টাকা ফেরত পেয়েছি।"],
  ] as const) {
    const added = await addFollowup(pool, {
      userId: ids[who],
      reportId: refunded,
      kind,
      body,
    });
    if (!added.ok) throw new Error(`followup: ${added.error}`);
    await decideFollowup(pool, {
      moderatorId: ids.moderator,
      followupId: added.followupId,
      publish: true,
      reason: RULES,
    });
  }
  await review("buyer", "কি-স্টোর ঢাকা", "software", {
    experienceType: "negative",
    rating: 1,
    issue: "not_delivered",
    product: "উইন্ডোজ কি",
    text: "টাকা পাঠানোর পর এক সপ্তাহেও কি পাইনি। মেসেজের উত্তরও আসেনি।",
  });
  await review("seller", "সাবস্ক্রিপশন কর্নার", "subscriptions", {
    experienceType: "mixed",
    rating: 3,
    issue: "access_revoked",
    product: "স্ট্রিমিং সাবস্ক্রিপশন",
    text: "প্রথম মাস ঠিক চলেছে, দ্বিতীয় মাসে লগইন বন্ধ হয়ে যায়। জানানোর পর নতুন অ্যাক্সেস দিয়েছে।",
  });
  await review("reviewer", "সাবস্ক্রিপশন কর্নার", "subscriptions", {
    experienceType: "positive",
    rating: 5,
    product: "মিউজিক সাবস্ক্রিপশন",
    text: "নিজের অ্যাকাউন্টেই চালু করে দিয়েছে, ছয় মাস ধরে চলছে।",
  });
  await review("buyer", "পিক্সেল স্টুডিও", "digital_services", {
    experienceType: "positive",
    rating: 5,
    product: "লোগো ডিজাইন",
    text: "তিনটি ড্রাফট দিয়েছিল, পছন্দেরটির সোর্স ফাইলসহ বুঝিয়ে দিয়েছে।",
  });
  await createSafetyAlert(pool, {
    userId: ids.moderator,
    title: "আগাম পুরো টাকা চাইলে একবার থামুন",
    body: "সাম্প্রতিক কয়েকটি রিপোর্টে একই ধরন দেখা গেছে: প্রোডাক্ট দেখানোর আগেই ব্যক্তিগত নম্বরে পুরো টাকা চাওয়া হয়, টাকা পাওয়ার পর আর উত্তর আসে না। টাকা পাঠানোর আগে শপের নাম এখানে খুঁজে দেখুন।",
  });

  console.log(
    JSON.stringify(
      {
        msg: action === "reset" ? "lab_reset_and_seeded" : "lab_seeded",
        schema: LAB_SCHEMA,
        password: LAB_PASSWORD,
        accounts: emails,
        next: "DB_SCHEMA=lp_lab pnpm dev, then sign in with one of these emails",
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
