import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DojoMark } from "@/components/dojo-mark";
import { InviteClient } from "@/components/invite-client";
import { demoGame } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { PublicGame } from "@/lib/types";

type Props = { params: Promise<{ inviteCode: string }> };

async function loadGame(inviteCode: string) {
  if (inviteCode === "demo") return demoGame;
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_game", { p_invite_code: inviteCode });
  return (data ?? null) as PublicGame | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { inviteCode } = await params;
  const game = await loadGame(inviteCode);
  if (!game) return { title: "Game not found" };

  const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(game.startsAt));
  return {
    title: game.title,
    description: `${game.hostName} is hosting · ${date} · ${game.seatedCount} of ${game.capacity} seats taken`,
    openGraph: {
      title: `🀄 ${game.title}`,
      description: `${game.hostName} is hosting · ${date} · ${game.seatedCount} of ${game.capacity} seats taken`,
      type: "website",
    },
  };
}

export default async function GameInvitePage({ params }: Props) {
  const { inviteCode } = await params;
  const game = await loadGame(inviteCode);
  if (!game) notFound();

  return (
    <main className="invite-page">
      <div className="invite-wrap">
        <nav className="invite-nav"><DojoMark /></nav>
        <InviteClient initialGame={game} demo={inviteCode === "demo"} />
      </div>
    </main>
  );
}
