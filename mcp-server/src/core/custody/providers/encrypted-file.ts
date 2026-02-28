import crypto from "node:crypto";
import fs from "node:fs";
import { Wallet } from "xrpl";
import type { CustodyProvider, SignedTransaction } from "../types.js";

/**
 * Keystore file JSON format.
 */
interface KeystoreFile {
    version: 1;
    address: string;
    crypto: {
        cipher: "aes-256-gcm";
        ciphertext: string;
        iv: string;
        tag: string;
        kdf: "pbkdf2";
        kdfparams: {
            iterations: number;
            salt: string;
            digest: "sha512";
        };
    };
}

const KDF_ITERATIONS = 600_000;
const CIPHER = "aes-256-gcm";

/**
 * Derive an AES-256 key from a password using PBKDF2.
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
        password,
        salt,
        KDF_ITERATIONS,
        32,
        "sha512"
    );
}

/**
 * Encrypt a seed string with AES-256-GCM.
 */
function encryptSeed(seed: string, password: string): KeystoreFile["crypto"] {
    const salt = crypto.randomBytes(32);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(CIPHER, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(seed, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
        cipher: CIPHER,
        ciphertext: ciphertext.toString("hex"),
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        kdf: "pbkdf2",
        kdfparams: {
            iterations: KDF_ITERATIONS,
            salt: salt.toString("hex"),
            digest: "sha512",
        },
    };
}

/**
 * Decrypt a seed from a keystore crypto section.
 */
function decryptSeed(
    cryptoSection: KeystoreFile["crypto"],
    password: string
): string {
    const salt = Buffer.from(cryptoSection.kdfparams.salt, "hex");
    const key = deriveKey(password, salt);
    const iv = Buffer.from(cryptoSection.iv, "hex");
    const tag = Buffer.from(cryptoSection.tag, "hex");
    const ciphertext = Buffer.from(cryptoSection.ciphertext, "hex");

    const decipher = crypto.createDecipheriv(CIPHER, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}

/**
 * Create an encrypted keystore file for an XRPL seed.
 */
export function createKeystore(
    seed: string,
    password: string,
    outputPath: string
): KeystoreFile {
    // Validate seed by creating a wallet
    const wallet = Wallet.fromSeed(seed);

    const keystore: KeystoreFile = {
        version: 1,
        address: wallet.address,
        crypto: encryptSeed(seed, password),
    };

    fs.writeFileSync(outputPath, JSON.stringify(keystore, null, 2), "utf8");
    return keystore;
}

/**
 * CustodyProvider backed by an encrypted keystore file (AES-256-GCM + PBKDF2).
 * Decrypts the seed at construction time, holds the Wallet in memory.
 * Never exposes the seed or private key.
 */
export class EncryptedFileCustodyProvider implements CustodyProvider {
    readonly name: string;
    readonly type = "encrypted-file";
    private readonly wallet: Wallet;

    constructor(name: string, keystorePath: string, password: string) {
        // Read and parse keystore file
        let keystoreJson: string;
        try {
            keystoreJson = fs.readFileSync(keystorePath, "utf8");
        } catch (error) {
            throw new Error(
                `Failed to read keystore file at "${keystorePath}": ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }

        let keystore: KeystoreFile;
        try {
            keystore = JSON.parse(keystoreJson);
        } catch {
            throw new Error(
                `Invalid JSON in keystore file at "${keystorePath}"`
            );
        }

        if (keystore.version !== 1) {
            throw new Error(
                `Unsupported keystore version: ${keystore.version}`
            );
        }

        // Decrypt seed
        let seed: string;
        try {
            seed = decryptSeed(keystore.crypto, password);
        } catch (error) {
            throw new Error(
                `Failed to decrypt keystore "${keystorePath}": wrong password or corrupted file`
            );
        }

        // Create wallet
        this.wallet = Wallet.fromSeed(seed);
        this.name = name;

        // Verify address matches
        if (this.wallet.address !== keystore.address) {
            throw new Error(
                `Address mismatch: keystore says ${keystore.address} but seed produces ${this.wallet.address}`
            );
        }
    }

    getAddress(): string {
        return this.wallet.address;
    }

    getPublicKey(): string {
        return this.wallet.publicKey;
    }

    sign(preparedTx: Record<string, unknown>): SignedTransaction {
        const signed = this.wallet.sign(preparedTx as any);
        return {
            tx_blob: signed.tx_blob,
            hash: signed.hash,
        };
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }
}
