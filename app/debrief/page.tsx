import { AppHeader } from "@/components/AppHeader";
import { DebriefView } from "@/components/debrief/DebriefView";
import { SafetyFooter } from "@/components/SafetyFooter";
import { formatTime } from "@/lib/labels";
import { mockDebrief1, mockOutcome1, mockRun1 } from "@/lib/mock/debrief";

// TODO (after H8 merge): load the real Branch from the engine and the Debrief from /api/debrief.
export default function DebriefPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active="debrief"
        right={
          <span className="text-sm text-muted">
            Run 1 · {formatTime(mockOutcome1.durationSec)}
          </span>
        }
      />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-6">
        <DebriefView branch={mockRun1} debrief={mockDebrief1} outcome={mockOutcome1} />
      </main>
      <SafetyFooter />
    </div>
  );
}
