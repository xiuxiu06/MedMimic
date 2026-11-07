export function SafetyFooter() {
  return (
    <p className="px-4 pb-6 text-center text-xs text-faint">
      Fictional training case. For education only, not clinical decision-making. If
      you need support, call or text 988 (US).
    </p>
  );
}

export function ContentNote() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn-fg sm:px-8">
      <strong className="font-bold">Content note:</strong>
      <span>
        This case involves depression and suicidal thoughts. Fictional patient, for
        clinical training only.
      </span>
    </div>
  );
}
