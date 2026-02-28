import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register check-token-balance tool
server.registerTool(
    "check-token-balance",
    {
        title: "Check Token Balance",
        description: "Check token balance for an address",
        inputSchema: {
            address: z
                .string()
                .optional()
                .describe("Account address to check balance for"),
            currency: z.string().describe("Currency code"),
            issuer: z.string().describe("Issuer address for the token"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ address, currency, issuer, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided address or connected wallet's address
            const accountAddress =
                address ||
                (connectedWallet ? connectedWallet.address : undefined);

            if (!accountAddress) {
                throw new Error("No address provided and no wallet connected.");
            }

            const response = await client.request({
                command: "account_lines",
                account: accountAddress,
                ledger_index: "validated",
            });

            // Find the specific token in the trust lines
            const lines = response.result.lines || [];
            const tokenLine = lines.find(
                (line) => line.currency === currency && line.account === issuer
            );

            const balance = tokenLine ? tokenLine.balance : "0";

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                address: accountAddress,
                                currency,
                                issuer,
                                balance,
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
                        text: `Error checking token balance: ${
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
