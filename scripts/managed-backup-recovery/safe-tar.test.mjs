import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractSafeTarArchive, inspectSafeTarArchive } from "./safe-tar.mjs";
import { tarBuffer } from "./test-helpers.mjs";

async function archive(entries) {
  const root = await mkdtemp(join(tmpdir(), "godel-safe-tar-"));
  const pathname = join(root, "fixture.tar");
  await writeFile(pathname, tarBuffer(entries));
  return { root, pathname };
}

test("safe tar admits regular files/directories and extracts only after inspection", async () => {
  const fixture = await archive([
    { name: "./", type: "5" },
    { name: "./database/", type: "5" },
    { name: "./database/managed-data.sql", type: "0", content: "COPY public.example (id) FROM stdin;\n1\n\\.\n" },
  ]);
  const inspection = await inspectSafeTarArchive(fixture.pathname);
  assert.equal(inspection.verified, true);
  const destination = join(fixture.root, "plain");
  await mkdir(destination);
  assert.deepEqual(await extractSafeTarArchive({ archivePath: fixture.pathname, destination, inspection }), { verified: true, fileCount: 1 });
  assert.match(await readFile(join(destination, "database", "managed-data.sql"), "utf8"), /^COPY/);
});

const malicious = [
  ["absolute path", [{ name: "/absolute.txt", type: "0", content: "x" }], "RECOVERY_ARCHIVE_PATH_UNSAFE"],
  ["parent traversal", [{ name: "../escape.txt", type: "0", content: "x" }], "RECOVERY_ARCHIVE_PATH_UNSAFE"],
  ["nested traversal", [{ name: "safe/../escape.txt", type: "0", content: "x" }], "RECOVERY_ARCHIVE_PATH_UNSAFE"],
  ["backslash traversal", [{ name: "safe\\..\\escape.txt", type: "0", content: "x" }], "RECOVERY_ARCHIVE_PATH_UNSAFE"],
  ["duplicate normalized path", [{ name: "file.txt", type: "0", content: "x" }, { name: "./file.txt", type: "0", content: "x" }], "RECOVERY_ARCHIVE_DUPLICATE_ENTRY"],
  ["symlink", [{ name: "link", type: "2", linkName: "target" }], "RECOVERY_ARCHIVE_SYMLINK_FORBIDDEN"],
  ["hardlink", [{ name: "link", type: "1", linkName: "target" }], "RECOVERY_ARCHIVE_HARDLINK_FORBIDDEN"],
  ["character device", [{ name: "device", type: "3" }], "RECOVERY_ARCHIVE_SPECIAL_TYPE_FORBIDDEN"],
  ["FIFO", [{ name: "fifo", type: "6" }], "RECOVERY_ARCHIVE_SPECIAL_TYPE_FORBIDDEN"],
  ["socket/unknown special type", [{ name: "socket", type: "s" }], "RECOVERY_ARCHIVE_SPECIAL_TYPE_FORBIDDEN"],
];

for (const [label, entries, code] of malicious) {
  test(`safe tar rejects ${label} before extraction`, async () => {
    const fixture = await archive(entries);
    await assert.rejects(inspectSafeTarArchive(fixture.pathname), (error) => error.code === code);
  });
}

test("safe tar rejects file/directory hierarchy conflicts", async () => {
  const fixture = await archive([
    { name: "parent", type: "0", content: "x" },
    { name: "parent/child", type: "0", content: "x" },
  ]);
  await assert.rejects(inspectSafeTarArchive(fixture.pathname), (error) => error.code === "RECOVERY_ARCHIVE_PATH_CONFLICT");
});

test("safe tar detects archive replacement between inspection and extraction", async () => {
  const fixture = await archive([{ name: "file.txt", type: "0", content: "first" }]);
  const inspection = await inspectSafeTarArchive(fixture.pathname);
  await writeFile(fixture.pathname, tarBuffer([{ name: "file.txt", type: "0", content: "second" }]));
  const destination = join(fixture.root, "plain");
  await mkdir(destination);
  await assert.rejects(extractSafeTarArchive({ archivePath: fixture.pathname, destination, inspection }), (error) => error.code === "RECOVERY_ARCHIVE_CHANGED");
});
