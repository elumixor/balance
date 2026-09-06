import { IntegrationAccountDTO } from "~/lib/calendar/dto";
import { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import { GOOGLE } from "~/lib/calendar/registry";
import { authed } from "~/lib/http/authed";

/** Connection status only — no token, encrypted or otherwise, ever leaves the backend. */
export default authed(async ({ user }) => {
  const accounts = await new ProviderAccountService(user.id).list(GOOGLE);
  return { integrations: accounts.map((account) => new IntegrationAccountDTO(account)) };
});
