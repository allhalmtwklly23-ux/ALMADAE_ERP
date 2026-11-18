import { connection } from "next/server";
import { Customer360Workspace } from "@/components/customer-360-workspace";

export const instant = false;

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <Customer360Workspace customerId={id} />;
}
