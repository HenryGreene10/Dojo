import { HostGameClient } from "@/components/host-game-client";
import { isSupabaseConfigured } from "@/lib/env";

type Props = { params: Promise<{ gameId: string }> };

export default async function HostGamePage({ params }: Props) {
  const { gameId } = await params;
  return <HostGameClient gameId={gameId} configured={isSupabaseConfigured()} />;
}
