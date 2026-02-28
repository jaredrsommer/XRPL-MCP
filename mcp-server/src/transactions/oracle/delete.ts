import { Client, Wallet, OracleDelete } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register oracle-delete tool
server.registerTool(
    "oracle-delete",
    {
        title: "Delete Oracle",
        description: "Delete an Oracle object on the XRP Ledger Price Oracle amendment is required",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet that owns the oracle. If not provided, the connected wallet will be used."
                ),
            oracleDocumentID: z
                .number()
                .int()
                .positive()
                .describe("The ID of the Oracle object to delete."),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Requires Price Oracle amendment enabled network. If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { destructiveHint: true },
    },
    async ({ fromSeed, oracleDocumentID, fee, useTestnet }) => {
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

            // Create OracleDelete transaction
            const oracleDeleteTx: OracleDelete = {
                TransactionType: "OracleDelete",
                Account: wallet.address,
                OracleDocumentID: oracleDocumentID,
            };

            // Add optional fee if provided
            if (fee) {
                oracleDeleteTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(oracleDeleteTx);
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
                                account: wallet.address,
                                deletedOracleDocumentID: oracleDocumentID,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                message:
                                    "Requires Price Oracle amendment (available on testnet/devnet)",
                                result: result.result,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            // Check for specific error indicating amendment not enabled
            if (
                error instanceof Error &&
                error.message.includes("Unsupported Transaction type")
            ) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error deleting Oracle: The OracleDelete transaction requires the Price Oracle amendment, which may not be enabled on the selected network (${
                                useTestnet ? "Testnet" : "Mainnet"
                            }). Original error: ${error.message}`,
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Error deleting Oracle: ${
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
