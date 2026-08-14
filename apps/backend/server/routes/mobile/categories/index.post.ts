import { handler } from "@elumixor/nitro-client/server";
import { setResponseStatus } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { CategoryService } from "../../../lib/categories-service";
import { getDbUserForRequest } from "../../../lib/current-user";
import { CategoryDTO } from "../../../lib/dto";

export default handler(
  {
    body: {
      name: z.string().trim().min(1),
      color: z.string().trim().min(1),
      icon: z.string().trim().min(1).optional(),
      targetHoursPerWeek: z.number(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const created = await new CategoryService(user.id).create(body);
      setResponseStatus(event, 201);
      return { category: new CategoryDTO(created) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
