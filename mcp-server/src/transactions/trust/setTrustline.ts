import { TrustSetFlags } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register set-trustline tool
server.registerTool(
    "set-trustline",
    {
        title: "Set Trustline",
        description: "Create or modify a trust line on the XRP Ledger, allowing you to hold non-XRP assets",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
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
        walletName,
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
        try {
            // Build flags
            let flags: number = TrustSetFlags.tfSetNoRipple; // Default flag

            if (noRipple === false) {
                flags = flags & ~TrustSetFlags.tfSetNoRipple;
            } else if (
                noRipple === true &&
                !(flags & TrustSetFlags.tfSetNoRipple)
            ) {
                flags = flags | TrustSetFlags.tfSetNoRipple;
            }

            if (freeze === true) {
                flags = flags | TrustSetFlags.tfSetFreeze;
            }
            if (freeze === false) {
                flags = flags | TrustSetFlags.tfClearFreeze;
            }

            if (auth === true) {
                flags = flags | TrustSetFlags.tfSetfAuth;
            }

            // Create TrustSet transaction
            const tx: Record<string, unknown> = {
                TransactionType: "TrustSet",
                LimitAmount: {
                    currency,
                    issuer,
                    value: limit,
                },
                Flags: flags,
            };

            if (qualityIn) {
                tx.QualityIn = qualityIn;
            }
            if (qualityOut) {
                tx.QualityOut = qualityOut;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "set-trustline",
                summary: {
                    transactionType: "TrustSet",
                    fromAddress: "",
                    amount: limit,
                    currency,
                    description: `Set trust line for ${currency} (issuer: ${issuer}) with limit ${limit}`,
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "pending_approval",
                                transactionId: result.pendingTransaction.id,
                                summary: result.pendingTransaction.summary,
                                expiresAt: result.pendingTransaction.expiresAt,
                                network: result.pendingTransaction.network,
                                networkType: result.pendingTransaction.networkType,
                                message: result.message,
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
        }
    }
);
