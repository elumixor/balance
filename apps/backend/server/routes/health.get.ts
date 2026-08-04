import { eventHandler } from "h3";

// Not on `/` — that path belongs to the web app's index.html, which this deployment also serves.

export default eventHandler(() => ({ ok: true, service: "balance-backend" }));
