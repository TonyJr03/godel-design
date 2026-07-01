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

function getCredentials(role: QaRole): Credentials | null {
  const prefix = credentialPrefixes[role];
  const email = readLocalEnv(`${prefix}_EMAIL`);
  const password = readLocalEnv(`${prefix}_PASSWORD`);

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

  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(credentials.email);
  await page.getByLabel(/contrase.a|contrasena/i).fill(credentials.password);
  await page.getByRole("button", { name: /entrar al workspace/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
