// A link that opens in a new tab, with the a11y affordances such links need
// (Issue #9): the security `rel` and a visually-hidden "(opens in new tab)" cue
// so screen-reader and cognitive users aren't surprised by the context switch.
// Consolidates the target/rel pattern that was repeated across every external
// anchor in the app.
export default function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
