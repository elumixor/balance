import { authed } from "~/lib/http/authed";
import { ZoomService } from "~/lib/zoom/service";

/** The grant goes. Rooms already made stay in Zoom, and the links already on events still work. */
export default authed(async ({ user }) => new ZoomService(user.id).disconnect());
