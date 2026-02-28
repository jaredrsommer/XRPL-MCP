import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register payment-channel-create tool
server.registerTool(
    "payment-channel-create",
    {
        title: "Create Payment Channel",
        description: "Create a Payment Channel on the XRP Ledger for off-ledger payments",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to allocate to the channel."),
            destination: z
                .string()
                .describe("Address of the recipient (destination) of the channel."),
            settleDelay: z
                .number()
                .int()
                .positive()
                .describe(
                    "Amount of time in seconds the source address must wait after requesting to close the channel before it closes."
                ),
            publicKey: z
                .string()
                .describe(
                    "The public key of the key pair the source will use to sign claims against this channel, in hexadecimal."
                ),
            cancelAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional timestamp (seconds since Ripple Epoch) after which the channel becomes expired."
                ),
            destinationTag: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional arbitrary unsigned 32-bit integer tag for the destination."
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
        amount,
        destination,
        settleDelay,
        publicKey,
        cancelAfter,
        destinationTag,
        fee,
        useTestnet,
    }) => {
        try {
            // Create PaymentChannelCreate transaction
            const tx: Record<string, unknown> = {
                TransactionType: "PaymentChannelCreate",
                Amount: amount,
                Destination: destination,
                SettleDelay: settleDelay,
                PublicKey: publicKey,
            };

            // Add optional fields
            if (cancelAfter) {
                tx.CancelAfter = cancelAfter;
            }
            if (destinationTag) {
                tx.DestinationTag = destinationTag;
            }
            if (fee) {
                tx.Fee = fee;
            }

            // Result extractor to get channelId from CreatedNode metadata
            const resultExtractor = (result: Record<string, unknown>): Record<string, unknown> => {
                const meta = result.meta as Record<string, unknown> | undefined;
                if (meta && typeof meta !== "string" && Array.isArray(meta.AffectedNodes)) {
                    for (const node of meta.AffectedNodes) {
                        const created = (node as Record<string, unknown>).CreatedNode as Record<string, unknown> | undefined;
                        if (created && created.LedgerEntryType === "PayChannel") {
                            return { channelId: created.LedgerIndex as string };
                        }
                    }
                }
                return {};
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "payment-channel-create",
                resultExtractor,
                summary: {
                    transactionType: "PaymentChannelCreate",
                    fromAddress: "",
                    toAddress: destination,
                    amount,
                    currency: "XRP",
                    description: `Create payment channel to ${destination} with ${amount} drops and ${settleDelay}s settle delay`,
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
                        text: `Error creating Payment Channel: ${
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
