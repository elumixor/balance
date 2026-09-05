import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { clerkClient, getDbUserForRequest } from "../../../../lib/current-user";

/**
 * Who this account is, as the sign-in provider knows them: the name and the picture Google or
 * Apple handed over. Read here rather than off the browser's Clerk session because the two
 * shells that skip that session — a simulator on `DEV_AUTH_EMAIL`, a watch — have no other way
 * to ask, and a face that shows on one device and not another reads as a bug.
 */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const account = await clerkClient.users.getUser(user.clerkId);
    return {
      name: account.fullName ?? "",
      email: account.primaryEmailAddress?.emailAddress ?? "",
      imageUrl: account.hasImage ? account.imageUrl : "",
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});
