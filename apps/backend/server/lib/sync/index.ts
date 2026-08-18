import { SyncServer } from "@elumixor/synced/server";
import { activitiesModel } from "./activities";
import { categoriesModel } from "./categories";
import { DbMutationLog } from "./mutation-log";

export { activitySchema, type SyncedActivity } from "./activities";
export { categorySchema, type SyncedCategory } from "./categories";

/**
 * Every model `/mobile/sync` speaks for. Adding one here is the whole of adding it to the app:
 * the queue, the retries, the ordering and the client's optimism are already written.
 */
export const syncServer = new SyncServer([categoriesModel, activitiesModel], new DbMutationLog());
