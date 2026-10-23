import { SignupForm } from "./SignupForm";

/** P1.1 — Signup: account + access request in one. Gated until operator
 *  approves — the card then shows the pending state (auth wireframe). */
export default function SignupPage() {
  return <div className="authbg"><SignupForm /></div>;
}
