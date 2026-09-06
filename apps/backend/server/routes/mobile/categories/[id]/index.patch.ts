import { z } from "zod";
import { CategoryDTO } from "~/lib/categories/dto";
import { CategoryService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(
  {
    body: {
      name: z.string().trim().min(1),
      color: z.string().trim().min(1),
      icon: z.string().trim().min(1).optional(),
      targetHoursPerWeek: z.number(),
    },
  },
  async ({ body, router, user }) => {
    const updated = await new CategoryService(user.id).update(router.id, body);
    return { category: new CategoryDTO(updated) };
  },
);
