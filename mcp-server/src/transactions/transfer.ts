import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { executor } from "../core/custody/index.js";

// Register XRPL transfer tool
server.registerTool(
    "transfer-xrp",
    {
        title: "Transfer XRP",
        description: "Transfer XRP between accounts using the connected wallet or a named wallet",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            toAddress: z
                .string()
                .describe(
                    "XRP Ledger account address to send XRP to (starts with r)"
                ),
            amount: z.string().describe("Amount of XRP to send"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, toAddress, amount, useTestnet }) => {
        try {
            const tx = {
                TransactionType: "Payment",
                Amount: xrpl.xrpToDrops(amount),
                Destination: toAddress,
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "transfer-xrp",
                summary: {
                    transactionType: "Payment",
                    fromAddress: "",
                    toAddress,
                    amount,
                    currency: "XRP",
                    description: `Transfer ${amount} XRP to ${toAddress}`,
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
                        text: `Error transferring XRP: ${
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
