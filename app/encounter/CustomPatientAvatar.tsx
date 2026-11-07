"use client";

import { useId } from "react";
import type { PatientAvatarLook } from "../../lib/scenarios";
import type { Emotion } from "../../lib/types";

type Face = {
  brow: { inner: number; outer: number };
  lid: number;
  gaze: [number, number];
  mouth: { width: number; curve: number; open: number };
  head: { drop: number; tilt: number };
  tears?: boolean;
  blush?: number;
  arms?: boolean;
};

const FACES: Record<Emotion, Face> = {
  neutral: {
    brow: { inner: 0, outer: 0 },
    lid: 0.28,
    gaze: [0, 0],
    mouth: { width: 16, curve: 0, open: 0 },
    head: { drop: 0, tilt: 0 },
  },
  withdrawn: {
    brow: { inner: 1.5, outer: 1 },
    lid: 0.42,
    gaze: [0.9, 0.9],
    mouth: { width: 13, curve: -1, open: 0 },
    head: { drop: 4, tilt: -4 },
    arms: true,
  },
  sad: {
    brow: { inner: -4, outer: 2 },
    lid: 0.45,
    gaze: [0, 0.9],
    mouth: { width: 15, curve: -4.5, open: 0 },
    head: { drop: 5, tilt: 2 },
  },
  tearful: {
    brow: { inner: -6, outer: 3 },
    lid: 0.36,
    gaze: [-0.2, 0.7],
    mouth: { width: 15, curve: -5, open: 0.25 },
    head: { drop: 4, tilt: -2 },
    tears: true,
    blush: 0.22,
  },
  relieved: {
    brow: { inner: -1.5, outer: -1 },
    lid: 0.18,
    gaze: [0, 0],
    mouth: { width: 17, curve: 4.5, open: 0 },
    head: { drop: -1, tilt: 1 },
    blush: 0.25,
  },
  irritable: {
    brow: { inner: 5, outer: -2 },
    lid: 0.3,
    gaze: [-0.8, 0],
    mouth: { width: 13, curve: -2.5, open: 0.04 },
    head: { drop: 0, tilt: 3 },
    arms: true,
  },
};

function darkenHex(hex: string, factor = 0.82): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#3B4252";
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * factor));
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const EYES = [86, 114] as const;
const EYE_Y = 89;
const EYE_RX = 7;
const EYE_RY = 4.6;

export function CustomPatientAvatar({
  look,
  patientName,
  age = 35,
  emotion = "neutral",
  talkLevel = 0,
  size = 224,
  className,
}: {
  look: PatientAvatarLook;
  patientName: string;
  age?: number;
  emotion?: Emotion;
  talkLevel?: number;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const f = FACES[emotion];
  const open = Math.min(
    1,
    f.mouth.open + Math.max(0, Math.min(1, talkLevel)) * 0.9,
  );

  const skinShade = darkenHex(look.skin, 0.86);
  const topDark = darkenHex(look.top, 0.8);

  const mw = f.mouth.width + open * 2;
  const my = 118;
  const ml = 100 - mw / 2;
  const mr = 100 + mw / 2;
  const upper = `M${ml} ${my} Q100 ${my + f.mouth.curve - open * 2} ${mr} ${my}`;
  const mouthShape = `${upper} Q100 ${my + f.mouth.curve + open * 9} ${ml} ${my} Z`;

  const brow = (side: -1 | 1) => {
    const outerX = 100 + side * 30;
    const innerX = 100 + side * 7;
    const y = 76;
    const midX = (outerX + innerX) / 2;
    const midY = y - 3 + (f.brow.inner + f.brow.outer) / 2;
    return `M${outerX} ${y + f.brow.outer} Q${midX} ${midY} ${innerX} ${
      y + f.brow.inner
    }`;
  };

  const lidY = EYE_Y - EYE_RY + f.lid * EYE_RY * 2;
  const lidHalf =
    EYE_RX * Math.sqrt(Math.max(0, 1 - ((lidY - EYE_Y) / EYE_RY) ** 2));

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`${patientName}, ${emotion}`}
      className={className}
    >
      <style>{`
        .cp-${uid}-breathe { animation: cp-breathe 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom; }
        .cp-${uid}-blink { animation: cp-blink 5s infinite; transform-box: fill-box; transform-origin: top; transform: scaleY(0); }
        .cp-${uid}-pose, .cp-${uid}-iris { transition: transform 400ms ease; }
        @keyframes cp-breathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.4px) } }
        @keyframes cp-blink { 0%,94%,100% { transform: scaleY(0) } 96.5% { transform: scaleY(1) } }
        @media (prefers-reduced-motion: reduce) { .cp-${uid}-breathe, .cp-${uid}-blink { animation: none } }
      `}</style>

      <defs>
        {EYES.map((cx, i) => (
          <clipPath key={cx} id={`cp-${uid}-eye${i}`}>
            <ellipse cx={cx} cy={EYE_Y} rx={EYE_RX} ry={EYE_RY} />
          </clipPath>
        ))}
      </defs>

      <rect
        width="200"
        height="200"
        rx="24"
        fill={emotion === "irritable" ? "#261829" : "#1A2640"}
      />

      <g className={`cp-${uid}-breathe`}>
        {/* Back hair layer for long / bun styles */}
        {look.hairStyle === "long" && (
          <path
            d="M55 84 C50 120 52 152 62 164 L138 164 C148 152 150 120 145 84 Z"
            fill={look.hair}
          />
        )}
        {look.hairStyle === "bun" && (
          <circle cx="100" cy="34" r="15" fill={look.hair} />
        )}

        {/* Neck & torso */}
        <rect x="88" y="126" width="24" height="28" fill={skinShade} />
        <path
          d="M28 200 C32 166 58 150 86 148 L114 148 C142 150 168 166 172 200 Z"
          fill={look.top}
        />
        <path
          d="M78 149 Q100 168 122 149"
          fill="none"
          stroke={topDark}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {f.arms && (
          <g>
            <path
              d="M44 200 Q60 170 104 172 L156 176 Q166 182 160 190 L104 188 Q70 188 62 200 Z"
              fill={topDark}
            />
            <path
              d="M156 200 Q140 172 96 178 L44 182 Q34 188 40 196 L96 194 Q130 192 138 200 Z"
              fill={look.top}
            />
            <ellipse cx="160" cy="183" rx="6" ry="5" fill={look.skin} />
            <ellipse cx="40" cy="189" rx="6" ry="5" fill={look.skin} />
          </g>
        )}

        {/* Head pose */}
        <g
          className={`cp-${uid}-pose`}
          style={{
            transform: `translate(0px, ${f.head.drop}px) rotate(${f.head.tilt}deg)`,
            transformOrigin: "100px 130px",
          }}
        >
          <ellipse cx="63" cy="94" rx="5.5" ry="9" fill={skinShade} />
          <ellipse cx="137" cy="94" rx="5.5" ry="9" fill={skinShade} />
          <ellipse cx="100" cy="92" rx="37" ry="45" fill={look.skin} />

          {/* Subtle age lines for 48+ */}
          {age >= 48 && (
            <g stroke={skinShade} strokeWidth="1.2" fill="none" opacity="0.55">
              <path d="M78 110 Q74 117 77 123" />
              <path d="M122 110 Q126 117 123 123" />
              <path d="M85 68 Q100 70 115 68" />
            </g>
          )}

          {/* Facial hair */}
          {look.facialHair === "stubble" && (
            <ellipse
              cx="100"
              cy="121"
              rx="27"
              ry="15"
              fill={look.hair}
              opacity="0.14"
            />
          )}
          {look.facialHair === "beard" && (
            <path
              d="M66 104 C67 128 82 141 100 141 C118 141 133 128 134 104 C126 113 114 114 100 114 C86 114 74 113 66 104 Z"
              fill={look.hair}
              opacity="0.88"
            />
          )}

          {/* Hair styles */}
          {look.hairStyle === "buzz" && (
            <path
              d="M63 85 C62 52 80 40 100 40 C120 40 138 52 137 85 C132 64 118 55 100 55 C82 55 68 64 63 85 Z"
              fill={look.hair}
              opacity="0.88"
            />
          )}
          {look.hairStyle === "short" && (
            <path
              d="M62 90 C56 52 78 36 102 38 C126 36 146 52 138 90 C135 74 129 64 119 59 C113 66 96 67 86 60 C80 66 70 74 62 90 Z"
              fill={look.hair}
            />
          )}
          {look.hairStyle === "curly" && (
            <g fill={look.hair}>
              <circle cx="72" cy="56" r="14" />
              <circle cx="89" cy="46" r="15" />
              <circle cx="110" cy="46" r="15" />
              <circle cx="127" cy="56" r="14" />
              <circle cx="64" cy="73" r="11" />
              <circle cx="136" cy="73" r="11" />
            </g>
          )}
          {(look.hairStyle === "long" || look.hairStyle === "bun") && (
            <path
              d="M61 92 C58 50 78 37 100 37 C122 37 142 50 139 92 C133 70 118 58 100 57 C82 58 67 70 61 92 Z"
              fill={look.hair}
            />
          )}

          {/* Blush / anger flush */}
          {(f.blush || emotion === "irritable") && (
            <>
              <ellipse
                cx="79"
                cy="105"
                rx="8"
                ry="4.5"
                fill="#E48B7A"
                opacity={emotion === "irritable" ? 0.2 : f.blush}
              />
              <ellipse
                cx="121"
                cy="105"
                rx="8"
                ry="4.5"
                fill="#E48B7A"
                opacity={emotion === "irritable" ? 0.2 : f.blush}
              />
            </>
          )}

          {/* Eyes */}
          {EYES.map((cx, i) => (
            <g key={cx}>
              <path
                d={`M${cx - 6} ${EYE_Y + 6.5} Q${cx} ${EYE_Y + 9.5} ${cx + 6} ${
                  EYE_Y + 6.5
                }`}
                stroke={skinShade}
                strokeWidth="1.5"
                fill="none"
                opacity="0.65"
              />
              <g clipPath={`url(#cp-${uid}-eye${i})`}>
                <ellipse
                  cx={cx}
                  cy={EYE_Y}
                  rx={EYE_RX}
                  ry={EYE_RY}
                  fill="#F2EEE8"
                />
                <g
                  className={`cp-${uid}-iris`}
                  style={{
                    transform: `translate(${f.gaze[0] * 3}px, ${
                      f.gaze[1] * 1.8
                    }px)`,
                  }}
                >
                  <circle cx={cx} cy={EYE_Y} r="3.4" fill="#2B1D16" />
                  <circle
                    cx={cx + 1.1}
                    cy={EYE_Y - 1.1}
                    r={f.tears ? 1.3 : 0.8}
                    fill="#fff"
                    opacity="0.9"
                  />
                </g>
                <rect
                  x={cx - EYE_RX - 1}
                  y={EYE_Y - EYE_RY - 1}
                  width={EYE_RX * 2 + 2}
                  height={f.lid * EYE_RY * 2 + 1}
                  fill={look.skin}
                />
                <rect
                  className={`cp-${uid}-blink`}
                  x={cx - EYE_RX - 1}
                  y={EYE_Y - EYE_RY - 1}
                  width={EYE_RX * 2 + 2}
                  height={EYE_RY * 2 + 2}
                  fill={look.skin}
                />
              </g>
              <path
                d={`M${cx - lidHalf} ${lidY} Q${cx} ${lidY - 0.8} ${
                  cx + lidHalf
                } ${lidY}`}
                stroke="#3A2A22"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
              />
              {f.tears && (
                <path
                  d={`M${cx - 3} ${EYE_Y + 6} Q${cx - 5.5} ${EYE_Y + 14} ${
                    cx - 3
                  } ${EYE_Y + 17} Q${cx - 0.5} ${EYE_Y + 14} ${cx - 3} ${
                    EYE_Y + 6
                  } Z`}
                  fill="#8EC5FF"
                  opacity="0.82"
                />
              )}
            </g>
          ))}

          {/* Optional eyeglasses */}
          {look.glasses && (
            <g stroke="#CBD5E1" strokeWidth="1.8" fill="none" opacity="0.9">
              <rect x="75" y="82" width="22" height="14" rx="4" />
              <rect x="103" y="82" width="22" height="14" rx="4" />
              <line x1="97" y1="88" x2="103" y2="88" />
            </g>
          )}

          {/* Brows */}
          <path
            d={brow(-1)}
            stroke={look.hair}
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={brow(1)}
            stroke={look.hair}
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
          />

          {/* Nose */}
          <path
            d="M100 94 Q96.5 104 99.5 106 Q102.5 106.5 104 104"
            stroke={skinShade}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />

          {/* Mouth */}
          {open > 0.02 ? (
            <path
              d={mouthShape}
              fill="#5A2A2A"
              stroke="#A4675B"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d={upper}
              stroke="#A4675B"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </g>
      </g>
    </svg>
  );
}
