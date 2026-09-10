import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Which of the workspace's databases holds the projects. Everything else is found from there. */
export default authed({ body: { dataSourceId: z.string().trim().min(1) } }, async ({ body, user }) =>
  new NotionService(user.id).chooseDataSource(body.dataSourceId),
);
