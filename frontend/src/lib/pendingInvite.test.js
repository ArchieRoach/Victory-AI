import { savePendingInvite, takePendingInvite } from "./pendingInvite";

test("an invite is taken once", () => {
  savePendingInvite("abc123def0");
  expect(takePendingInvite()).toBe("abc123def0");
  expect(takePendingInvite()).toBeNull();
});

test("junk in storage is ignored", () => {
  savePendingInvite("../../evil");
  expect(takePendingInvite()).toBeNull();
});
