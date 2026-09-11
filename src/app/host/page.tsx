import { HostClient } from "@/components/host-client";
import { isSupabaseConfigured } from "@/lib/env";

export default function HostPage() {
  return <HostClient configured={isSupabaseConfigured()} />;
}
