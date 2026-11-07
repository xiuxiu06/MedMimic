// Stand-in until the Gemini-generated portraits land in /public/portraits.
export function PortraitPlaceholder({
  label,
  size = 160,
}: {
  label: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-[20px] border border-dashed border-line-2 bg-panel-2"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-muted"
        role="img"
        aria-label={`Patient portrait placeholder, ${label}`}
      >
        <circle cx="50" cy="38" r="20" />
        <path d="M18 92c4-18 16-28 32-28s28 10 32 28" />
        <path d="M40 37h7M53 37h7" />
        <path d="M44 49h12" />
      </svg>
      <span className="text-[11px] text-muted">Portrait · {label}</span>
    </div>
  );
}
