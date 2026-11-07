"use client";

import { useId } from "react";
import type { Emotion } from "@/lib/types";

/**
 * Jordan's face, drawn in SVG and driven entirely by props.
 * - `emotion` sets brows, eyelids, gaze, mouth, head pose, tears, crossed arms.
 * - `talkLevel` (0–1) opens the mouth: feed it the Live audio volume (RMS) for lip-sync.
 * Fictional character. Idle blink + breathing respect prefers-reduced-motion.
 */

type Face = {
  brow: { inner: number; outer: number }; // y offsets, negative = raised
  lid: number; // 0–0.75: how much of the eye the upper lid covers
  gaze: [number, number]; // iris offset, roughly -1..1
  mouth: { width: number; curve: number; open: number }; // curve > 0 = smile
  head: { drop: number; tilt: number };
  tears?: boolean;
  blush?: number;
  arms?: boolean; // crossed arms (guarded)
};

const FACES: Record<Emotion, Face> = {
  neutral: { brow: { inner: 0, outer: 0 }, lid: 0.28, gaze: [0, 0], mouth: { width: 16, curve: 0, open: 0 }, head: { drop: 0, tilt: 0 } },
  withdrawn: { brow: { inner: 1.5, outer: 1 }, lid: 0.42, gaze: [0.9, 0.9], mouth: { width: 13, curve: -1, open: 0 }, head: { drop: 4, tilt: -4 }, arms: true },
  sad: { brow: { inner: -4, outer: 2 }, lid: 0.45, gaze: [0, 0.9], mouth: { width: 15, curve: -4.5, open: 0 }, head: { drop: 5, tilt: 2 } },
  tearful: { brow: { inner: -6, outer: 3 }, lid: 0.36, gaze: [-0.2, 0.7], mouth: { width: 15, curve: -5, open: 0.25 }, head: { drop: 4, tilt: -2 }, tears: true, blush: 0.22 },
  relieved: { brow: { inner: -1.5, outer: -1 }, lid: 0.18, gaze: [0, 0], mouth: { width: 17, curve: 4.5, open: 0 }, head: { drop: -1, tilt: 1 }, blush: 0.25 },
  irritable: { brow: { inner: 4, outer: -1.5 }, lid: 0.32, gaze: [-1, 0], mouth: { width: 12, curve: -2, open: 0 }, head: { drop: 0, tilt: 3 } },
};

const C = {
  bg: "#1A2640",
  skin: "#E2B895",
  skinShade: "#C99A76",
  hair: "#1B1D24",
  hoodie: "#586173",
  hoodieDark: "#474F5F",
  eyeWhite: "#F2EEE8",
  iris: "#2B1D16",
  lips: "#B5786A",
  mouthIn: "#5A2A2A",
  tear: "#8EC5FF",
  blush: "#E48B7A",
};

const EYES = [86, 114] as const;
const EYE_Y = 89;
const EYE_RX = 7;
const EYE_RY = 4.6;

export function JordanAvatar({
  emotion = "neutral",
  talkLevel = 0,
  size = 240,
  className,
}: {
  emotion?: Emotion;
  talkLevel?: number;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const f = FACES[emotion];
  const open = Math.min(1, f.mouth.open + Math.max(0, Math.min(1, talkLevel)) * 0.9);

  // ---- mouth ----
  const mw = f.mouth.width + open * 2;
  const my = 118;
  const ml = 100 - mw / 2;
  const mr = 100 + mw / 2;
  const upper = `M${ml} ${my} Q100 ${my + f.mouth.curve - open * 2} ${mr} ${my}`;
  const mouthShape = `${upper} Q100 ${my + f.mouth.curve + open * 9} ${ml} ${my} Z`;

  // ---- brows ----
  const brow = (side: -1 | 1) => {
    const outerX = 100 + side * 30;
    const innerX = 100 + side * 7;
    const y = 76;
    const midX = (outerX + innerX) / 2;
    const midY = y - 3 + (f.brow.inner + f.brow.outer) / 2;
    return `M${outerX} ${y + f.brow.outer} Q${midX} ${midY} ${innerX} ${y + f.brow.inner}`;
  };

  // ---- eyelid edge (chord across the eye ellipse at the lid line) ----
  const lidY = EYE_Y - EYE_RY + f.lid * EYE_RY * 2;
  const lidHalf = EYE_RX * Math.sqrt(Math.max(0, 1 - ((lidY - EYE_Y) / EYE_RY) ** 2));

  const label = `Jordan, ${emotion}${talkLevel > 0.05 ? ", speaking" : ""}`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <style>{`
        .mm-${uid}-breathe { animation: mm-breathe 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom; }
        .mm-${uid}-blink { animation: mm-blink 5s infinite; transform-box: fill-box; transform-origin: top; transform: scaleY(0); }
        .mm-${uid}-pose, .mm-${uid}-iris { transition: transform 450ms ease; }
        @keyframes mm-breathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.4px) } }
        @keyframes mm-blink { 0%,94%,100% { transform: scaleY(0) } 96.5% { transform: scaleY(1) } }
        @media (prefers-reduced-motion: reduce) { .mm-${uid}-breathe, .mm-${uid}-blink { animation: none } }
      `}</style>

      <defs>
        {EYES.map((cx, i) => (
          <clipPath key={cx} id={`mm-${uid}-eye${i}`}>
            <ellipse cx={cx} cy={EYE_Y} rx={EYE_RX} ry={EYE_RY} />
          </clipPath>
        ))}
      </defs>

      <rect width="200" height="200" rx="24" fill={C.bg} />

      <g className={`mm-${uid}-breathe`}>
        {/* body */}
        <rect x="88" y="126" width="24" height="28" fill={C.skinShade} />
        <path d="M28 200 C32 166 58 150 86 148 L114 148 C142 150 168 166 172 200 Z" fill={C.hoodie} />
        <path d="M78 149 Q100 168 122 149" fill="none" stroke={C.hoodieDark} strokeWidth="6" strokeLinecap="round" />
        <path d="M93 160 L91 182 M107 160 L109 182" stroke="#C9CED8" strokeWidth="1.6" strokeLinecap="round" />
        {f.arms && (
          <g>
            <path d="M44 200 Q60 170 104 172 L156 176 Q166 182 160 190 L104 188 Q70 188 62 200 Z" fill={C.hoodieDark} />
            <path d="M156 200 Q140 172 96 178 L44 182 Q34 188 40 196 L96 194 Q130 192 138 200 Z" fill={C.hoodie} />
            <ellipse cx="160" cy="183" rx="6" ry="5" fill={C.skin} />
            <ellipse cx="40" cy="189" rx="6" ry="5" fill={C.skin} />
          </g>
        )}

        {/* head (pose) */}
        <g
          className={`mm-${uid}-pose`}
          style={{ transform: `translate(0px, ${f.head.drop}px) rotate(${f.head.tilt}deg)`, transformOrigin: "100px 130px" }}
        >
          <ellipse cx="63" cy="94" rx="5.5" ry="9" fill={C.skinShade} />
          <ellipse cx="137" cy="94" rx="5.5" ry="9" fill={C.skinShade} />
          <ellipse cx="100" cy="92" rx="37" ry="45" fill={C.skin} />
          {/* stubble */}
          <ellipse cx="100" cy="121" rx="27" ry="15" fill="#3A3A40" opacity="0.1" />

          {/* hair */}
          <path
            d="M62 90 C56 52 78 36 102 38 C126 36 146 52 138 90 C135 74 129 64 119 59 C113 66 96 67 86 60 C80 66 70 74 62 90 Z"
            fill={C.hair}
          />
          <path d="M84 42 L76 33 L92 39 M100 38 L98 28 L108 37 M116 40 L125 32 L122 44" fill={C.hair} stroke={C.hair} strokeWidth="3" strokeLinejoin="round" />

          {/* blush */}
          {f.blush ? (
            <>
              <ellipse cx="79" cy="105" rx="8" ry="4.5" fill={C.blush} opacity={f.blush} />
              <ellipse cx="121" cy="105" rx="8" ry="4.5" fill={C.blush} opacity={f.blush} />
            </>
          ) : null}

          {/* eyes */}
          {EYES.map((cx, i) => (
            <g key={cx}>
              <path d={`M${cx - 6} ${EYE_Y + 6.5} Q${cx} ${EYE_Y + 9.5} ${cx + 6} ${EYE_Y + 6.5}`} stroke="#A9806A" strokeWidth="1.5" fill="none" opacity="0.5" />
              <g clipPath={`url(#mm-${uid}-eye${i})`}>
                <ellipse cx={cx} cy={EYE_Y} rx={EYE_RX} ry={EYE_RY} fill={C.eyeWhite} />
                <g className={`mm-${uid}-iris`} style={{ transform: `translate(${f.gaze[0] * 3}px, ${f.gaze[1] * 1.8}px)` }}>
                  <circle cx={cx} cy={EYE_Y} r="3.4" fill={C.iris} />
                  <circle cx={cx + 1.1} cy={EYE_Y - 1.1} r={f.tears ? 1.3 : 0.8} fill="#fff" opacity="0.9" />
                </g>
                {/* upper lid */}
                <rect x={cx - EYE_RX - 1} y={EYE_Y - EYE_RY - 1} width={EYE_RX * 2 + 2} height={f.lid * EYE_RY * 2 + 1} fill={C.skin} />
                {/* blink */}
                <rect className={`mm-${uid}-blink`} x={cx - EYE_RX - 1} y={EYE_Y - EYE_RY - 1} width={EYE_RX * 2 + 2} height={EYE_RY * 2 + 2} fill={C.skin} />
              </g>
              <path d={`M${cx - lidHalf} ${lidY} Q${cx} ${lidY - 0.8} ${cx + lidHalf} ${lidY}`} stroke="#3A2A22" strokeWidth="1.3" fill="none" strokeLinecap="round" />
              {f.tears && (
                <>
                  <path d={`M${cx - 6} ${EYE_Y + 4.5} Q${cx} ${EYE_Y + 6.5} ${cx + 6} ${EYE_Y + 4.5}`} stroke={C.tear} strokeWidth="1.2" fill="none" opacity="0.8" />
                  <path d={`M${cx - 3} ${EYE_Y + 6} Q${cx - 5.5} ${EYE_Y + 14} ${cx - 3} ${EYE_Y + 17} Q${cx - 0.5} ${EYE_Y + 14} ${cx - 3} ${EYE_Y + 6} Z`} fill={C.tear} opacity="0.8" />
                </>
              )}
            </g>
          ))}

          {/* brows */}
          <path d={brow(-1)} stroke={C.hair} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d={brow(1)} stroke={C.hair} strokeWidth="3.4" fill="none" strokeLinecap="round" />

          {/* nose */}
          <path d="M100 94 Q96.5 104 99.5 106 Q102.5 106.5 104 104" stroke={C.skinShade} strokeWidth="1.8" fill="none" strokeLinecap="round" />

          {/* mouth */}
          {open > 0.02 ? (
            <path d={mouthShape} fill={C.mouthIn} stroke={C.lips} strokeWidth="1.6" strokeLinejoin="round" />
          ) : (
            <path d={upper} stroke={C.lips} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          )}
        </g>
      </g>
    </svg>
  );
}

export const AVATAR_EMOTIONS = Object.keys(FACES) as Emotion[];
