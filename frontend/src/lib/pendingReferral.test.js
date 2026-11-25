import { savePendingReferral, takePendingReferral, whatsappLink, smsLink } from "./pendingReferral";

test("a friend's code survives sign-up once, and junk is ignored", () => {
  savePendingReferral("ab2cde");
  expect(takePendingReferral()).toBe("AB2CDE");
  expect(takePendingReferral()).toBeNull();
  savePendingReferral("../evil");
  expect(takePendingReferral()).toBeNull();
});

test("share links open the messaging app with the invite written", () => {
  expect(whatsappLink("hi there")).toBe("https://wa.me/?text=hi%20there");
  expect(smsLink("hi", ["+44 7700 900123", "07700 900456"])).toBe("sms:+447700900123,07700900456?body=hi");
});
