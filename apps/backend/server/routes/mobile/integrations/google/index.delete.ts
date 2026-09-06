import { z } from "zod";
import { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import { authed } from "~/lib/http/authed";

export default authed({ body: { accountId: z.string() } }, async ({ body, user }) => {
  await new ProviderAccountService(user.id).disconnect(body.accountId);
  return { ok: true };
});
