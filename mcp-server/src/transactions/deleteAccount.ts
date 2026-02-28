import { z } from "zod";
import { server } from "../server/server.js";
import { executor, walletRegistry } from "../core/custody/index.js";
import { getXrplClient } from "../core/services/clients.js";
import { isConnectedToTestnet } from "../core/state.js";

// Register delete-account tool
server.registerTool(
    "delete-account",
    {
        title: "Delete Account",
        description: "Delete an XRP Ledger account and send remaining XRP to a destination account",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            destinationAccount: z
                .string()
                .describe(
                    "XRP Ledger account address to receive remaining XRP (starts with r)"
                ),
            destinationTag: z
                .number()
                .optional()
                .describe("Optional destination tag to identify the recipient"),
            fee: z
                .string()
                .optional()
                .describe(
                    "Transaction fee (in XRP). Must be at least 0.2 XRP for account deletion."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({
        walletName,
        destinationAccount,
        destinationTag,
        fee,
        useTestnet,
    }) => {
        try {
            // Resolve wallet to get address for pre-validation
            const provider = walletRegistry.resolve(walletName);
            const address = provider.getAddress();

            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            // Set default fee to 0.2 XRP (minimum required for account deletion)
            const accountDeleteFee = fee || "200000"; // 0.2 XRP in drops

            // Pre-validation: check if deletion is possible
            let client = null;
            try {
                client = await getXrplClient(useTestnetNetwork);

                const accountInfo = await client.request({
                    command: "account_info",
                    account: address,
                    ledger_index: "validated",
                });

                // Verify sequence number isn't too high
                const currentLedgerIndex = await client.getLedgerIndex();
                if (
                    Number(accountInfo.result.account_data.Sequence) + 256 >=
                    currentLedgerIndex
                ) {
                    throw new Error(
                        "Account sequence number is too high for deletion. The sequence plus 256 must be less than the current ledger index."
                    );
                }
            } finally {
                if (client) await client.disconnect();
            }

            // Create AccountDelete transaction
            const tx: Record<string, unknown> = {
                TransactionType: "AccountDelete",
                Destination: destinationAccount,
                Fee: accountDeleteFee,
            };

            // Add destination tag if provided
            if (destinationTag !== undefined) {
                tx.DestinationTag = destinationTag;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "delete-account",
                summary: {
                    transactionType: "AccountDelete",
                    fromAddress: "",
                    toAddress: destinationAccount,
                    fee: accountDeleteFee,
                    description: `Delete account ${address} and send remaining XRP to ${destinationAccount}`,
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
                        text: `Error deleting account: ${
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
