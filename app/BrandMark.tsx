// The shipped Capitol-dome favicon (app/icon.svg) reused as an inline masthead
// mark (Issue #25) — a small credibility cue that ties the page to the browser
// tab. Decorative beside the wordmark, so aria-hidden; sized by the caller.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="#0f172a" />
      <g fill="#f8fafc">
        <rect x="14.8" y="3.6" width="2.4" height="2.4" rx="0.6" />
        <path d="M7 15 A9 9 0 0 1 25 15 Z" />
        <rect x="5.5" y="15" width="21" height="3" rx="0.6" />
        <rect x="7" y="18.4" width="3" height="6" />
        <rect x="11.7" y="18.4" width="3" height="6" />
        <rect x="17.3" y="18.4" width="3" height="6" />
        <rect x="22" y="18.4" width="3" height="6" />
        <rect x="6.5" y="24.4" width="19" height="2" />
        <rect x="4.8" y="26.4" width="22.4" height="2.4" rx="0.6" />
      </g>
    </svg>
  );
}
