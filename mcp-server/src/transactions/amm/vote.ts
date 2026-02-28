import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register amm-vote tool
server.registerTool(
    "amm-vote",
    {
        title: "AMM Vote",
        description: "Vote on parameters for an Automated Market Maker (AMM)",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            asset1: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the first asset"),
                    issuer: z
                        .string()
                        .optional()
                        .describe(
                            "Issuer address of the first asset (not needed for XRP)"
                        ),
                })
                .describe("First asset in the AMM's pool"),
            asset2: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the second asset"),
                    issuer: z
                        .string()
                        .optional()
                        .describe(
                            "Issuer address of the second asset (not needed for XRP)"
                        ),
                })
                .describe("Second asset in the AMM's pool"),
            tradingFee: z
                .number()
                .min(0)
                .max(1000)
                .optional()
                .describe("Trading fee in basis points (0-1000, where 100 = 1%)"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
    },
    async ({ walletName, asset1, asset2, tradingFee, fee, useTestnet }) => {
        try {
            // Format assets for the transaction
            const formatAsset = (asset: {
                currency: string;
                issuer?: string;
            }) => {
                if (asset.currency === "XRP") {
                    return { currency: "XRP" };
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer is required for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                    };
                }
            };

            // Create AMMVote transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AMMVote",
                Asset: formatAsset(asset1),
                Asset2: formatAsset(asset2),
            };

            // Add optional fields if provided
            if (tradingFee !== undefined) {
                tx.TradingFee = tradingFee;
            }

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "amm-vote",
                summary: {
                    transactionType: "AMMVote",
                    fromAddress: "",
                    description: `Vote on AMM pool ${asset1.currency}/${asset2.currency}${tradingFee !== undefined ? ` with trading fee ${tradingFee} bps` : ""}`,
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
                        text: `Error voting on AMM: ${
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
