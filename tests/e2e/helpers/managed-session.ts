import { existsSync, readFileSync } from "node:fs";

import type { BrowserContext, Page } from "@playwright/test";

type InfrastructureCookies = Parameters<BrowserContext["addCookies"]>[0];

type ManagedStorageState = {
  cookies: InfrastructureCookies;
};

export function isManagedProductionQa() {
  return process.env.GODEL_MANAGED_PRODUCTION_QA === "1";
}

function readInfrastructureCookies(): InfrastructureCookies {
  const storageStatePath = process.env.GODEL_MANAGED_STORAGE_STATE_PATH;

  if (!storageStatePath) {
    throw new Error("Managed QA infrastructure storage state is required.");
  }

  if (!existsSync(storageStatePath)) {
    throw new Error("Managed QA infrastructure storage state is unavailable.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(storageStatePath, "utf8"));
  } catch {
    throw new Error("Managed QA infrastructure storage state is invalid.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("cookies" in parsed) ||
    !Array.isArray((parsed as ManagedStorageState).cookies) ||
    (parsed as ManagedStorageState).cookies.length === 0
  ) {
    throw new Error("Managed QA infrastructure cookies are required.");
  }

  return (parsed as ManagedStorageState).cookies;
}

export async function resetApplicationSession(page: Page) {
  const context = page.context();

  if (!isManagedProductionQa()) {
    await context.clearCookies();
    return;
  }

  const infrastructureCookies = readInfrastructureCookies();

  await context.clearCookies();
  await context.addCookies(infrastructureCookies);
}
