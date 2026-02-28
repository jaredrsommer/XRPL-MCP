import { z } from "zod";
import { server } from "../../server/server.js";
import { executor, walletRegistry } from "../../core/custody/index.js";

server.registerTool(
    "token-clawback",
    {
        title: "Token Clawback",
        description: "Claw back tokens issued by your account from a holder",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            amount: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the token to claw back"),
                    issuer: z
                        .string()
                        .describe(
                            "Address of the holder (not the issuer) of the tokens"
                        ),
                    value: z.string().describe("Amount of tokens to claw back"),
                })
                .describe("Token amount details"),
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
    async ({ walletName, amount, fee, useTestnet }) => {
        try {
            // Validate amount
            if (parseFloat(amount.value) <= 0) {
                throw new Error("Clawback amount must be greater than zero");
            }

            // Validate holder address is not the same as issuer
            const provider = walletRegistry.resolve(walletName);
            if (amount.issuer === provider.getAddress()) {
                throw new Error(
                    "Holder address (in amount.issuer) cannot be the same as the issuer account"
                );
            }

            // Create Clawback transaction
            const tx: Record<string, unknown> = {
                TransactionType: "Clawback",
                Amount: {
                    currency: amount.currency,
                    issuer: amount.issuer,
                    value: amount.value,
                },
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "token-clawback",
                summary: {
                    transactionType: "Clawback",
                    fromAddress: "",
                    amount: amount.value,
                    currency: amount.currency,
                    description: `Claw back ${amount.value} ${amount.currency} from holder ${amount.issuer}`,
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
                        text: `Error performing token clawback: ${
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
