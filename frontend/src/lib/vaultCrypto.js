// Secret Delivery Vault — browser-side crypto (layer 1 of 2).
// Buyer holds an ECDH P-256 key pair on this device; seller encrypts to the buyer's public key
// (ephemeral ECDH → AES-GCM-256). The server only ever stores ciphertext (and re-encrypts it at rest).
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const subtle = () => window.crypto?.subtle;

export const cryptoAvailable = () => !!subtle();

const storeKey = (userId, dealId) => `lp_vault_${userId}_${dealId}`;
const pubOnly = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
const privOnly = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function fingerprint(pubJwk) {
  const data = new TextEncoder().encode(JSON.stringify(pubOnly(pubJwk)));
  const hash = await subtle().digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
  return hex.match(/.{1,4}/g).join("-").toUpperCase();
}

export async function generateDeviceKey(userId, dealId) {
  const kp = await subtle().generateKey(ECDH, true, ["deriveKey"]);
  const pub = pubOnly(await subtle().exportKey("jwk", kp.publicKey));
  const priv = privOnly(await subtle().exportKey("jwk", kp.privateKey));
  const fp = await fingerprint(pub);
  localStorage.setItem(storeKey(userId, dealId), JSON.stringify({ deal_id: dealId, user_id: userId, fingerprint: fp, private_jwk: priv, public_jwk: pub, created_at: new Date().toISOString() }));
  return { pub, fp };
}

export function loadDeviceKey(userId, dealId) {
  try { const raw = localStorage.getItem(storeKey(userId, dealId)); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

export function exportBackup(userId, dealId) {
  const rec = loadDeviceKey(userId, dealId);
  if (!rec) return null;
  const blob = new Blob([JSON.stringify({ ...rec, format: "lenden-prohori-vault-key-v1" }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vault-key-${dealId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

export async function importBackup(file, userId, dealId, expectedFingerprint) {
  const rec = JSON.parse(await file.text());
  if (rec.format !== "lenden-prohori-vault-key-v1" || !rec.private_jwk?.d) throw new Error("Not a vault key backup file");
  const fp = await fingerprint(rec.public_jwk);
  if (expectedFingerprint && fp !== expectedFingerprint) throw new Error(`Backup fingerprint ${fp} does not match this deal's key ${expectedFingerprint}`);
  localStorage.setItem(storeKey(userId, dealId), JSON.stringify({ ...rec, deal_id: dealId, user_id: userId, fingerprint: fp }));
  return fp;
}

async function deriveAes(privateKey, pubJwk) {
  const pub = await subtle().importKey("jwk", pubOnly(pubJwk), ECDH, true, []);
  return subtle().deriveKey({ name: "ECDH", public: pub }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealForBuyer(buyerPubJwk, plaintext) {
  const eph = await subtle().generateKey(ECDH, true, ["deriveKey"]);
  const aes = await deriveAes(eph.privateKey, buyerPubJwk);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(plaintext));
  const ephPub = pubOnly(await subtle().exportKey("jwk", eph.publicKey));
  return { alg: "ECDH-P256+A256GCM", ephemeral_pub: ephPub, iv: b64(iv), ciphertext: b64(ct) };
}

export async function openEnvelope(privateJwk, envelope) {
  const priv = await subtle().importKey("jwk", privOnly(privateJwk), ECDH, true, ["deriveKey"]);
  const aes = await deriveAes(priv, envelope.ephemeral_pub);
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(envelope.iv) }, aes, unb64(envelope.ciphertext));
  return new TextDecoder().decode(pt);
}
