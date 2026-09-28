const SHUTDOWN_CLOSE_FAILURE = "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED";

function terminalContract(outcome) {
  if (outcome === "success") return Object.freeze({ message: Object.freeze({ type: "stopped" }), exitCode: 0 });
  return Object.freeze({ message: Object.freeze({ type: "failure", code: SHUTDOWN_CLOSE_FAILURE }), exitCode: 1 });
}

async function sendTerminalMessage(processLike, message) {
  if (typeof processLike?.send !== "function" || processLike.connected === false) return;
  await new Promise((accept) => {
    try { processLike.send(message, () => accept()); }
    catch { accept(); }
  });
}

export async function terminateRecoveryAppWorker({ processLike = process, outcome } = {}) {
  const contract = terminalContract(outcome);
  await sendTerminalMessage(processLike, contract.message);
  if (typeof processLike?.disconnect === "function" && processLike.connected !== false) {
    try { processLike.disconnect(); } catch { /* terminal exit remains mandatory */ }
  }
  processLike.exit(contract.exitCode);
}
