import { formatBdt } from "@lp/contracts";
import type { Balances, Funding } from "@lp/db/ledger";
import { FUNDING_TEXT } from "../../lib/copy";
import {
  createInvoiceAction,
  mockProviderAction,
  startFundingAction,
} from "./actions";

// B5 step 4. Shows what the ledger says, never what a button press assumed.
export function FundingSection({
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
  const closed = !funding || ["EXPIRED", "CANCELLED"].includes(funding.state);
  return (
    <div>
      <h3>টাকা জমা (পরীক্ষামূলক, কোনো আসল টাকা নয়)</h3>
      <dl>
        <dt>অবস্থা</dt>
        <dd>
          {funding
            ? (FUNDING_TEXT[funding.state] ?? funding.state)
            : "এখনো কোনো ইনভয়েস নেই"}
        </dd>
        <dt>নিরাপদ হিসাবে আটকে আছে</dt>
        <dd>{formatBdt(balances.held.toString())}</dd>
        {balances.unapplied > 0n && (
          <>
            <dt>পাওয়া গেছে কিন্তু ডিলে লাগানো হয়নি</dt>
            <dd>
              {formatBdt(balances.unapplied.toString())} · এটি ক্রেতার ফেরত পাওনা
              হিসেবে আলাদা রাখা আছে; ফেরতের ব্যবস্থা এখনো তৈরি হয়নি।
            </dd>
          </>
        )}
      </dl>

      {!isBuyer && closed && <p>ক্রেতা ইনভয়েস তৈরি করে টাকা জমা দেবেন।</p>}

      {isBuyer && closed && (
        <form action={createInvoiceAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <button type="submit">টাকা জমার ইনভয়েস তৈরি করুন</button>
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
            জমা দিতে হবে ঠিক {formatBdt(funding.amountMinor)} ({funding.currency}
            ). ইনভয়েসের মেয়াদ:{" "}
            {funding.expiresAt.toLocaleString("bn-BD", {
              timeZone: "Asia/Dhaka",
            })}{" "}
            (Asia/Dhaka)
          </p>
          <button type="submit">নকল পেমেন্ট শুরু করুন</button>
        </form>
      )}

      {isBuyer && funding?.state === "PENDING" && (
        <form action={mockProviderAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <fieldset>
            <legend>নকল পেমেন্ট প্রোভাইডার: কী রিপোর্ট করবে?</legend>
            <p>
              বাস্তবে এই উত্তর পেমেন্ট প্রোভাইডার পাঠায়। পরীক্ষার জন্য আপনি বেছে নিচ্ছেন।
              স্ক্রিনশট বা বোতাম চাপা টাকা জমা প্রমাণ করে না; শুধু প্রোভাইডারের স্বাক্ষরিত বার্তা করে।
            </p>
            <button type="submit" name="scenario" value="exact">
              সঠিক পরিমাণ পাওয়া গেছে
            </button>
            <button type="submit" name="scenario" value="under">
              ১০০ টাকা কম পাওয়া গেছে
            </button>
            <button type="submit" name="scenario" value="over">
              ১০০ টাকা বেশি পাওয়া গেছে
            </button>
          </fieldset>
        </form>
      )}

      {funding?.state === "CONFIRMED" && (
        <p>
          টাকা আটকে রাখা হয়েছে। পরের ধাপ বিক্রেতার সরবরাহ, যা এই সংস্করণে এখনো তৈরি হয়নি।
          বিক্রেতা "দিয়েছি" বললেই টাকা ছাড়া হবে না।
        </p>
      )}
    </div>
  );
}
