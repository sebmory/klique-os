import { WorkspaceLanding } from "@/components/app-shell/WorkspaceLanding";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";

export default function TodayPage() {
  return (
    <WorkspaceLanding
      sectionTitle="Aujourd'hui"
      sportsWatchEnabled={isSportsWatchEnabled()}
    />
  );
}
