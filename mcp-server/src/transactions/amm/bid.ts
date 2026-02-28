import { Currency, IssuedCurrencyAmount } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register amm-bid tool
server.registerTool(
    "amm-bid",
    {
        title: "AMM Bid",
        description: "Place a bid on an Automated Market Maker's (AMM) auction slot on the XRP Ledger",
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
            bidMin: z
                .object({
                    currency: z.string().describe("Currency code of the bid"),
                    issuer: z.string().describe("Issuer address of the bid token"),
                    value: z.string().describe("Minimum bid amount"),
                })
                .optional()
                .describe(
                    "Minimum amount for the bid. Required unless bidMax is provided."
                ),
            bidMax: z
                .object({
                    currency: z.string().describe("Currency code of the bid"),
                    issuer: z.string().describe("Issuer address of the bid token"),
                    value: z.string().describe("Maximum bid amount"),
                })
                .optional()
                .describe(
                    "Maximum amount for the bid. Required unless bidMin is provided."
                ),
            authAccounts: z
                .array(
                    z
                        .object({
                            account: z.string().describe("Account address"),
                        })
                        .describe("An authorized account")
                )
                .max(4)
                .optional()
                .describe(
                    "List of up to 4 accounts authorized to trade at the discounted fee."
                ),
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
        bidMin,
        bidMax,
        authAccounts,
        fee,
        useTestnet,
    }) => {
        try {
            // Format amounts and assets
            const formatAmount = (amountInput: {
                currency: string;
                issuer: string;
                value: string;
            }): IssuedCurrencyAmount => {
                return {
                    currency: amountInput.currency,
                    issuer: amountInput.issuer,
                    value: amountInput.value,
                };
            };

            const formatAsset = (asset: {
                currency: string;
                issuer?: string;
            }): Currency => {
                if (asset.currency === "XRP") {
                    return { currency: "XRP" };
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer must be provided for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                    };
                }
            };

            // Create AMMBid transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AMMBid",
                Asset: formatAsset(asset1),
                Asset2: formatAsset(asset2),
            };

            // Add bid amounts using formatAmount
            if (bidMin) {
                tx.BidMin = formatAmount(bidMin);
            } else if (bidMax) {
                tx.BidMax = formatAmount(bidMax);
            } else {
                throw new Error("Either bidMin or bidMax must be provided.");
            }

            // Add optional auth accounts
            if (authAccounts && authAccounts.length > 0) {
                tx.AuthAccounts = authAccounts.map((a) => ({
                    AuthAccount: { Account: a.account },
                }));
            }

            // Add optional fee if provided
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "amm-bid",
                summary: {
                    transactionType: "AMMBid",
                    fromAddress: "",
                    description: `Place AMM bid on pool ${asset1.currency}/${asset2.currency}`,
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
                        text: `Error placing AMM bid: ${
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
