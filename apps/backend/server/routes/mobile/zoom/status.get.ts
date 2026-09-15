import { authed } from "~/lib/http/authed";
import { ZoomService } from "~/lib/zoom/service";

/** Whether Zoom can be used here, and whether it is connected. Never a 401 — see the service. */
export default authed(async ({ user }) => new ZoomService(user.id).status());
