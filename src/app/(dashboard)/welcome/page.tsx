import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WelcomeClient } from "./welcome-client";

export default async function WelcomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // If user already completed onboarding, send them to the store
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true, name: true }
  });

  if (user?.onboardingCompletedAt) {
    redirect("/");
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return <WelcomeClient firstName={firstName} />;
}
