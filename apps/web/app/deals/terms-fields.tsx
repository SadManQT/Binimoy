import type { Template } from "@lp/templates";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";

// Shared by "new deal" and "revise": the editable part of the terms.
export async function TermsFields({
  template,
  values,
}: {
  template: Template;
  values?: {
    title: string;
    mode: string;
    amountTaka: string;
    product: Record<string, string>;
    milestones?: { title: string; amountTaka: string }[];
  };
}) {
  const { locale, L } = await getI18n();
  const modes = copyFor(locale).mode;
  return (
    <>
      <input type="hidden" name="templateId" value={template.templateId} />
      <input type="hidden" name="templateVersion" value={template.version} />
      <label>
        {L("ডিলের শিরোনাম", "Deal title")}
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={values?.title}
        />
      </label>
      <label>
        {L(
          "মূল্য (টাকা, যেমন 2500 বা 2500.50; ইংরেজি সংখ্যায়)",
          "Price (taka, such as 2500 or 2500.50; in English digits)",
        )}
        <input
          name="amountTaka"
          required
          inputMode="decimal"
          pattern="[0-9]+(\.[0-9]{1,2})?"
          defaultValue={values?.amountTaka}
        />
      </label>
      <fieldset>
        <legend>{L("সেবার ধরন", "Service mode")}</legend>
        {template.supportedModes.map((mode, index) => (
          <label key={mode}>
            <input
              type="radio"
              name="mode"
              value={mode}
              required
              defaultChecked={values ? values.mode === mode : index === 0}
              style={{ display: "inline", width: "auto", minHeight: 0 }}
            />{" "}
            {modes[mode]?.name ?? mode}
            <br />
            <small>{modes[mode]?.note}</small>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>
          {L("প্রোডাক্টের সঠিক পরিচয়", "Exactly what the product is")}
        </legend>
        {template.fields.map((field) => (
          <label key={field.key}>
            {field.label[locale]}
            <input
              name={`product.${field.key}`}
              required={field.required}
              maxLength={500}
              defaultValue={values?.product[field.key]}
            />
          </label>
        ))}
      </fieldset>
      {template.milestones && (
        <fieldset>
          <legend>
            {L(
              "মাইলস্টোন (প্রতিটির আলাদা দাম; যোগফল মোট মূল্যের সমান হতে হবে)",
              "Milestones (each with its own price; they must add up to the total)",
            )}
          </legend>
          {[0, 1, 2, 3].map((n) => (
            <div key={n}>
              <label>
                {L(
                  `মাইলস্টোন ${n + 1}: কী দেওয়া হবে`,
                  `Milestone ${n + 1}: what will be delivered`,
                )}
                <input
                  name="milestoneTitle"
                  maxLength={120}
                  required={n === 0}
                  defaultValue={values?.milestones?.[n]?.title}
                />
              </label>
              <label>
                {L(
                  `মাইলস্টোন ${n + 1}: দাম (টাকা)`,
                  `Milestone ${n + 1}: price (taka)`,
                )}
                <input
                  name="milestoneTaka"
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  required={n === 0}
                  defaultValue={values?.milestones?.[n]?.amountTaka}
                />
              </label>
            </div>
          ))}
          <p>
            <small>
              {L(
                "একটি মাইলস্টোন গ্রহণ করলে শুধু সেটির টাকা ছাড়ে। ফাঁকা সারি বাদ যাবে।",
                "Accepting a milestone releases only that milestone's money. Empty rows are left out.",
              )}
            </small>
          </p>
        </fieldset>
      )}
    </>
  );
}
