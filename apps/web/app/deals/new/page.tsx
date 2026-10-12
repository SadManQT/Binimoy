import { TEMPLATES } from "@lp/templates";
import { ERROR_TEXT } from "../../../lib/copy";
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
  const template = TEMPLATES.find((t) => t.templateId === templateId);

  if (!template) {
    return (
      <main>
        <h1>নতুন ডিল: কী ধরনের পণ্য?</h1>
        <p>এখন তিন ধরনের পণ্য চালু আছে। বাকি আটটি পরে যোগ হবে।</p>
        <ul>
          {TEMPLATES.map((t) => (
            <li key={t.templateId}>
              <a href={`/deals/new?template=${t.templateId}`}>{t.name.bn}</a>
            </li>
          ))}
        </ul>
        <p>
          <a href="/deals">ফিরে যান</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>নতুন ডিল: {template.name.bn}</h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      <form action={createDealAction}>
        <fieldset>
          <legend>এই ডিলে আপনি</legend>
          <label>
            <input
              type="radio"
              name="role"
              value="seller"
              required
              defaultChecked
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            বিক্রেতা (পণ্য দেবেন)
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="buyer"
              required
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            ক্রেতা (টাকা দেবেন)
          </label>
        </fieldset>
        <TermsFields template={template} />
        <button type="submit">খসড়া চুক্তি তৈরি করুন</button>
      </form>
      <p>এতে কোনো টাকা জমা হয় না। সব লেনদেন পরীক্ষামূলক (নকল)।</p>
    </main>
  );
}
