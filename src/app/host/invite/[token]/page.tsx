import { HostInviteClient } from "@/components/host-invite-client";
import { isSupabaseConfigured } from "@/lib/env";

type Props = { params: Promise<{ token: string }> };
export default async function HostInvitePage({ params }: Props) {
  const { token } = await params;
  return <HostInviteClient token={token} configured={isSupabaseConfigured()} />;
}
