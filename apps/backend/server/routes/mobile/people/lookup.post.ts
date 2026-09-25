import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { PeopleService } from "~/lib/people/service";

/** A name and a picture for an address, from the address book or Gravatar — never an error. */
export default authed({ body: { email: z.string().trim().email() } }, async ({ body, user }) =>
  new PeopleService(user.id).lookup(body.email),
);
