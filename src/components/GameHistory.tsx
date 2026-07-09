import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { getGameSessions } from "../lib/backend";
import type { GameSession } from "../lib/types";

/**
 * Per-game session history — the FPS Drop Detective's memory. A simple line of
 * avg FPS over past sessions plus the last few runs. Real recorded data only;
 * a session with no captured FPS honestly reads "not measured".
 */
export default function GameHistory({ game }: { game: string }) {
  const [sessions, setSessions] = useState<GameSession[]>([]);

  useEffect(() => {
    void getGameSessions(game).then(setSessions);
  }, [game]);

  if (sessions.length === 0) {
    return (
      <p className="rounded-chip border border-edge bg-card px-3.5 py-3 text-[11.5px] leading-relaxed text-txt2">
        No recorded sessions yet. Play {game} with Mujify open and it'll track your FPS over time here — so if it ever
        drops, the Detective can tell you what changed.
      </p>
    );
  }

  const withFps = sessions.filter((s) => s.avgFps != null);
  const data = withFps.map((s, i) => ({ i, fps: Math.round(s.avgFps as number) }));

  return (
    <div className="flex flex-col gap-2.5">
      {withFps.length >= 2 && (
        <div className="h-24 rounded-chip border border-edge bg-card p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <YAxis domain={["dataMin - 10", "dataMax + 10"]} hide />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                contentStyle={{ background: "#161616", border: "1px solid #1F1F24", borderRadius: 8, fontSize: 11 }}
                labelFormatter={() => ""}
                formatter={(v) => [`${Math.round(Number(v))} FPS avg`, ""]}
              />
              <Line type="monotone" dataKey="fps" stroke="#e3000e" strokeWidth={2} dot={{ r: 2, fill: "#e3000e" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-col gap-1">
        {[...sessions]
          .slice(-5)
          .reverse()
          .map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-chip border border-edge bg-card px-3 py-2 text-[11.5px]">
              <span className="text-txt2">{new Date(s.date).toLocaleDateString()}</span>
              <span className="font-medium text-txt">
                {s.avgFps != null ? `${Math.round(s.avgFps)} FPS avg` : "FPS not measured"}
                {s.bottleneck ? <span className="ml-2 text-[10px] uppercase text-txt3">{s.bottleneck}</span> : null}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
