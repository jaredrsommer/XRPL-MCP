import { Client, Wallet, TrustSet, TrustSetFlags } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register set-trustline tool
server.registerTool(
    "set-trustline",
    {
        title: "Set Trustline",
        description: "Create or modify a trust line on the XRP Ledger, allowing you to hold non-XRP assets",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet setting the trust line. If not provided, the connected wallet will be used."
                ),
            currency: z
                .string()
                .describe("The currency code of the asset (e.g., 'USD', 'EUR')."),
            issuer: z.string().describe("The address of the issuer of the asset."),
            limit: z
                .string()
                .describe(
                    "The maximum amount of the currency you are willing to hold. Use '0' to remove the trust line (if balance is zero)."
                ),
            qualityIn: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Optional quality modifier for incoming payments."),
            qualityOut: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Optional quality modifier for outgoing payments."),
            noRipple: z
                .boolean()
                .optional()
                .describe(
                    "If true, disable the NoRipple flag (allow rippling). Default is usually enabled (tfSetNoRipple)."
                ),
            freeze: z
                .boolean()
                .optional()
                .describe(
                    "If true, set the Freeze flag (tfSetFreeze). Only the issuer can set this."
                ),
            auth: z
                .boolean()
                .optional()
                .describe(
                    "If true, set the Auth flag (tfSetfAuth). Can only be set if the lsfRequireAuth flag is enabled on the account."
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { idempotentHint: true },
    },
    async ({
        fromSeed,
        currency,
        issuer,
        limit,
        qualityIn,
        qualityOut,
        noRipple,
        freeze,
        auth,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
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

            // Create TrustSet transaction
            const trustSetTx: TrustSet = {
                TransactionType: "TrustSet",
                Account: wallet.address,
                LimitAmount: {
                    currency: currency,
                    issuer: issuer,
                    value: limit,
                },
                Flags: TrustSetFlags.tfSetNoRipple, // Default flag
            };

            // Set optional quality fields
            if (qualityIn) {
                trustSetTx.QualityIn = qualityIn;
            }
            if (qualityOut) {
                trustSetTx.QualityOut = qualityOut;
            }

            // Adjust flags based on boolean options
            let flags: number = trustSetTx.Flags ? Number(trustSetTx.Flags) : 0;

            if (noRipple === false) {
                // Clear NoRipple flag if explicitly set to false
                flags = flags & ~TrustSetFlags.tfSetNoRipple;
            } else if (
                noRipple === true &&
                !(flags & TrustSetFlags.tfSetNoRipple)
            ) {
                // Set NoRipple if explicitly true and not already set (though it's default)
                flags = flags | TrustSetFlags.tfSetNoRipple;
            }

            // Note: Setting tfClearNoRipple is usually done by clearing the flag bit

            if (freeze === true) {
                flags = flags | TrustSetFlags.tfSetFreeze;
            }
            if (freeze === false) {
                flags = flags | TrustSetFlags.tfClearFreeze;
            }

            if (auth === true) {
                flags = flags | TrustSetFlags.tfSetfAuth;
            } // No tfClearAuth equivalent, clearing requires different tx or issuer action

            trustSetTx.Flags = flags;

            // Add optional fee if provided
            if (fee) {
                trustSetTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(trustSetTx);
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
                                account: wallet.address,
                                currency,
                                issuer,
                                limit,
                                flagsSet: flags, // Return the final flags value
                                qualityIn,
                                qualityOut,
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
                        text: `Error setting Trust Line: ${
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
