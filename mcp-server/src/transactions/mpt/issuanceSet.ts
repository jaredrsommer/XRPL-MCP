import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// MPTokenIssuanceSet flags
const MPTokenIssuanceSetFlags = {
    tfMPTLock: 0x0001,    // Lock the MPT issuance (prevent further minting)
    tfMPTUnlock: 0x0002,  // Unlock the MPT issuance
};

server.registerTool(
    "mpt-issuance-set",
    {
        title: "Set MPT Issuance",
        description: "Modify the properties of an existing Multi-Purpose Token (MPT) issuance. Can lock/unlock the issuance or update holder authorization.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (must be the issuer). If not provided, the connected wallet will be used."
                ),
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT to modify (64-character hex string)."
                ),
            holder: z
                .string()
                .optional()
                .describe(
                    "Optional: The account address of the holder to authorize/unauthorize. Required when using the authorization flags."
                ),
            lock: z
                .boolean()
                .optional()
                .describe(
                    "If true, lock the MPT issuance (prevent further minting). If false, unlock it."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
        annotations: { idempotentHint: true },
    },
    async ({
        fromSeed,
        mptIssuanceID,
        holder,
        lock,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Build transaction
            const tx: any = {
                TransactionType: "MPTokenIssuanceSet",
                Account: wallet.address,
                MPTokenIssuanceID: mptIssuanceID,
            };

            // Set flags
            if (lock !== undefined) {
                tx.Flags = lock
                    ? MPTokenIssuanceSetFlags.tfMPTLock
                    : MPTokenIssuanceSetFlags.tfMPTUnlock;
            }

            if (holder) {
                tx.Holder = holder;
            }

            if (fee) tx.Fee = fee;

            const prepared = await client.autofill(tx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                mptIssuanceID,
                                holder: holder ?? null,
                                action: lock !== undefined
                                    ? (lock ? "locked" : "unlocked")
                                    : "modified",
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error modifying MPT issuance: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    },
                ],
            };
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
