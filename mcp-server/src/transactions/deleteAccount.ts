import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

// Register delete-account tool
server.registerTool(
    "delete-account",
    {
        title: "Delete Account",
        description: "Delete an XRP Ledger account and send remaining XRP to a destination account",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to delete. If not provided, the connected wallet will be used."
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
        fromSeed,
        destinationAccount,
        destinationTag,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Set default fee to 0.2 XRP (minimum required for account deletion)
            const accountDeleteFee = fee || "200000"; // 0.2 XRP in drops

            // Create AccountDelete transaction
            const deleteTransaction: any = {
                TransactionType: "AccountDelete",
                Account: wallet.address,
                Destination: destinationAccount,
                Fee: accountDeleteFee,
            };

            // Add destination tag if provided
            if (destinationTag !== undefined) {
                deleteTransaction.DestinationTag = destinationTag;
            }

            // Get account info to check if deletion is possible
            try {
                const accountInfo = await client.request({
                    command: "account_info",
                    account: wallet.address,
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
            } catch (error) {
                if (error instanceof Error) {
                    throw error;
                }
                throw new Error("Failed to validate account for deletion");
            }

            // Submit with fail_hard to avoid paying the fee if deletion fails
            const prepared = await client.autofill(deleteTransaction);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                deletedAccount: wallet.address,
                                destinationAccount,
                                destinationTag,
                                fee: accountDeleteFee,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
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
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
