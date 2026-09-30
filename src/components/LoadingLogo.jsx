import { ASSETS } from "../lib/assets";
import "./LoadingLogo.css";

// The site's "just a second" indicator: the logo, gently flashing. Used
// wherever something takes a moment — the radio tuning in, a book search,
// the admin list loading. Size and placement come from the className.
export default function LoadingLogo({ className = "", label = "Loading" }) {
  return (
    <img
      className={`loading-logo ${className}`.trim()}
      src={ASSETS.logo}
      alt={label}
      role="status"
    />
  );
}
