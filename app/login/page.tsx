import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

/**
 * Auth trio surface (Mira's auth wireframe) — S0 ships LOGIN only;
 * signup + request-access land in S3 per the locked build order.
 * 420px centered card, flat inputs, cream canvas.
 */
export default function LoginPage() {
  return (
    <div className="authbg">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
