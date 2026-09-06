import { defineNitroPlugin } from "nitropack/runtime";
import { env } from "~/lib/env";

/** Loads the configuration at start-up, so a missing key stops the process before it takes a request. */
export default defineNitroPlugin(() => {
  void env;
});
