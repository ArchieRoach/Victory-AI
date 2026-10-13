import { CoachMark } from "@/components/CoachMark";

// Kept for existing call sites; now part of the shared coach-mark queue (lib/coachMarks.js).
export function FirstUseTip(props) {
  return <CoachMark {...props} />;
}
