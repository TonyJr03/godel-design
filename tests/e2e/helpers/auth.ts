import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

export type QaRole = "admin" | "supervisor" | "worker";

type Credentials = {
  email: string;
  password: string;
};

const credentialPrefixes = {
  admin: "GODEL_TEST_ADMIN",
  supervisor: "GODEL_TEST_SUPERVISOR",
  worker: "GODEL_TEST_WORKER",
} satisfies Record<QaRole, string>;

const managedCredentialPrefixes = {
  admin: "GODEL_MANAGED_TEST_ADMIN",
  supervisor: "GODEL_MANAGED_TEST_SUPERVISOR",
  worker: "GODEL_MANAGED_TEST_WORKER",
} satisfies Record<QaRole, string>;

function readLocalEnv(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

function readManagedEnv(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), "compose.env.local");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));

    if (line) {
      return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return readLocalEnv(name);
}

function getCredentials(role: QaRole): Credentials | null {
  const isManaged = process.env.GODEL_E2E_TARGET === "managed";
  const prefix = isManaged
    ? managedCredentialPrefixes[role]
    : credentialPrefixes[role];
  const readCredential = isManaged ? readManagedEnv : readLocalEnv;
  const email = readCredential(`${prefix}_EMAIL`);
  const password = readCredential(`${prefix}_PASSWORD`);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export async function loginAs(page: Page, role: QaRole) {
  const credentials = getCredentials(role);

  if (!credentials) {
    test.skip(true, `QA credentials for ${role} are not configured.`);
    return;
  }

  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.getByLabel(/correo/i).fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);

  const submitButton = page.getByRole("button", {
    name: /entrar al workspace/i,
  });

  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await expect(page).toHaveURL(/\/dashboard(?:\/)?(?:[?#].*)?$/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", {
      name: /dashboard operativo|mi trabajo asignado/i,
    }),
  ).toBeVisible({ timeout: 20_000 });
}
