import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register payment-channel-fund tool
server.registerTool(
    "payment-channel-fund",
    {
        title: "Fund Payment Channel",
        description: "Add additional XRP to an existing Payment Channel",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            channel: z
                .string()
                .describe("The ID of the Payment Channel to add funds to."),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to add to the channel."),
            expiration: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional: New expiration time (seconds since Ripple Epoch) for the channel. Must be later than the existing expiration."
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
    async ({ walletName, channel, amount, expiration, fee, useTestnet }) => {
        try {
            // Create PaymentChannelFund transaction
            const tx: Record<string, unknown> = {
                TransactionType: "PaymentChannelFund",
                Channel: channel,
                Amount: amount,
            };

            // Add optional expiration
            if (expiration) {
                tx.Expiration = expiration;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "payment-channel-fund",
                summary: {
                    transactionType: "PaymentChannelFund",
                    fromAddress: "",
                    amount,
                    currency: "XRP",
                    description: `Fund payment channel ${channel} with ${amount} drops`,
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
                        text: `Error funding Payment Channel: ${
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
