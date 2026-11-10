import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {ARMENIAN_LOWER,ARMENIAN_UPPER,aesDecrypt,aesEncrypt,generateRsaKeyPair,rsaDecrypt,rsaEncrypt,transform}=require("./cryptolab.js");

const armenianText = `${ARMENIAN_UPPER.join("")} ${ARMENIAN_LOWER.join("")}՝ «Բարև՛, աշխարհ։» 123`;

test("the Armenian alphabet contains 39 lowercase and uppercase entries", () => {
  assert.equal(ARMENIAN_LOWER.length, 39);
  assert.equal(ARMENIAN_UPPER.length, 39);
});

for (const method of ["morse", "binary", "base64", "utf8", "caesar", "vigenere", "atbash", "aes", "rsa"]) {
  test(`${method} round-trips Armenian, punctuation, and mixed case`, async () => {
    const options = {
      alphabet: "mixed",
      shift: 13,
      key: "ԲանալինKey",
      password: "correct horse battery staple",
    };
    if (method === "rsa") {
      const pair = await generateRsaKeyPair();
      options.publicKey = JSON.stringify(pair.publicKey);
      options.privateKey = JSON.stringify(pair.privateKey);
    }
    const sample = method === "rsa" ? "Բարև, world!" : armenianText;
    const encoded = await transform(method, "encode", sample, options);
    const decoded = await transform(method, "decode", encoded, options);
    assert.equal(decoded, sample);
  });
}

test("ASCII round-trips ASCII and rejects Armenian input", async () => {
  const encoded = await transform("ascii", "encode", "ASCII only: 123!");
  assert.equal(await transform("ascii", "decode", encoded), "ASCII only: 123!");
  await assert.rejects(transform("ascii", "encode", "Բարև"), /ASCII supports only/u);
});

test("Caesar and Vigenere operate in an explicit Armenian alphabet mode", async () => {
  const options = { alphabet: "armenian", shift: 8, key: "Գաղտնիք" };
  for (const method of ["caesar", "vigenere"]) {
    const encoded = await transform(method, "encode", armenianText, options);
    assert.equal(await transform(method, "decode", encoded, options), armenianText);
    assert.ok(encoded.includes("՝ «"));
    assert.ok(encoded.includes("՛,"));
    assert.ok(encoded.includes("։» 123"));
  }
});

test("UTF-8 binary preserves long Unicode messages and rejects malformed bytes", async () => {
  const longText = `${armenianText} 🙂\n`.repeat(1000);
  const encoded = await transform("binary", "encode", longText);
  assert.equal(await transform("binary", "decode", encoded), longText);
  await assert.rejects(transform("binary", "decode", "11111111"), /valid UTF-8/u);
});

test("Base64 and UTF-8 hex reject malformed input", async () => {
  await assert.rejects(transform("base64", "decode", "!!!"), /Base64/u);
  await assert.rejects(transform("utf8", "decode", "f"), /hexadecimal/u);
});

test("AES-256-GCM uses unique salts/nonces and rejects wrong passwords or tampering", async () => {
  const first = await aesEncrypt(armenianText, "right password");
  const second = await aesEncrypt(armenianText, "right password");
  assert.notEqual(first, second);
  assert.equal(await aesDecrypt(first, "right password"), armenianText);
  const longText = `${armenianText}\n`.repeat(200);
  assert.equal(await aesDecrypt(await aesEncrypt(longText, "right password"), "right password"), longText);
  await assert.rejects(aesDecrypt(first, "wrong password"), /incorrect or the message was modified/u);
  const parts = first.split(".");
  parts[3] = `${parts[3].slice(0, -2)}AA`;
  await assert.rejects(aesDecrypt(parts.join("."), "right password"));
});

test("RSA-OAEP encrypts and decrypts with a generated key pair", async () => {
  const pair = await generateRsaKeyPair();
  const message = "Բարև, world!";
  const encrypted = await rsaEncrypt(message, JSON.stringify(pair.publicKey));
  assert.equal(await rsaDecrypt(encrypted, JSON.stringify(pair.privateKey)), message);
  await assert.rejects(rsaEncrypt("x".repeat(300), JSON.stringify(pair.publicKey)), /too long/u);
});

test("Morse validates unsupported input and Caesar validates shift values", async () => {
  const message = "  Բարև՝ «աշխարհ»։\n🙂\t";
  assert.equal(await transform("morse", "decode", await transform("morse", "encode", message)), message);
  await assert.rejects(transform("caesar", "encode", "test", { shift: 1.5 }), /integer/u);
  await assert.rejects(transform("caesar", "encode", "test", { shift: 39 }), /0 to 38/u);
});

test("classical ciphers preserve line breaks and punctuation", async () => {
  const message = "Բարև,\nաշխարհ։\n";
  for (const method of ["caesar", "vigenere", "atbash"]) {
    const options = { alphabet: "mixed", shift: 5, key: "Key" };
    const encoded = await transform(method, "encode", message, options);
    assert.equal(await transform(method, "decode", encoded, options), message);
  }
});
