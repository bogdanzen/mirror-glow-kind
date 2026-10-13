import { describe, expect, it } from "vitest";
import { dailySeries, hourlyStarts, type MirrorEventRow } from "./metrics";

const row = (session: string, event: string, at: string): MirrorEventRow => ({ session_id: session, event, created_at: at, device: "kiosk", kiosk: null });

describe("daily report", () => {
  it("counts sessions per day and fills empty days", () => {
    const rows = [
      row("a", "start", "2026-10-10T10:00:00"), row("a", "final", "2026-10-10T10:02:00"), row("a", "donate_click", "2026-10-10T10:03:00"),
      row("b", "start", "2026-10-12T15:00:00"),
    ];
    const days = dailySeries(rows);
    expect(days.map((d) => d.day)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(days[0]!).toMatchObject({ sessions: 1, final: 1, donations: 1 });
    expect(days[1]!.sessions).toBe(0);
    expect(days[2]!.sessions).toBe(1);
  });
  it("buckets starts by hour", () => {
    expect(hourlyStarts([row("a", "start", "2026-10-10T15:20:00")])[15]!.sessions).toBe(1);
  });
});
