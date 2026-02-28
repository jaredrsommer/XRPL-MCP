import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

// Register set-regular-key tool
server.registerTool(
    "set-regular-key",
    {
        title: "Set Regular Key",
        description: "Assign, change, or remove a regular key pair for an account",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
                ),
            regularKey: z
                .string()
                .optional()
                .describe(
                    "Address of the regular key to assign. If omitted, removes any existing regular key"
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { idempotentHint: true },
    },
    async ({ fromSeed, regularKey, fee, useTestnet }) => {
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

            // Create SetRegularKey transaction
            const setRegularKeyTx: any = {
                TransactionType: "SetRegularKey",
                Account: wallet.address,
            };

            // Add optional regularKey if provided
            if (regularKey !== undefined) {
                setRegularKeyTx.RegularKey = regularKey;
            }

            // Add optional fee if provided
            if (fee) {
                setRegularKeyTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(setRegularKeyTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Get updated account info
            const accountInfo = await client.request({
                command: "account_info",
                account: wallet.address,
                ledger_index: "validated",
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                account: wallet.address,
                                regularKey: regularKey || "removed",
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                accountInfo: accountInfo.result.account_data,
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
                        text: `Error setting regular key: ${
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
