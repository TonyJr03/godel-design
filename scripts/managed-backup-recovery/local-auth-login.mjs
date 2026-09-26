import { createClient } from "@supabase/supabase-js";

import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { assertExpectedRestoredUser } from "./restore-validation.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalAuthLoginError";
  error.code = code;
  throw error;
}

export async function performLocalAuthLogin({ localStatus, loginExpectation, credentials, createSupabaseClient = createClient } = {}) {
  if (!credentials || Object.keys(credentials).length !== 2 || typeof credentials.identifier !== "string" || typeof credentials.password !== "string" || credentials.identifier.length === 0 || credentials.password.length === 0) fail("RECOVERY_LOGIN_CREDENTIALS_INVALID", "In-memory recovery login credentials are required");
  let runtime;
  accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; });
  const client = createSupabaseClient(runtime.API_URL, runtime.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const login = credentials.identifier.includes("@") ? { email: credentials.identifier, password: credentials.password } : { phone: credentials.identifier, password: credentials.password };
  let result;
  try { result = await client.auth.signInWithPassword(login); } catch { fail("RECOVERY_AUTH_LOGIN_FAILED", "Local recovery Auth login failed"); }
  if (result?.error || !result?.data?.session || !result?.data?.user || typeof result.data.user.id !== "string") fail("RECOVERY_AUTH_LOGIN_FAILED", "Local recovery Auth login failed");
  assertExpectedRestoredUser(loginExpectation, result.data.user.id);
  return Object.freeze({ status: "PASS" });
}
