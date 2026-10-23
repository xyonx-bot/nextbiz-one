/** S2: boot the in-app job worker with the Next.js standalone server. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.JOBS_DISABLED !== "1") {
    const { startWorker } = await import("./lib/jobs");
    startWorker();
  }
}
