import { xrpToDrops } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Define asset type
type Asset = {
    currency: string;
    issuer?: string;
    value?: string;
};

// Register amm-deposit tool
server.registerTool(
    "amm-deposit",
    {
        title: "AMM Deposit",
        description: "Deposit assets into an existing Automated Market Maker (AMM) on the XRP Ledger",
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
            amount1: z
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
                .optional()
                .describe("Amount of the first asset to deposit"),
            amount2: z
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
                .optional()
                .describe("Amount of the second asset to deposit"),
            lpTokensOut: z
                .object({
                    currency: z.string().describe("Currency code of LP token"),
                    issuer: z.string().describe("Issuer address of LP token"),
                    value: z
                        .string()
                        .describe("Minimum amount of LP tokens to receive"),
                })
                .optional()
                .describe("Minimum amount of LP tokens to receive"),
            singleAsset: z
                .boolean()
                .optional()
                .describe("Whether to deposit only a single asset type"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
    },
    async ({
        walletName,
        asset1,
        asset2,
        amount1,
        amount2,
        lpTokensOut,
        singleAsset,
        fee,
        useTestnet,
    }) => {
        try {
            // Format assets for the transaction
            const formatAsset = (
                asset: Asset
            ): { currency: string; issuer?: string } => {
                if (asset.currency === "XRP") {
                    return { currency: "XRP" };
                } else {
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                    };
                }
            };

            // Format amounts for the transaction
            const formatAmount = (
                asset: Asset
            ):
                | string
                | { currency: string; issuer?: string; value: string } => {
                if (asset.currency === "XRP") {
                    return xrpToDrops(asset.value || "0");
                } else {
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value || "0",
                    };
                }
            };

            // Create AMMDeposit transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AMMDeposit",
                Asset: formatAsset(asset1),
                Asset2: formatAsset(asset2),
            };

            // Add optional fields if provided
            if (amount1) {
                tx.Amount = formatAmount(amount1);
            }
            if (amount2) {
                tx.Amount2 = formatAmount(amount2);
            }
            if (lpTokensOut) {
                tx.LPTokenOut = lpTokensOut;
            }

            // Set flags if needed
            if (singleAsset) {
                // Set the tfSingleAsset flag (0x00080000 = 524288)
                tx.Flags = 0x00080000;
            }

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "amm-deposit",
                summary: {
                    transactionType: "AMMDeposit",
                    fromAddress: "",
                    amount: amount1?.value || amount2?.value,
                    currency: amount1?.currency || amount2?.currency,
                    description: `Deposit into AMM pool ${asset1.currency}/${asset2.currency}${singleAsset ? " (single asset)" : ""}`,
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
                        text: `Error depositing to AMM: ${
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
