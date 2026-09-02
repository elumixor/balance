import { SyncServer } from "@elumixor/synced/server";
import { activitiesModel } from "./activities";
import { categoriesModel } from "./categories";
import { gateEventsModel } from "./gate-events";
import { goalsModel } from "./goals";
import { DbMutationLog } from "./mutation-log";
import { practicesModel } from "./practices";
import { projectsModel } from "./projects";
import { stagesModel } from "./stages";
import { tasksModel } from "./tasks";

export { activitySchema, type SyncedActivity } from "./activities";
export { categorySchema, type SyncedCategory } from "./categories";
export { gateEventSchema, type SyncedGateEvent } from "./gate-events";
export { goalSchema, type SyncedGoal } from "./goals";
export { practiceSchema, type SyncedPractice } from "./practices";
export { projectSchema, type SyncedProject } from "./projects";
export { type SyncedStage, stageSchema } from "./stages";
export { type SyncedTask, taskSchema } from "./tasks";

/**
 * Every model `/mobile/sync` speaks for. Adding one here is the whole of adding it to the app:
 * the queue, the retries, the ordering and the client's optimism are already written.
 */
export const syncServer = new SyncServer(
  [
    categoriesModel,
    activitiesModel,
    goalsModel,
    practicesModel,
    projectsModel,
    stagesModel,
    tasksModel,
    gateEventsModel,
  ],
  new DbMutationLog(),
);
