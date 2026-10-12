import type { Template } from "@lp/templates";
import { MODE_TEXT } from "../../lib/copy";

// Shared by "new deal" and "revise": the editable part of the terms.
export function TermsFields({
  template,
  values,
}: {
  template: Template;
  values?: {
    title: string;
    mode: string;
    amountTaka: string;
    product: Record<string, string>;
  };
}) {
  return (
    <>
      <input type="hidden" name="templateId" value={template.templateId} />
      <input type="hidden" name="templateVersion" value={template.version} />
      <label>
        ডিলের শিরোনাম
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={values?.title}
        />
      </label>
      <label>
        মূল্য (টাকা, যেমন 2500 বা 2500.50; ইংরেজি সংখ্যায়)
        <input
          name="amountTaka"
          required
          inputMode="decimal"
          pattern="[0-9]+(\.[0-9]{1,2})?"
          defaultValue={values?.amountTaka}
        />
      </label>
      <fieldset>
        <legend>সেবার ধরন</legend>
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
            {MODE_TEXT[mode]?.name ?? mode}
            <br />
            <small>{MODE_TEXT[mode]?.note}</small>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>পণ্যের সঠিক পরিচয়</legend>
        {template.fields.map((field) => (
          <label key={field.key}>
            {field.label.bn}
            <input
              name={`product.${field.key}`}
              required={field.required}
              maxLength={500}
              defaultValue={values?.product[field.key]}
            />
          </label>
        ))}
      </fieldset>
    </>
  );
}
