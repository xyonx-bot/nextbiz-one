/** Boot work for the Next.js standalone server: token encryption, then the in-app job worker. */
export async function register() {
  // keep the imports inside this condition: the edge build drops the branch instead of bundling Node code
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { encryptStoredIgTokens } = await import("./lib/ig-token");
    await encryptStoredIgTokens()
      .then((n) => { if (n) console.log(`[ig] encrypted ${n} stored token(s)`); })
      .catch((e: Error) => console.error("[ig] token encryption skipped:", e.message));
    if (process.env.JOBS_DISABLED !== "1") {
      const { startWorker } = await import("./lib/jobs");
      startWorker();
    }
  }
}
