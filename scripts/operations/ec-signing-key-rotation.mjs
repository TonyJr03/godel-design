import { createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, timingSafeEqual, verify } from "node:crypto";

export const EC_ROTATION_VARIABLES = Object.freeze([
  "JWT_KEYS",
  "JWT_JWKS",
  "ANON_KEY_ASYMMETRIC",
  "SERVICE_ROLE_KEY_ASYMMETRIC",
]);

const LEGACY_VARIABLES = Object.freeze(["JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY"]);
const OPAQUE_VARIABLES = Object.freeze(["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]);
const FIVE_YEARS_SECONDS = 5 * 365 * 24 * 60 * 60;
const KID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code) { throw new Error(code); }

function equal(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseEnvironment(snapshot) {
  const values = new Map();
  for (const line of Buffer.from(snapshot).toString("utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (values.has(match[1])) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    values.set(match[1], match[2]);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) fail("INVALID_EC_ROTATION_SNAPSHOT");
  return value;
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { fail("INVALID_EC_ROTATION_KEYSET"); }
}

function json(value) { return JSON.stringify(value); }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${json(key)}:${canonical(value[key])}`).join(",")}}`;
  return json(value);
}

function base64Json(value) {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { fail("INVALID_ASYMMETRIC_TRANSLATION_TOKEN"); }
}

function jwtParts(token) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every(Boolean)) fail("INVALID_ASYMMETRIC_TRANSLATION_TOKEN");
  return { header: base64Json(parts[0]), payload: base64Json(parts[1]), input: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") };
}

function assertKid(kid) {
  if (typeof kid !== "string" || !KID_PATTERN.test(kid)) fail("INVALID_EC_KID");
}

function assertEcCommon(key) {
  if (!key || key.kty !== "EC" || key.alg !== "ES256" || key.crv !== "P-256" || key.use !== "sig" || typeof key.x !== "string" || !key.x || typeof key.y !== "string" || !key.y) fail("INVALID_EC_JWK");
  assertKid(key.kid);
  if (!Array.isArray(key.key_ops)) fail("INVALID_EC_JWK");
}

function assertSigner(key) {
  assertEcCommon(key);
  if (typeof key.d !== "string" || !key.d || !key.key_ops.includes("sign")) fail("INVALID_EC_SIGNER");
}

function assertVerifyOnly(key) {
  assertEcCommon(key);
  if (Object.hasOwn(key, "d") || key.key_ops.includes("sign") || !key.key_ops.includes("verify")) fail("INVALID_EC_VERIFY_ONLY");
}

function assertPublicEc(key) {
  assertEcCommon(key);
  if (Object.hasOwn(key, "d") || key.key_ops.includes("sign") || !key.key_ops.includes("verify")) fail("INVALID_EC_PUBLIC_JWKS");
  try { createPublicKey({ key, format: "jwk" }); } catch { fail("INVALID_EC_PUBLIC_JWKS"); }
}

function publicOf(privateKey) {
  const { d, key_ops, ...publicKey } = privateKey;
  return { ...publicKey, key_ops: ["verify"] };
}

function sameEc(left, right) {
  return ["kty", "alg", "crv", "kid", "use", "x", "y"].every((name) => left[name] === right[name]);
}

function assertEcCorrespondence(privateKey, publicKey) {
  assertSigner(privateKey);
  assertPublicEc(publicKey);
  if (!sameEc(privateKey, publicKey)) fail("EC_PRIVATE_PUBLIC_MISMATCH");
  try {
    const derived = createPublicKey(createPrivateKey({ key: privateKey, format: "jwk" })).export({ format: "jwk" });
    if (derived.x !== publicKey.x || derived.y !== publicKey.y || derived.crv !== publicKey.crv) fail("EC_PRIVATE_PUBLIC_MISMATCH");
  } catch { fail("EC_PRIVATE_PUBLIC_MISMATCH"); }
}

function assertOct(key, jwtSecret) {
  if (!key || key.kty !== "oct" || key.alg !== "HS256" || Object.hasOwn(key, "kid") || (Array.isArray(key.key_ops) && key.key_ops.includes("sign")) || typeof key.k !== "string" || !equal(key.k, Buffer.from(jwtSecret).toString("base64url"))) fail("INVALID_LEGACY_OCT");
}

function assertOctCorrespondence(left, right) {
  if (canonical(left) !== canonical(right)) fail("LEGACY_OCT_MISMATCH");
}

function assertVerifierCorrespondence(keyEntry, jwksEntry) {
  if (!sameEc(keyEntry, jwksEntry)) fail("EC_VERIFIER_MISMATCH");
}

function assertLegacyJwt(token, jwtSecret, role) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every(Boolean)) fail("INVALID_LEGACY_JWT");
  const header = base64Json(parts[0]);
  const payload = base64Json(parts[1]);
  const signature = createHmac("sha256", jwtSecret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (header.alg !== "HS256" || header.typ !== "JWT" || Object.hasOwn(header, "kid") || payload.role !== role || payload.iss !== "supabase" || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat || !equal(signature, parts[2])) fail("INVALID_LEGACY_JWT");
}

function parseKeysets(values) {
  const keys = parseJson(required(values, "JWT_KEYS"));
  const jwks = parseJson(required(values, "JWT_JWKS"));
  if (!Array.isArray(keys) || !jwks || typeof jwks !== "object" || Array.isArray(jwks) || !Array.isArray(jwks.keys)) fail("INVALID_EC_ROTATION_KEYSET");
  const keyKids = keys.filter((key) => key?.kty === "EC").map((key) => key.kid);
  const jwksKids = jwks.keys.filter((key) => key?.kty === "EC").map((key) => key.kid);
  if ([...keyKids, ...jwksKids].some((kid) => typeof kid !== "string") || new Set(keyKids).size !== keyKids.length || new Set(jwksKids).size !== jwksKids.length) fail("DUPLICATE_EC_KID");
  return { keys, jwks: jwks.keys };
}

function classifyKeyset(values) {
  const { keys, jwks } = parseKeysets(values);
  const signers = keys.filter((key) => Array.isArray(key?.key_ops) && key.key_ops.includes("sign"));
  if (signers.length !== 1) fail("INVALID_SIGNER_COUNT");
  signers.forEach(assertSigner);
  if (keys.some((key) => !key || !["EC", "oct"].includes(key.kty)) || jwks.some((key) => !key || !["EC", "oct"].includes(key.kty))) fail("UNEXPECTED_JWK_TYPE");
  const privateEcs = keys.filter((key) => key?.kty === "EC" && Object.hasOwn(key, "d"));
  if (privateEcs.length !== 1) fail("INVALID_EC_PRIVATE_MATERIAL");
  for (const key of keys.filter((key) => key?.kty === "EC" && key !== signers[0])) assertVerifyOnly(key);
  if (jwks.some((key) => key?.kty === "EC" && Object.hasOwn(key, "d"))) fail("EC_PRIVATE_MATERIAL_IN_JWKS");
  for (const key of jwks.filter((key) => key?.kty === "EC")) assertPublicEc(key);
  const octKeys = keys.filter((key) => key?.kty === "oct");
  const octJwks = jwks.filter((key) => key?.kty === "oct");
  if (octKeys.length !== 1 || octJwks.length !== 1) fail("MISSING_LEGACY_OCT");
  assertOctCorrespondence(octKeys[0], octJwks[0]);
  return { signer: signers[0], ecKeys: keys.filter((key) => key?.kty === "EC"), ecJwks: jwks.filter((key) => key?.kty === "EC"), oct: octKeys[0], publicOct: octJwks[0], jwks };
}

export function verifyEcPrivatePublicCorrespondence(privateKey, publicKey) {
  assertEcCorrespondence(privateKey, publicKey);
  return true;
}

export function validateAsymmetricTranslationJwt(token, publicKey, role) {
  assertPublicEc(publicKey);
  const parsed = jwtParts(token);
  if (parsed.header.alg !== "ES256" || parsed.header.typ !== "JWT" || parsed.header.kid !== publicKey.kid || parsed.payload.role !== role || parsed.payload.iss !== "supabase" || !Number.isInteger(parsed.payload.iat) || !Number.isInteger(parsed.payload.exp) || parsed.payload.exp <= parsed.payload.iat) fail("INVALID_ASYMMETRIC_TRANSLATION_TOKEN");
  try {
    if (!verify("sha256", Buffer.from(parsed.input), { key: createPublicKey({ key: publicKey, format: "jwk" }), dsaEncoding: "ieee-p1363" }, parsed.signature)) fail("INVALID_ASYMMETRIC_TRANSLATION_TOKEN");
  } catch { fail("INVALID_ASYMMETRIC_TRANSLATION_TOKEN"); }
  return { role: parsed.payload.role, lifetimeSeconds: parsed.payload.exp - parsed.payload.iat };
}

export function signAsymmetricTranslationJwt({ privateKey, role, now = Math.floor(Date.now() / 1000) }) {
  assertSigner(privateKey);
  if (!Number.isInteger(now) || !["anon", "service_role"].includes(role)) fail("INVALID_ASYMMETRIC_TRANSLATION_INPUT");
  const header = Buffer.from(json({ alg: "ES256", typ: "JWT", kid: privateKey.kid })).toString("base64url");
  const payload = Buffer.from(json({ role, iss: "supabase", iat: now, exp: now + FIVE_YEARS_SECONDS })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey({ key: privateKey, format: "jwk" }), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${input}.${signature}`;
}

export function generateEphemeralEcSigningPair() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const raw = privateKey.export({ format: "jwk" });
  const kid = randomUUID();
  const privateJwk = { kty: "EC", kid, use: "sig", key_ops: ["sign", "verify"], alg: "ES256", crv: raw.crv, x: raw.x, y: raw.y, d: raw.d };
  const publicJwk = publicOf(privateJwk);
  assertEcCorrespondence(privateJwk, publicJwk);
  return { privateJwk, publicJwk };
}

function replaceEnvironmentValues(snapshot, replacements) {
  const lines = Buffer.from(snapshot).toString("utf8").split(/(\r?\n)/);
  const seen = new Set();
  const output = lines.map((part) => {
    const match = part.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !Object.hasOwn(replacements, match[1])) return part;
    seen.add(match[1]);
    return `${match[1]}=${replacements[match[1]]}`;
  });
  if (seen.size !== Object.keys(replacements).length) fail("MISSING_EC_ROTATION_VARIABLE");
  return Buffer.from(output.join(""));
}

function unchangedOutside(before, after, allowed) {
  const source = parseEnvironment(before);
  const target = parseEnvironment(after);
  const names = new Set([...source.keys(), ...target.keys()]);
  for (const name of [...LEGACY_VARIABLES, ...OPAQUE_VARIABLES]) if (source.get(name) !== target.get(name)) fail("IMMUTABLE_ENVIRONMENT_MUTATION");
  for (const name of names) if (source.get(name) !== target.get(name) && !allowed.includes(name)) fail("UNRELATED_ENVIRONMENT_MUTATION");
}

function assertGen4(values) {
  const state = classifyKeyset(values);
  if (state.ecKeys.length !== 1 || state.ecJwks.length !== 1) fail("INVALID_GEN4_MODEL");
  const jwtSecret = required(values, "JWT_SECRET");
  assertOct(state.oct, jwtSecret);
  assertOct(state.publicOct, jwtSecret);
  assertOctCorrespondence(state.oct, state.publicOct);
  assertEcCorrespondence(state.signer, state.ecJwks[0]);
  assertLegacyJwt(required(values, "ANON_KEY"), jwtSecret, "anon");
  assertLegacyJwt(required(values, "SERVICE_ROLE_KEY"), jwtSecret, "service_role");
  validateAsymmetricTranslationJwt(required(values, "ANON_KEY_ASYMMETRIC"), state.ecJwks[0], "anon");
  validateAsymmetricTranslationJwt(required(values, "SERVICE_ROLE_KEY_ASYMMETRIC"), state.ecJwks[0], "service_role");
  return state;
}

export function validateEcRotationStage(snapshot, { stage, oldKid, newKid = null }) {
  assertKid(oldKid);
  if (newKid !== null) assertKid(newKid);
  const values = parseEnvironment(snapshot);
  const state = classifyKeyset(values);
  const byKid = new Map(state.ecKeys.map((key) => [key.kid, key]));
  const jwksByKid = new Map(state.ecJwks.map((key) => [key.kid, key]));
  const jwtSecret = required(values, "JWT_SECRET");
  assertOct(state.oct, jwtSecret);
  assertOct(state.publicOct, jwtSecret);
  assertOctCorrespondence(state.oct, state.publicOct);
  assertLegacyJwt(required(values, "ANON_KEY"), jwtSecret, "anon");
  assertLegacyJwt(required(values, "SERVICE_ROLE_KEY"), jwtSecret, "service_role");
  if (stage === "GEN4") {
    if (newKid !== null || state.signer.kid !== oldKid || byKid.size !== 1 || jwksByKid.size !== 1 || !byKid.has(oldKid) || !jwksByKid.has(oldKid)) fail("INVALID_GEN4_MODEL");
    assertEcCorrespondence(byKid.get(oldKid), jwksByKid.get(oldKid));
    assertVerifierCorrespondence(byKid.get(oldKid), jwksByKid.get(oldKid));
    validateAsymmetricTranslationJwt(required(values, "ANON_KEY_ASYMMETRIC"), jwksByKid.get(oldKid), "anon");
    validateAsymmetricTranslationJwt(required(values, "SERVICE_ROLE_KEY_ASYMMETRIC"), jwksByKid.get(oldKid), "service_role");
  } else if (stage === "GEN5") {
    if (!newKid || state.signer.kid !== oldKid || byKid.size !== 2 || jwksByKid.size !== 2 || !byKid.has(oldKid) || !byKid.has(newKid) || !jwksByKid.has(oldKid) || !jwksByKid.has(newKid)) fail("INVALID_GEN5_MODEL");
    assertEcCorrespondence(byKid.get(oldKid), jwksByKid.get(oldKid));
    assertVerifyOnly(byKid.get(newKid));
    assertVerifierCorrespondence(byKid.get(newKid), jwksByKid.get(newKid));
    validateAsymmetricTranslationJwt(required(values, "ANON_KEY_ASYMMETRIC"), jwksByKid.get(oldKid), "anon");
    validateAsymmetricTranslationJwt(required(values, "SERVICE_ROLE_KEY_ASYMMETRIC"), jwksByKid.get(oldKid), "service_role");
  } else if (stage === "GEN6") {
    if (!newKid || state.signer.kid !== newKid || byKid.size !== 2 || jwksByKid.size !== 2 || !byKid.has(oldKid) || !byKid.has(newKid) || !jwksByKid.has(oldKid) || !jwksByKid.has(newKid)) fail("INVALID_GEN6_MODEL");
    assertEcCorrespondence(byKid.get(newKid), jwksByKid.get(newKid));
    assertVerifyOnly(byKid.get(oldKid));
    assertVerifierCorrespondence(byKid.get(oldKid), jwksByKid.get(oldKid));
    validateAsymmetricTranslationJwt(required(values, "ANON_KEY_ASYMMETRIC"), jwksByKid.get(newKid), "anon");
    validateAsymmetricTranslationJwt(required(values, "SERVICE_ROLE_KEY_ASYMMETRIC"), jwksByKid.get(newKid), "service_role");
  } else if (stage === "GEN7") {
    if (!newKid || state.signer.kid !== newKid || byKid.size !== 1 || jwksByKid.size !== 1 || byKid.has(oldKid) || jwksByKid.has(oldKid) || !byKid.has(newKid) || !jwksByKid.has(newKid)) fail("INVALID_GEN7_MODEL");
    assertEcCorrespondence(byKid.get(newKid), jwksByKid.get(newKid));
    assertVerifierCorrespondence(byKid.get(newKid), jwksByKid.get(newKid));
    validateAsymmetricTranslationJwt(required(values, "ANON_KEY_ASYMMETRIC"), jwksByKid.get(newKid), "anon");
    validateAsymmetricTranslationJwt(required(values, "SERVICE_ROLE_KEY_ASYMMETRIC"), jwksByKid.get(newKid), "service_role");
  } else fail("UNKNOWN_EC_ROTATION_STAGE");
  return { stage, signerIsOld: state.signer.kid === oldKid, ecKeyCount: byKid.size, publicEcCount: jwksByKid.size };
}

export function validateGen4Source(snapshot) {
  const values = parseEnvironment(snapshot);
  const state = assertGen4(values);
  return { oldKid: state.signer.kid, oldPublicKey: state.ecJwks[0], oldPrivateKey: state.signer };
}

export function buildEcRotationPlan(sourceSnapshot, { now = Math.floor(Date.now() / 1000) } = {}) {
  const source = validateGen4Source(sourceSnapshot);
  const newPair = generateEphemeralEcSigningPair();
  if (source.oldKid === newPair.privateJwk.kid) fail("DUPLICATE_EC_KID");
  const values = parseEnvironment(sourceSnapshot);
  const oct = classifyKeyset(values).oct;
  const oldPublic = source.oldPublicKey;
  const gen5 = replaceEnvironmentValues(sourceSnapshot, {
    JWT_KEYS: json([source.oldPrivateKey, newPair.publicJwk, oct]),
    JWT_JWKS: json({ keys: [oldPublic, newPair.publicJwk, oct] }),
  });
  const gen6Anon = signAsymmetricTranslationJwt({ privateKey: newPair.privateJwk, role: "anon", now });
  const gen6Service = signAsymmetricTranslationJwt({ privateKey: newPair.privateJwk, role: "service_role", now });
  const gen6 = replaceEnvironmentValues(gen5, {
    JWT_KEYS: json([newPair.privateJwk, oldPublic, oct]),
    ANON_KEY_ASYMMETRIC: gen6Anon,
    SERVICE_ROLE_KEY_ASYMMETRIC: gen6Service,
  });
  const gen7 = replaceEnvironmentValues(gen6, {
    JWT_KEYS: json([newPair.privateJwk, oct]),
    JWT_JWKS: json({ keys: [newPair.publicJwk, oct] }),
  });
  validateEcRotationStage(sourceSnapshot, { stage: "GEN4", oldKid: source.oldKid });
  validateEcRotationStage(gen5, { stage: "GEN5", oldKid: source.oldKid, newKid: newPair.privateJwk.kid });
  validateEcRotationStage(gen6, { stage: "GEN6", oldKid: source.oldKid, newKid: newPair.privateJwk.kid });
  validateEcRotationStage(gen7, { stage: "GEN7", oldKid: source.oldKid, newKid: newPair.privateJwk.kid });
  return { gen5Snapshot: gen5, gen6Snapshot: gen6, gen7Snapshot: gen7, sanitizedMetadata: { oldNewDistinct: true, stages: ["GEN4", "GEN5", "GEN6", "GEN7"], ecPublicCounts: [1, 2, 2, 1] } };
}

const TRANSITIONS = new Map([
  ["GEN4:GEN5", ["JWT_KEYS", "JWT_JWKS"]], ["GEN5:GEN4", ["JWT_KEYS", "JWT_JWKS"]],
  ["GEN5:GEN6", ["JWT_KEYS", "ANON_KEY_ASYMMETRIC", "SERVICE_ROLE_KEY_ASYMMETRIC"]], ["GEN6:GEN5", ["JWT_KEYS", "ANON_KEY_ASYMMETRIC", "SERVICE_ROLE_KEY_ASYMMETRIC"]],
  ["GEN6:GEN7", ["JWT_KEYS", "JWT_JWKS"]], ["GEN7:GEN6", ["JWT_KEYS", "JWT_JWKS"]],
]);

export function validateEcRotationTransition({ fromSnapshot, toSnapshot, fromStage, toStage, oldKid, newKid }) {
  const allowed = TRANSITIONS.get(`${fromStage}:${toStage}`);
  if (!allowed) fail("UNSAFE_EC_ROTATION_TRANSITION");
  validateEcRotationStage(fromSnapshot, { stage: fromStage, oldKid, newKid: fromStage === "GEN4" ? null : newKid });
  const source = parseEnvironment(fromSnapshot);
  const target = parseEnvironment(toSnapshot);
  const sourceKeyset = classifyKeyset(source);
  const targetKeyset = classifyKeyset(target);
  assertOctCorrespondence(sourceKeyset.oct, targetKeyset.oct);
  unchangedOutside(fromSnapshot, toSnapshot, allowed);
  validateEcRotationStage(toSnapshot, { stage: toStage, oldKid, newKid: toStage === "GEN4" ? null : newKid });
  for (const name of allowed) if (source.get(name) === target.get(name)) fail("MISSING_REQUIRED_STAGE_CHANGE");
  if ((fromStage === "GEN5" && toStage === "GEN6") || (fromStage === "GEN6" && toStage === "GEN5")) {
    if (canonical(parseJson(required(source, "JWT_JWKS"))) !== canonical(parseJson(required(target, "JWT_JWKS")))) fail("GEN5_GEN6_JWKS_CHANGED");
  }
  return true;
}
