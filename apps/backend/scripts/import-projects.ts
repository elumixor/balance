/**
 * One-time import of the projects that used to live in Notion — a card each, with a link back to
 * the page, and nothing that syncs. Run once, then stop opening Notion.
 *
 *   cd apps/backend && bun scripts/import-projects.ts [scripts/projects.json] [--user email]
 *
 * The account is `--user`, or `DEV_AUTH_EMAIL` from `.env`. A project is matched by name, so
 * running the manifest twice updates the link and description rather than making a second card.
 * The sphere is matched by category name on the ring, case-insensitively, and has to exist.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { categories, projects, users } from "../server/db/schema";
import { clerkClient } from "../server/lib/auth/service";
import { env } from "../server/lib/env";
import { projectTemplateSchema } from "../server/lib/sync/projects";

interface Manifest {
  name: string;
  sphere: string;
  template?: string;
  description?: string;
  notion?: string;
  hoursPerWeek?: number;
  people?: string[];
  links?: { label: string; url: string }[];
}

const args = process.argv.slice(2);
const userFlag = args.indexOf("--user");
const email = (userFlag >= 0 ? args[userFlag + 1] : undefined) ?? env.DEV_AUTH_EMAIL;
const manifestPath = args.find((a) => a.endsWith(".json")) ?? "scripts/projects.json";
if (!email) throw new Error("Pass --user <email> or set DEV_AUTH_EMAIL");

const page = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
const clerkId = page.data[0]?.id;
if (!clerkId) throw new Error(`${email} is not a Clerk user`);
const user = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
if (!user) throw new Error(`${email} has never opened the app`);

const manifest: Manifest[] = await Bun.file(manifestPath).json();
const spheres = await db.query.categories.findMany({
  where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
});

for (const entry of manifest) {
  const sphere = spheres.find((c) => c.name.trim().toLowerCase() === entry.sphere.trim().toLowerCase());
  if (!sphere) {
    console.warn(`skip ${entry.name}: no sphere named "${entry.sphere}" on the ring`);
    continue;
  }
  const links = [...(entry.links ?? []), ...(entry.notion ? [{ label: "notion", url: entry.notion }] : [])];
  const values = {
    categoryId: sphere.id,
    description: entry.description ?? "",
    template: projectTemplateSchema.catch("simple").parse(entry.template ?? "simple"),
    hoursPerWeek: String(entry.hoursPerWeek ?? 0),
    people: entry.people ?? [],
    links,
    updatedAt: new Date(),
  };
  const existing = await db.query.projects.findFirst({
    where: and(eq(projects.userId, user.id), eq(projects.name, entry.name)),
  });
  if (existing) {
    await db.update(projects).set(values).where(eq(projects.id, existing.id));
    console.log(`updated ${entry.name}`);
  } else {
    await db.insert(projects).values({ userId: user.id, name: entry.name, ...values });
    console.log(`imported ${entry.name}`);
  }
}
console.log("done — the app pulls them on its next sync");
