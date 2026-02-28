import { xrpToDrops, Amount } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

server.registerTool(
    "amm-create",
    {
        title: "Create AMM",
        description: "Create a new Automated Market Maker (AMM) on the XRP Ledger",
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
                    value: z
                        .string()
                        .describe("Amount of the first asset to deposit"),
                })
                .describe("First asset to deposit in the AMM's pool"),
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
                    value: z
                        .string()
                        .describe("Amount of the second asset to deposit"),
                })
                .describe("Second asset to deposit in the AMM's pool"),
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
            // Format amounts for the transaction
            const formatAmount = (asset: {
                currency: string;
                issuer?: string;
                value: string;
            }): Amount => {
                if (asset.currency === "XRP") {
                    return xrpToDrops(asset.value);
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer must be provided for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value,
                    };
                }
            };

            // Create AMMCreate transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AMMCreate",
                Amount: formatAmount(asset1),
                Amount2: formatAmount(asset2),
                TradingFee: tradingFee !== undefined ? tradingFee : 0,
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "amm-create",
                summary: {
                    transactionType: "AMMCreate",
                    fromAddress: "",
                    amount: asset1.value,
                    currency: asset1.currency,
                    description: `Create AMM pool ${asset1.currency}/${asset2.currency} with trading fee ${tradingFee !== undefined ? tradingFee : 0} bps`,
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
                        text: `Error creating AMM: ${
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
