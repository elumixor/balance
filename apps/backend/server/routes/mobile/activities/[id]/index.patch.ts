import { z } from "zod";
import { ActivityDTO } from "~/lib/categories/dto";
import { ActivityService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

const weightSchema = z.object({ categoryId: z.string(), weightPercent: z.number() });

export default authed(
  {
    body: {
      name: z.string().trim().min(1),
      weights: z.array(weightSchema),
    },
  },
  async ({ body, router, user }) => {
    const updated = await new ActivityService(user.id).update(router.id, body);
    return { activity: new ActivityDTO(updated) };
  },
);
