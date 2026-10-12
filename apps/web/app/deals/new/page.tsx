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
        <h1>নতুন ডিল: কী ধরনের প্রোডাক্ট?</h1>
        <p>
          এগারো ধরনের প্রোডাক্ট চালু আছে। “টেস্ট” লেখা ধরনগুলোতে প্রোভাইডারের ভেরিফাই একটি
          টেস্ট প্রোভাইডার দিয়ে দেখানো হয়, আসল প্রোভাইডার দিয়ে নয়।
        </p>
        <ul className="index">
          {TEMPLATES.map((t) => (
            <li key={t.templateId}>
              <a
                href={`/deals/new?template=${t.templateId}`}
                data-no={t.categoryId.slice(4)}
              >
                {t.name.bn}
              </a>
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
            সেলার (প্রোডাক্ট দেবেন)
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="buyer"
              required
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            বায়ার (টাকা দেবেন)
          </label>
        </fieldset>
        <TermsFields template={template} />
        <button type="submit">ড্রাফট ডিল তৈরি করুন</button>
      </form>
      <p>এতে কোনো টাকা জমা হয় না। সব লেনদেন টেস্ট।</p>
    </main>
  );
}
