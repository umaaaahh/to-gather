// A popup's title on the orange pixel ribbon (.px-ribbon in popup.css),
// pinned across the top edge of its card (see .ui-titled). Decoration
// only: the dialog carries the title as its aria-label.
export default function RibbonTitle({ children, className = "" }) {
  return (
    <span className={`px-ribbon ui-ribbon-title ${className}`} aria-hidden="true">
      <span className="px-ribbon__band">{children}</span>
    </span>
  );
}
