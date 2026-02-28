import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register approve-token-spending tool (TrustSet)
server.registerTool(
    "approve-token-spending",
    {
        title: "Approve Token Spending",
        description: "Establish trust line to approve token usage",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            currency: z.string().describe("Currency code"),
            issuer: z.string().describe("Issuer address for the token"),
            limit: z.string().describe("Maximum amount approved for use"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, currency, issuer, limit, useTestnet }) => {
        try {
            const tx = {
                TransactionType: "TrustSet",
                LimitAmount: {
                    currency,
                    issuer,
                    value: limit,
                },
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "approve-token-spending",
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
                        text: `Error setting trust line: ${
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
