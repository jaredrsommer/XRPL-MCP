import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register check-cash tool
server.registerTool(
    "check-cash",
    {
        title: "Cash Check",
        description: "Cash a Check to receive funds from it",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            checkID: z
                .string()
                .describe(
                    "The ID of the Check ledger object to cash, as a 64-character hexadecimal string"
                ),
            amount: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (not needed for XRP)"),
                    value: z.string().describe("Amount to cash"),
                })
                .optional()
                .describe(
                    "Amount to cash. Required for Checks with a sendMax, or to cash a lesser amount"
                ),
            deliverMin: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (not needed for XRP)"),
                    value: z.string().describe("Minimum amount to receive"),
                })
                .optional()
                .describe(
                    "Minimum amount to receive. Required for Checks with an amount"
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, checkID, amount, deliverMin, fee, useTestnet }) => {
        try {
            // Format amounts for the transaction
            const formatAmount = (asset: {
                currency: string;
                issuer?: string;
                value: string;
            }) => {
                if (asset.currency === "XRP") {
                    return xrpl.xrpToDrops(asset.value);
                } else {
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value,
                    };
                }
            };

            const tx: Record<string, unknown> = {
                TransactionType: "CheckCash",
                CheckID: checkID,
            };

            // Add either Amount or DeliverMin - one is required but not both
            if (amount) {
                tx.Amount = formatAmount(amount);
            } else if (deliverMin) {
                tx.DeliverMin = formatAmount(deliverMin);
            } else {
                throw new Error(
                    "Either amount or deliverMin must be provided to cash a Check"
                );
            }

            if (fee) {
                tx.Fee = fee;
            }

            const cashDescription = amount
                ? `Cash Check ${checkID} for ${amount.value} ${amount.currency}`
                : `Cash Check ${checkID} with min ${deliverMin!.value} ${deliverMin!.currency}`;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "check-cash",
                summary: {
                    transactionType: "CheckCash",
                    fromAddress: "",
                    amount: amount?.value || deliverMin?.value,
                    currency: amount?.currency || deliverMin?.currency,
                    description: cashDescription,
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
                        text: `Error cashing Check: ${
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
