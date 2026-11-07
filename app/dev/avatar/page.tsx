"use client";

import { useEffect, useState } from "react";
import { AVATAR_EMOTIONS, JordanAvatar } from "@/components/JordanAvatar";

// Dev-only preview for tuning the avatar: /dev/avatar
export default function AvatarPreview() {
  const [talk, setTalk] = useState(0);
  const [simulate, setSimulate] = useState(false);
  const [simLevel, setSimLevel] = useState(0);

  useEffect(() => {
    if (!simulate) return;
    const id = setInterval(() => setSimLevel(Math.random() < 0.25 ? 0 : Math.random()), 110);
    return () => clearInterval(id);
  }, [simulate]);

  const level = simulate ? simLevel : talk;

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Jordan avatar preview</h1>

      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-line bg-panel p-5">
        <label className="flex items-center gap-3 text-sm">
          Talk level
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={talk}
            onChange={(e) => setTalk(Number(e.target.value))}
            disabled={simulate}
          />
          <span className="w-10 font-mono">{level.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
          Simulate speaking
        </label>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {AVATAR_EMOTIONS.map((emotion) => (
          <figure key={emotion} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-4">
            <JordanAvatar emotion={emotion} talkLevel={level} size={220} />
            <figcaption className="font-mono text-sm text-muted">{emotion}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
