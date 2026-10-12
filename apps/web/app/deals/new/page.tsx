import { TEMPLATES } from "@lp/templates";
import { ERROR_TEXT } from "../../../lib/copy";
import { getI18n } from "../../../lib/i18n";
import { requireUser } from "../../../lib/session";
import { createDealAction } from "../actions";
import { TermsFields } from "../terms-fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "নতুন ডিল · বিনিময়" };

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; error?: string }>;
}) {
  await requireUser();
  const { template: templateId, error } = await searchParams;
  const { locale } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const template = TEMPLATES.find((t) => t.templateId === templateId);

  if (!template) {
    return (
      <main>
        <h1>
          {L("নতুন ডিল: কী ধরনের প্রোডাক্ট?", "New deal: what kind of product?")}
        </h1>
        <p>
          {L(
            "এগারো ধরনের প্রোডাক্ট চালু আছে। “টেস্ট” লেখা ধরনগুলোতে প্রোভাইডারের চেক একটা টেস্ট প্রোভাইডার দিয়ে দেখানো হয়, আসল প্রোভাইডার দিয়ে না।",
            "Eleven kinds of product are open. Where a kind says “test”, the provider check is shown with a test provider, not the real one.",
          )}
        </p>
        <ul className="index">
          {TEMPLATES.map((t) => (
            <li key={t.templateId}>
              <a
                href={`/deals/new?template=${t.templateId}`}
                data-no={t.categoryId.slice(4)}
              >
                {t.name[locale]}
              </a>
            </li>
          ))}
        </ul>
        <p>
          <a href="/deals">{L("ফিরে যান", "Back")}</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>
        {L("নতুন ডিল", "New deal")}: {template.name[locale]}
      </h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      <form action={createDealAction}>
        <fieldset>
          <legend>{L("এই ডিলে আপনি", "In this deal you are")}</legend>
          <label>
            <input
              type="radio"
              name="role"
              value="seller"
              required
              defaultChecked
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            {L("সেলার (প্রোডাক্ট দেবেন)", "The seller (you deliver the product)")}
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="buyer"
              required
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            {L("বায়ার (টাকা দেবেন)", "The buyer (you pay)")}
          </label>
        </fieldset>
        <TermsFields template={template} />
        <button type="submit">
          {L("ড্রাফট ডিল তৈরি করুন", "Create draft deal")}
        </button>
      </form>
      <p>
        {L(
          "এতে কোনো টাকা জমা হয় না। সব লেনদেন টেস্ট।",
          "No money is taken by this. Every transaction here is a test.",
        )}
      </p>
    </main>
  );
}
