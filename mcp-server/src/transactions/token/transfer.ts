import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register transfer-token tool
server.registerTool(
    "transfer-token",
    {
        title: "Transfer Token",
        description: "Transfer tokens between addresses",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            toAddress: z.string().describe("Destination address"),
            currency: z.string().describe("Currency code"),
            issuer: z.string().describe("Issuer address for the token"),
            amount: z.string().describe("Amount to send"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use testnet or mainnet"
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, toAddress, currency, issuer, amount, useTestnet }) => {
        try {
            const tx = {
                TransactionType: "Payment",
                Destination: toAddress,
                Amount: {
                    currency,
                    issuer,
                    value: amount,
                },
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "transfer-token",
                summary: {
                    transactionType: "Payment",
                    fromAddress: "",
                    toAddress,
                    amount,
                    currency,
                    description: `Transfer ${amount} ${currency} to ${toAddress}`,
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
                        text: `Error transferring token: ${
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
