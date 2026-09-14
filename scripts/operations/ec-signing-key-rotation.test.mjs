import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import {
  buildEcRotationPlan,
  generateEphemeralEcSigningPair,
  parseEcRotationEnvironmentSnapshot,
  signAsymmetricTranslationJwt,
  validateEcRotationStage,
  validateEcRotationTransition,
  validateGen4Source,
} from "./ec-signing-key-rotation.mjs";

const NOW = 1_800_000_000;

function legacyJwt(secret, role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, iss: "supabase", iat: NOW, exp: NOW + 300 })).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
}

function render(values) { return Buffer.from([...values.entries()].map(([name, value]) => `${name}=${value}`).join("\n") + "\n"); }
function values(snapshot) { return new Map(Buffer.from(snapshot).toString("utf8").trim().split("\n").map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])); }
function withValue(snapshot, name, value) { const copy = values(snapshot); copy.set(name, value); return render(copy); }
function keysets(snapshot) { const source = values(snapshot); return { keys: JSON.parse(source.get("JWT_KEYS")), jwks: JSON.parse(source.get("JWT_JWKS")) }; }
function withKeysets(snapshot, keys, jwks) { let result = withValue(snapshot, "JWT_KEYS", JSON.stringify(keys)); return withValue(result, "JWT_JWKS", JSON.stringify(jwks)); }

function sourceGen4() {
  const pair = generateEphemeralEcSigningPair();
  const secret = randomBytes(32).toString("base64");
  const oct = { kty: "oct", k: Buffer.from(secret).toString("base64url"), alg: "HS256" };
  return render(new Map([
    ["POSTGRES_PASSWORD", "stable-postgres-value"], ["JWT_SECRET", secret], ["ANON_KEY", legacyJwt(secret, "anon")], ["SERVICE_ROLE_KEY", legacyJwt(secret, "service_role")],
    ["SUPABASE_PUBLISHABLE_KEY", "sb_publishable_stable"], ["SUPABASE_SECRET_KEY", "sb_secret_stable"], ["DASHBOARD_PASSWORD", "stable-dashboard-value"], ["SECRET_KEY_BASE", "stable-secret-key-base"], ["REALTIME_DB_ENC_KEY", "stable-realtime-key"], ["VAULT_ENC_KEY", "stable-vault-key"], ["PG_META_CRYPTO_KEY", "stable-meta-key"],
    ["JWT_KEYS", JSON.stringify([pair.privateJwk, oct])], ["JWT_JWKS", JSON.stringify({ keys: [pair.publicJwk, oct] })], ["ANON_KEY_ASYMMETRIC", signAsymmetricTranslationJwt({ privateKey: pair.privateJwk, role: "anon", now: NOW })], ["SERVICE_ROLE_KEY_ASYMMETRIC", signAsymmetricTranslationJwt({ privateKey: pair.privateJwk, role: "service_role", now: NOW })],
  ]));
}

function plan() { const gen4 = sourceGen4(); return { gen4, ...buildEcRotationPlan(gen4, { now: NOW }) }; }
function ids(gen4, gen5) { return { oldKid: validateGen4Source(gen4).oldKid, newKid: keysets(gen5).keys.find((key) => key.kty === "EC" && !Object.hasOwn(key, "d")).kid }; }
function expectReject(fn, code) { assert.throws(fn, new RegExp(code)); }

test("uses strict assignment parsing and ignores comments or non-assignment lines containing equals", () => {
  const parsed = parseEcRotationEnvironmentSnapshot(Buffer.from("\n# EXAMPLE=value-one\n# EXAMPLE=value-two\n# description: foo=bar\nVALID=value\nnot a variable=value\n"));
  assert.deepEqual([...parsed], [["VALID", "value"]]);
  expectReject(() => parseEcRotationEnvironmentSnapshot(Buffer.from("REAL=value-one\nREAL=value-two\n")), "DUPLICATE_ENVIRONMENT_VARIABLE");
});

test("validates GEN4 and builds the complete in-memory plan", () => {
  const { gen4, gen5Snapshot, gen6Snapshot, gen7Snapshot, sanitizedMetadata } = plan();
  const { oldKid, newKid } = ids(gen4, gen5Snapshot);
  assert.equal(validateGen4Source(gen4).oldKid, oldKid);
  assert.deepEqual(sanitizedMetadata.ecPublicCounts, [1, 2, 2, 1]);
  assert.deepEqual(validateEcRotationStage(gen5Snapshot, { stage: "GEN5", oldKid, newKid }), { stage: "GEN5", signerIsOld: true, ecKeyCount: 2, publicEcCount: 2 });
  assert.equal(validateEcRotationStage(gen6Snapshot, { stage: "GEN6", oldKid, newKid }).signerIsOld, false);
  assert.equal(validateEcRotationStage(gen7Snapshot, { stage: "GEN7", oldKid, newKid }).ecKeyCount, 1);
});

test("preserves the same NEW pair, legacy family, opaque keys, and required token relationships", () => {
  const { gen4, gen5Snapshot, gen6Snapshot, gen7Snapshot } = plan();
  const gen4Values = values(gen4), gen5Values = values(gen5Snapshot), gen6Values = values(gen6Snapshot), gen7Values = values(gen7Snapshot);
  const { newKid } = ids(gen4, gen5Snapshot);
  for (const name of ["JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) assert.equal(gen4Values.get(name), gen7Values.get(name));
  assert.equal(gen4Values.get("ANON_KEY_ASYMMETRIC"), gen5Values.get("ANON_KEY_ASYMMETRIC"));
  assert.equal(gen4Values.get("SERVICE_ROLE_KEY_ASYMMETRIC"), gen5Values.get("SERVICE_ROLE_KEY_ASYMMETRIC"));
  assert.notEqual(gen5Values.get("ANON_KEY_ASYMMETRIC"), gen6Values.get("ANON_KEY_ASYMMETRIC"));
  assert.equal(gen6Values.get("ANON_KEY_ASYMMETRIC"), gen7Values.get("ANON_KEY_ASYMMETRIC"));
  assert.equal(gen6Values.get("SERVICE_ROLE_KEY_ASYMMETRIC"), gen7Values.get("SERVICE_ROLE_KEY_ASYMMETRIC"));
  assert.equal(keysets(gen5Snapshot).keys.find((key) => key.kty === "EC" && !Object.hasOwn(key, "d")).kid, newKid);
  assert.equal(keysets(gen6Snapshot).keys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d")).kid, newKid);
  assert.equal(keysets(gen7Snapshot).keys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d")).kid, newKid);
  assert.deepEqual(JSON.parse(gen5Values.get("JWT_JWKS")), JSON.parse(gen6Values.get("JWT_JWKS")));
  assert.equal(keysets(gen4).keys.find((key) => key.kty === "oct").k, keysets(gen7Snapshot).keys.find((key) => key.kty === "oct").k);
});

test("accepts only adjacent forward and reverse rollback relations", () => {
  const { gen4, gen5Snapshot, gen6Snapshot, gen7Snapshot } = plan();
  const { oldKid, newKid } = ids(gen4, gen5Snapshot);
  for (const [fromSnapshot, toSnapshot, fromStage, toStage] of [[gen4, gen5Snapshot, "GEN4", "GEN5"], [gen5Snapshot, gen6Snapshot, "GEN5", "GEN6"], [gen6Snapshot, gen7Snapshot, "GEN6", "GEN7"], [gen5Snapshot, gen4, "GEN5", "GEN4"], [gen6Snapshot, gen5Snapshot, "GEN6", "GEN5"], [gen7Snapshot, gen6Snapshot, "GEN7", "GEN6"]]) assert.equal(validateEcRotationTransition({ fromSnapshot, toSnapshot, fromStage, toStage, oldKid, newKid }), true);
  for (const [fromSnapshot, toSnapshot, fromStage, toStage] of [[gen6Snapshot, gen4, "GEN6", "GEN4"], [gen7Snapshot, gen4, "GEN7", "GEN4"], [gen7Snapshot, gen5Snapshot, "GEN7", "GEN5"]]) expectReject(() => validateEcRotationTransition({ fromSnapshot, toSnapshot, fromStage, toStage, oldKid, newKid }), "UNSAFE_EC_ROTATION_TRANSITION");
});

test("rejects invalid signer, key, legacy, and stage contracts", () => {
  const { gen4, gen5Snapshot, gen6Snapshot, gen7Snapshot } = plan();
  const { oldKid, newKid } = ids(gen4, gen5Snapshot);
  const g5 = keysets(gen5Snapshot), g6 = keysets(gen6Snapshot), g7 = keysets(gen7Snapshot);
  const twoSigners = structuredClone(g5.keys); twoSigners[1] = { ...twoSigners[1], d: generateEphemeralEcSigningPair().privateJwk.d, key_ops: ["sign", "verify"] };
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, twoSigners, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_SIGNER_COUNT");
  const zeroSigners = structuredClone(g5.keys); zeroSigners[0].key_ops = ["verify"];
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, zeroSigners, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_SIGNER_COUNT");
  const duplicateKid = structuredClone(g5.jwks.keys); duplicateKid[1].kid = duplicateKid[0].kid;
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, g5.keys, { keys: duplicateKid }), { stage: "GEN5", oldKid, newKid }), "DUPLICATE_EC_KID");
  const leaked = structuredClone(g5.jwks.keys); leaked[0].d = "not-allowed";
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, g5.keys, { keys: leaked }), { stage: "GEN5", oldKid, newKid }), "EC_PRIVATE_MATERIAL_IN_JWKS");
  const verifyHasD = structuredClone(g5.keys); verifyHasD[1].d = "not-allowed";
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, verifyHasD, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_EC_PRIVATE_MATERIAL");
  const verifySigns = structuredClone(g5.keys); verifySigns[1].key_ops = ["sign", "verify"];
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, verifySigns, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_SIGNER_COUNT");
  const wrongCurve = structuredClone(g5.keys); wrongCurve[1].crv = "P-384";
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, wrongCurve, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_EC_JWK");
  const wrongAlg = structuredClone(g5.keys); wrongAlg[1].alg = "ES384";
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, wrongAlg, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_EC_JWK");
  const gen5NewMismatch = structuredClone(g5.jwks); const otherGen5Public = generateEphemeralEcSigningPair().publicJwk; Object.assign(gen5NewMismatch.keys.find((key) => key.kid === newKid), { x: otherGen5Public.x, y: otherGen5Public.y });
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, g5.keys, gen5NewMismatch), { stage: "GEN5", oldKid, newKid }), "EC_VERIFIER_MISMATCH");
  const gen6OldMismatch = structuredClone(g6.jwks); const otherGen6Public = generateEphemeralEcSigningPair().publicJwk; Object.assign(gen6OldMismatch.keys.find((key) => key.kid === oldKid), { x: otherGen6Public.x, y: otherGen6Public.y });
  expectReject(() => validateEcRotationStage(withKeysets(gen6Snapshot, g6.keys, gen6OldMismatch), { stage: "GEN6", oldKid, newKid }), "EC_VERIFIER_MISMATCH");
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, g5.keys.filter((key) => key.kty !== "oct"), g5.jwks), { stage: "GEN5", oldKid, newKid }), "MISSING_LEGACY_OCT");
  const changedOct = structuredClone(g5.keys); changedOct.find((key) => key.kty === "oct").k = randomBytes(32).toString("base64url");
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, changedOct, g5.jwks), { stage: "GEN5", oldKid, newKid }), "LEGACY_OCT_MISMATCH");
  const octSigns = structuredClone(g5.keys); octSigns.find((key) => key.kty === "oct").key_ops = ["sign"];
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, octSigns, g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_SIGNER_COUNT");
  const octMetadata = structuredClone(g6.keys), octMetadataJwks = structuredClone(g6.jwks); octMetadata.find((key) => key.kty === "oct").use = "sig"; octMetadataJwks.keys.find((key) => key.kty === "oct").use = "sig";
  expectReject(() => validateEcRotationTransition({ fromSnapshot: gen5Snapshot, toSnapshot: withKeysets(gen6Snapshot, octMetadata, octMetadataJwks), fromStage: "GEN5", toStage: "GEN6", oldKid, newKid }), "LEGACY_OCT_MISMATCH");
  const rsaVerify = { kty: "RSA", kid: randomUUID(), use: "sig", key_ops: ["verify"], alg: "RS256", n: "AA", e: "AQAB" };
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, [...g5.keys, rsaVerify], { keys: [...g5.jwks.keys, rsaVerify] }), { stage: "GEN5", oldKid, newKid }), "UNEXPECTED_JWK_TYPE");
  const rsaSigner = { ...rsaVerify, key_ops: ["sign"] };
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, [...g5.keys, rsaSigner], g5.jwks), { stage: "GEN5", oldKid, newKid }), "INVALID_SIGNER_COUNT");
  const okp = { kty: "OKP", kid: randomUUID(), use: "sig", key_ops: ["verify"], alg: "EdDSA", crv: "Ed25519", x: "AA" };
  expectReject(() => validateEcRotationStage(withKeysets(gen5Snapshot, [...g5.keys, okp], { keys: [...g5.jwks.keys, okp] }), { stage: "GEN5", oldKid, newKid }), "UNEXPECTED_JWK_TYPE");
  expectReject(() => validateEcRotationTransition({ fromSnapshot: gen4, toSnapshot: withValue(gen5Snapshot, "JWT_SECRET", "changed"), fromStage: "GEN4", toStage: "GEN5", oldKid, newKid }), "IMMUTABLE_ENVIRONMENT_MUTATION");
  for (const name of ["ANON_KEY", "SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) expectReject(() => validateEcRotationTransition({ fromSnapshot: gen4, toSnapshot: withValue(gen5Snapshot, name, `changed-${randomUUID()}`), fromStage: "GEN4", toStage: "GEN5", oldKid, newKid }), "IMMUTABLE_ENVIRONMENT_MUTATION");
  const droppedOld = structuredClone(g6.jwks.keys.filter((key) => key.kid !== oldKid));
  expectReject(() => validateEcRotationStage(withKeysets(gen6Snapshot, g6.keys, { keys: droppedOld }), { stage: "GEN6", oldKid, newKid }), "INVALID_GEN6_MODEL");
  expectReject(() => validateEcRotationStage(withValue(gen6Snapshot, "ANON_KEY_ASYMMETRIC", values(gen5Snapshot).get("ANON_KEY_ASYMMETRIC")), { stage: "GEN6", oldKid, newKid }), "INVALID_ASYMMETRIC_TRANSLATION_TOKEN");
  expectReject(() => validateEcRotationStage(withValue(gen6Snapshot, "SERVICE_ROLE_KEY_ASYMMETRIC", values(gen6Snapshot).get("ANON_KEY_ASYMMETRIC")), { stage: "GEN6", oldKid, newKid }), "INVALID_ASYMMETRIC_TRANSLATION_TOKEN");
  const oldStillPresent = structuredClone(g7.jwks.keys); oldStillPresent.unshift(g6.jwks.keys.find((key) => key.kid === oldKid));
  expectReject(() => validateEcRotationStage(withKeysets(gen7Snapshot, g7.keys, { keys: oldStillPresent }), { stage: "GEN7", oldKid, newKid }), "INVALID_GEN7_MODEL");
  const newSigner = g6.keys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d"));
  const unnecessaryTokenChange = withValue(gen7Snapshot, "ANON_KEY_ASYMMETRIC", signAsymmetricTranslationJwt({ privateKey: newSigner, role: "anon", now: NOW + 1 }));
  expectReject(() => validateEcRotationTransition({ fromSnapshot: gen6Snapshot, toSnapshot: unnecessaryTokenChange, fromStage: "GEN6", toStage: "GEN7", oldKid, newKid }), "UNRELATED_ENVIRONMENT_MUTATION");
});
