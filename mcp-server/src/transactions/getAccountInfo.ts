import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

// Register XRPL get-account-info tool
server.registerTool(
    "get-account-info",
    {
        title: "Get Account Info",
        description: "Get account information from the XRP Ledger",
        inputSchema: {
            address: z
                .string()
                .optional()
                .describe(
                    "XRP Ledger account address (starts with r). If not provided, uses the connected wallet's address."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ address, useTestnet }) => {
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided address or connected wallet's address
            const accountAddress =
                address ||
                (connectedWallet ? connectedWallet.address : undefined);

            if (!accountAddress) {
                throw new Error(
                    "No address provided and no wallet connected. Please connect first using connect-to-xrpl tool or provide an address."
                );
            }

            const response = await client.request({
                command: "account_info",
                account: accountAddress,
                ledger_index: "validated",
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                ...response.result,
                                _meta: {
                                    network: useTestnetNetwork
                                        ? TESTNET_URL
                                        : MAINNET_URL,
                                    networkType: useTestnetNetwork
                                        ? "testnet"
                                        : "mainnet",
                                },
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
                        text: `Error getting account info: ${
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