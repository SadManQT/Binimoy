import { expect, test } from "vitest";
import { facebookTempEmail } from "./auth";

test("a Facebook profile without an email gets a temporary one", () => {
  expect(facebookTempEmail({ id: "123" })).toEqual({
    email: "123@facebook.binimoy.invalid",
  });
});

test("a Facebook profile with an email keeps it", () => {
  expect(facebookTempEmail({ id: "123", email: "a@example.com" })).toEqual({});
});
