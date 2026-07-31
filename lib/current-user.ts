import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function getOrCreateDbUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Not authenticated");

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUser.id),
  });
  if (existing) return existing;

  const [created] = await db.insert(users).values({ clerkId: clerkUser.id }).returning();
  return created;
}
