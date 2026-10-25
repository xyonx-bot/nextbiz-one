/** Auth brand block — Mira's auth wireframe: logo mark + "NextBiz One" wordmark
 *  side by side + tagline line, ABOVE the centered card on every auth page/view
 *  (r-nbo-s3-design-fix fix list A). Markup only — styles live in globals.css
 *  (.auth-brand / .auth-sub, ported 1:1 from the wireframe). */
export function AuthBrand() {
  return (
    <>
      <div className="auth-brand">
        <img src="https://cdn.joyverse.fun/nextbiz-one-transparent.png" alt="" />
        <b>NextBiz One</b>
      </div>
      <div className="auth-sub">WhatsApp-first client platform for small businesses</div>
    </>
  );
}
