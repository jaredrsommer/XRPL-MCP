import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register transfer-nft tool
server.registerTool(
    "transfer-nft",
    {
        title: "Transfer NFT",
        description: "Transfer NFT between addresses",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            toAddress: z.string().describe("Destination address"),
            tokenID: z.string().describe("NFT token ID to transfer"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, toAddress, tokenID, useTestnet }) => {
        try {
            // Create NFT transfer transaction (via NFTokenCreateOffer for 0 amount)
            const tx: Record<string, unknown> = {
                TransactionType: "NFTokenCreateOffer",
                NFTokenID: tokenID,
                Amount: "0",
                Flags: 1, // tfSellNFToken
                Destination: toAddress,
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "transfer-nft",
                summary: {
                    transactionType: "NFTokenCreateOffer",
                    fromAddress: "",
                    toAddress,
                    description: `Transfer NFT ${tokenID} to ${toAddress}`,
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
                                networkType:
                                    result.pendingTransaction.networkType,
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
                        text: `Error transferring NFT: ${
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
