import { redirect } from "next/navigation";

interface DeploymentPageProps {
  params: Promise<{ id: string }>;
}

export default async function DeploymentPage({ params }: DeploymentPageProps) {
  const { id } = await params;
  redirect(`/apps/${id}`);
}
