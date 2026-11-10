(function () {
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const ARMENIAN_LOWER = [..."աբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆ", "և"];
const ARMENIAN_UPPER = [..."ԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖ", "ԵՎ"];
const LATIN_LOWER = [..."abcdefghijklmnopqrstuvwxyz"];
const LATIN_UPPER = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const morse = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};
const punctuationMorse = {
  ",": "--..--", ".": ".-.-.-", "։": ".......-", "?": "..--..",
  "!": "-.-.--", ":": "---...", ";": "-.-.-.", "'": ".----.",
  "-": "-....-", "(": "-.--.", ")": "-.--.-", "&": ".-...",
  "=": "-...-", "+": ".-.-.", "_": "..--.-", '"': ".-..-.",
  "@": ".--.-.", "/": "-..-.",
};

const armenianMorse = new Map();
const armenianMorseReverse = new Map();
const MORSE_ARMENIAN_EXTENSION = Object.freeze(["՝", "՛", "՜", "՞", "։", "«", "»", "\n", "\r", "\t", "\u00a0", "…", "—", "–", "“", "”", "‘", "’"]);
const morseExtensionCharacters = MORSE_ARMENIAN_EXTENSION;
for (const [index, letter] of [...ARMENIAN_LOWER, ...ARMENIAN_UPPER].entries()) {
  const code = index.toString(2).padStart(7, "0").replaceAll("0", ".").replaceAll("1", "-");
  armenianMorse.set(letter, code);
  armenianMorseReverse.set(code, letter);
}
for (const [index, mark] of morseExtensionCharacters.entries()) {
  const code = (78 + index).toString(2).padStart(7, "0").replaceAll("0", ".").replaceAll("1", "-");
  armenianMorse.set(mark, code);
  armenianMorseReverse.set(code, mark);
}
const morseEscape = (96).toString(2).padStart(7, "0").replaceAll("0", ".").replaceAll("1", "-");
const morseEscapeEnd = (97).toString(2).padStart(7, "0").replaceAll("0", ".").replaceAll("1", "-");

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Invalid Base64 data.");
  }
}

function chunks(text) {
  return [...text.matchAll(/ԵՎ|./gsu)].map(([character]) => character);
}

function morseEncode(text) {
  return chunks(text).flatMap((character) => {
    if (character === " ") return ["/"];
    if (armenianMorse.has(character)) return [armenianMorse.get(character)];
    const code = morse[character.toUpperCase()] ?? punctuationMorse[character];
    if (code) return [code];
    const digits = [...character.codePointAt(0).toString(16).toUpperCase()].map((digit) => morse[digit]);
    return [morseEscape, ...digits, morseEscapeEnd];
  }).join(" ");
}

function morseDecode(text) {
  const reverse = new Map([
    ...Object.entries(morse).map(([letter, code]) => [code, letter]),
    ...Object.entries(punctuationMorse).map(([letter, code]) => [code, letter]),
    ...armenianMorseReverse,
  ]);
  if (!text) return "";
  return text.split("/").map((word) => {
    const tokens = word.trim().split(/\s+/u).filter(Boolean);
    const decoded = [];
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] === morseEscape) {
        const end = tokens.indexOf(morseEscapeEnd, index + 1);
        if (end < 0) throw new Error("Incomplete Morse Unicode escape.");
        const digits = tokens.slice(index + 1, end).map((token) => reverse.get(token));
        if (!digits.length || digits.some((digit) => !digit || !/^[0-9A-F]$/u.test(digit))) throw new Error("Invalid Morse Unicode escape.");
        const point = Number.parseInt(digits.join(""), 16);
        if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("Invalid Unicode code point in Morse escape.");
        decoded.push(String.fromCodePoint(point));
        index = end;
        continue;
      }
      if (!reverse.has(tokens[index])) throw new Error(`Unknown Morse code “${tokens[index]}”.`);
      decoded.push(reverse.get(tokens[index]));
    }
    return decoded.join("");
  }).join(" ");
}

function rotate(character, lower, upper, shift, reverse) {
  const alphabet = lower.includes(character) ? lower : upper.includes(character) ? upper : null;
  if (!alphabet) return null;
  const index = alphabet.indexOf(character);
  const direction = reverse ? -1 : 1;
  return alphabet[(index + direction * shift % alphabet.length + alphabet.length) % alphabet.length];
}

function getAlphabetFor(character, selectedAlphabet) {
  if ((selectedAlphabet === "mixed" || selectedAlphabet === "armenian") &&
      (ARMENIAN_LOWER.includes(character) || ARMENIAN_UPPER.includes(character))) {
    return { lower: ARMENIAN_LOWER, upper: ARMENIAN_UPPER, kind: "armenian" };
  }
  if ((selectedAlphabet === "mixed" || selectedAlphabet === "latin") &&
      (LATIN_LOWER.includes(character) || LATIN_UPPER.includes(character))) {
    return { lower: LATIN_LOWER, upper: LATIN_UPPER, kind: "latin" };
  }
  return null;
}

function caesar(text, shift, reverse = false, selectedAlphabet = "mixed") {
  if (!Number.isInteger(shift) || shift < 0 || shift > 38) throw new Error("Shift must be an integer from 0 to 38.");
  const amount = Math.abs(shift);
  return chunks(text).map((character) => {
    const alphabet = getAlphabetFor(character, selectedAlphabet);
    if (!alphabet) return character;
    const rotated = rotate(character, alphabet.lower, alphabet.upper, amount, reverse !== (shift < 0));
    return rotated ?? character;
  }).join("");
}

function alphabetIndex(character, selectedAlphabet) {
  const set = getAlphabetFor(character, selectedAlphabet);
  if (!set) return null;
  const index = set.lower.indexOf(character);
  return { index: index >= 0 ? index : set.upper.indexOf(character), set };
}

function vigenere(text, key, reverse = false, selectedAlphabet = "mixed") {
  const keyLetters = chunks(key).filter((character) => alphabetIndex(character, selectedAlphabet));
  if (!keyLetters.length) throw new Error("The Vigenere key must contain letters in the selected alphabet.");
  let keyPosition = 0;
  return chunks(text).map((character) => {
    const current = alphabetIndex(character, selectedAlphabet);
    if (!current) return character;
    const keyLetter = keyLetters[keyPosition % keyLetters.length];
    keyPosition += 1;
    const keyValue = alphabetIndex(keyLetter, selectedAlphabet).index;
    const direction = reverse ? -1 : 1;
    const shift = direction * keyValue;
    const alphabet = current.set.lower;
    const index = current.index;
    const output = alphabet[(index + shift + alphabet.length) % alphabet.length];
    if (current.set.upper.includes(character)) return current.set.upper[alphabet.indexOf(output)];
    return output;
  }).join("");
}

function atbash(text) {
  return chunks(text).map((character) => {
    const lowerIndex = LATIN_LOWER.indexOf(character);
    if (lowerIndex >= 0) return LATIN_LOWER[LATIN_LOWER.length - 1 - lowerIndex];
    const upperIndex = LATIN_UPPER.indexOf(character);
    if (upperIndex >= 0) return LATIN_UPPER[LATIN_UPPER.length - 1 - upperIndex];
    return character;
  }).join("");
}

function asciiEncode(text) {
  if ([...text].some((character) => character.codePointAt(0) > 0x7f)) {
    throw new Error("ASCII supports only characters U+0000 through U+007F. Use UTF-8 for Armenian or other Unicode text.");
  }
  return [...text].map((character) => character.charCodeAt(0).toString(2).padStart(7, "0")).join(" ");
}

function asciiDecode(text) {
  if (!text.trim()) return "";
  const parts = text.trim().split(/\s+/u);
  if (!parts.every((part) => /^[01]{7}$/u.test(part))) throw new Error("ASCII binary must contain 7-bit groups separated by spaces.");
  let output = "";
  for (let offset = 0; offset < parts.length; offset += 0x8000) {
    output += String.fromCharCode(...parts.slice(offset, offset + 0x8000).map((part) => Number.parseInt(part, 2)));
  }
  return output;
}

function binaryEncode(text) {
  return [...encoder.encode(text)].map((byte) => byte.toString(2).padStart(8, "0")).join(" ");
}

function binaryDecode(text) {
  if (!text.trim()) return "";
  const parts = text.trim().split(/\s+/u);
  if (!parts.every((part) => /^[01]{8}$/u.test(part))) throw new Error("Binary data must contain 8-bit groups separated by spaces.");
  try {
    return decoder.decode(new Uint8Array(parts.map((part) => Number.parseInt(part, 2))));
  } catch {
    throw new Error("The binary data is not valid UTF-8.");
  }
}

function utf8Encode(text) {
  return `UTF8:${[...encoder.encode(text)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function utf8Decode(text) {
  const payload = text.trim().replace(/^UTF8:/u, "");
  if (payload.length % 2 || !/^(?:[0-9a-f]{2})*$/iu.test(payload)) throw new Error("UTF-8 hex data must contain complete hexadecimal byte pairs.");
  try {
    return decoder.decode(Uint8Array.from(payload.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16)));
  } catch {
    throw new Error("The data does not contain valid UTF-8.");
  }
}

function deriveKey(password, salt, iterations = 250_000) {
  return crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
    .then((baseKey) => crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ));
}

async function aesEncrypt(text, password) {
  if (!password) throw new Error("Enter a password for AES-GCM.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return `CL1.${bytesToBase64(salt)}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function aesDecrypt(text, password) {
  if (!password) throw new Error("Enter the same password used to encrypt this message.");
  const parts = text.trim().split(".");
  if (parts.length !== 4 || parts[0] !== "CL1") throw new Error("Invalid AES-GCM payload format.");
  const salt = base64ToBytes(parts[1]);
  const iv = base64ToBytes(parts[2]);
  const ciphertext = base64ToBytes(parts[3]);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("Invalid AES-GCM payload lengths.");
  try {
    const key = await deriveKey(password, salt);
    return decoder.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new Error("Unable to decrypt: the password is incorrect or the message was modified.");
  }
}

function parseJwk(value, keyType) {
  let jwk;
  try {
    jwk = JSON.parse(value);
  } catch {
    throw new Error(`Paste a valid RSA ${keyType} JWK key.`);
  }
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e || (keyType === "private" && !jwk.d)) {
    throw new Error(`The supplied RSA ${keyType} key is incomplete.`);
  }
  return jwk;
}

async function generateRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  return {
    publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}

async function rsaEncrypt(text, publicKey) {
  const jwk = parseJwk(publicKey, "public");
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const ciphertext = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoder.encode(text));
    return `RSA1.${bytesToBase64(new Uint8Array(ciphertext))}`;
  } catch (error) {
    if (error instanceof DOMException && error.name === "OperationError") {
      throw new Error("RSA-OAEP input is too long for this key. Use AES-GCM for longer messages.");
    }
    throw new Error(`RSA encryption failed: ${error.message}`);
  }
}

async function rsaDecrypt(text, privateKey) {
  const jwk = parseJwk(privateKey, "private");
  if (!text.startsWith("RSA1.")) throw new Error("Invalid RSA-OAEP payload format.");
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
    return decoder.decode(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, base64ToBytes(text.slice(5))));
  } catch {
    throw new Error("RSA decryption failed: check the private key and ciphertext.");
  }
}

async function transform(method, mode, text, options = {}) {
  const decoding = mode === "decode";
  switch (method) {
    case "morse": return decoding ? morseDecode(text) : morseEncode(text);
    case "ascii": return decoding ? asciiDecode(text) : asciiEncode(text);
    case "binary": return decoding ? binaryDecode(text) : binaryEncode(text);
    case "utf8": return decoding ? utf8Decode(text) : utf8Encode(text);
    case "base64": return decoding ? decoder.decode(base64ToBytes(text.trim())) : bytesToBase64(encoder.encode(text));
    case "caesar": return caesar(text, Number(options.shift ?? 3), decoding, options.alphabet ?? "mixed");
    case "vigenere": return vigenere(text, options.key ?? "", decoding, options.alphabet ?? "mixed");
    case "atbash": return atbash(text);
    case "aes": return decoding ? aesDecrypt(text, options.password ?? "") : aesEncrypt(text, options.password ?? "");
    case "rsa": return decoding
      ? rsaDecrypt(text, options.privateKey ?? "")
      : rsaEncrypt(text, options.publicKey ?? "");
    default: throw new Error(`Unknown method: ${method}`);
  }
}

const METHOD_IDS = Object.freeze(["morse", "binary", "ascii", "utf8", "base64", "caesar", "vigenere", "atbash", "aes", "rsa"]);

const cryptolab = Object.freeze({
  ARMENIAN_LOWER,
  ARMENIAN_UPPER,
  LATIN_LOWER,
  LATIN_UPPER,
  MORSE_ARMENIAN_EXTENSION,
  METHOD_IDS,
  aesDecrypt,
  aesEncrypt,
  deriveKey,
  generateRsaKeyPair,
  rsaDecrypt,
  rsaEncrypt,
  transform,
});

globalThis.CryptoLab = cryptolab;
if (typeof module !== "undefined" && module.exports) module.exports = cryptolab;
})();
