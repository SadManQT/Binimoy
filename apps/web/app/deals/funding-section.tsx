import { formatBdt } from "@lp/contracts";
import type { Balances, Funding } from "@lp/db/ledger";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import {
  createInvoiceAction,
  mockProviderAction,
  startFundingAction,
} from "./actions";

// B5 step 4. Shows what the ledger says, never what a button press assumed.
export async function FundingSection({
  dealId,
  isBuyer,
  funding,
  balances,
  idempotencyKey,
}: {
  dealId: string;
  isBuyer: boolean;
  funding: Funding | null;
  balances: Balances;
  idempotencyKey: string;
}) {
  const { locale, L, dateTime } = await getI18n();
  const copy = copyFor(locale);
  const closed = !funding || ["EXPIRED", "CANCELLED"].includes(funding.state);
  return (
    <div>
      <h3>
        {L("টাকা জমা (টেস্ট, কোনো আসল টাকা নয়)", "Paying in (test, no real money)")}
      </h3>
      <dl>
        <dt>{L("অবস্থা", "Status")}</dt>
        <dd>
          {funding
            ? (copy.funding[funding.state] ?? funding.state)
            : L("এখনো কোনো ইনভয়েস নেই", "No invoice yet")}
        </dd>
        <dt>{L("নিরাপদ হিসাবে আটকে আছে", "Held in the safe account")}</dt>
        <dd>{formatBdt(balances.held.toString())}</dd>
        {balances.unapplied > 0n && (
          <>
            <dt>
              {L(
                "পাওয়া গেছে কিন্তু ডিলে লাগানো হয়নি",
                "Received but not applied to the deal",
              )}
            </dt>
            <dd>
              {formatBdt(balances.unapplied.toString())} ·{" "}
              {L(
                "এটি বায়ারের ফেরত পাওনা হিসেবে আলাদা রাখা আছে; ফেরতের ব্যবস্থা এখনো তৈরি হয়নি।",
                "This is kept apart as a refund owed to the buyer; the refund process is not built yet.",
              )}
            </dd>
          </>
        )}
      </dl>

      {!isBuyer && closed && (
        <p>
          {L(
            "বায়ার ইনভয়েস তৈরি করে টাকা জমা দেবেন।",
            "The buyer will create an invoice and pay in.",
          )}
        </p>
      )}

      {isBuyer && closed && (
        <form action={createInvoiceAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <button type="submit">
            {L("টাকা জমার ইনভয়েস তৈরি করুন", "Create the funding invoice")}
          </button>
        </form>
      )}

      {isBuyer && funding?.state === "CREATED" && (
        <form action={startFundingAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="invoiceId" value={funding.invoiceId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={funding.aggregateVersion}
          />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <p>
            {L(
              `জমা দিতে হবে ঠিক ${formatBdt(funding.amountMinor)} (${funding.currency}). ইনভয়েসের মেয়াদ: ${dateTime(funding.expiresAt)}`,
              `You must pay in exactly ${formatBdt(funding.amountMinor)} (${funding.currency}). The invoice expires: ${dateTime(funding.expiresAt)}`,
            )}
          </p>
          <button type="submit">
            {L("টেস্ট পেমেন্ট শুরু করুন", "Start the test payment")}
          </button>
        </form>
      )}

      {isBuyer && funding?.state === "PENDING" && (
        <form action={mockProviderAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <fieldset>
            <legend>
              {L(
                "টেস্ট পেমেন্ট প্রোভাইডার: কী রিপোর্ট করবে?",
                "Test payment provider: what should it report?",
              )}
            </legend>
            <p>
              {L(
                "বাস্তবে এই উত্তর পেমেন্ট প্রোভাইডার পাঠায়। চেকের জন্য আপনি বেছে নিচ্ছেন। স্ক্রিনশট বা বোতাম চাপা টাকা জমা প্রমাণ করে না; শুধু প্রোভাইডারের স্বাক্ষরিত বার্তা করে।",
                "In real use the payment provider sends this answer. For testing, you choose it. A screenshot or a button press does not prove payment; only the provider's signed message does.",
              )}
            </p>
            <button type="submit" name="scenario" value="exact">
              {L("সঠিক পরিমাণ পাওয়া গেছে", "The exact amount was received")}
            </button>
            <button type="submit" name="scenario" value="under">
              {L("১০০ টাকা কম পাওয়া গেছে", "100 taka less was received")}
            </button>
            <button type="submit" name="scenario" value="over">
              {L("১০০ টাকা বেশি পাওয়া গেছে", "100 taka more was received")}
            </button>
          </fieldset>
        </form>
      )}

      {funding?.state === "CONFIRMED" && (
        <p>
          {L(
            'টাকা জমা নিশ্চিত হয়েছে। পরের ধাপ সেলারের ডেলিভারি, তারপর বায়ারের চেক। সেলার "দিয়েছি" বললেই টাকা ছাড়া হবে না।',
            "Funding is confirmed. Next the seller delivers, then the buyer checks. The seller saying “delivered” does not release the money.",
          )}
        </p>
      )}
    </div>
  );
}
