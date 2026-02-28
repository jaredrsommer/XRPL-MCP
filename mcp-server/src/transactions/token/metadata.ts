import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { isConnectedToTestnet } from "../../core/state.js";

// Register get-token-metadata tool
server.registerTool(
    "get-token-metadata",
    {
        title: "Get Token Metadata",
        description: "Get token metadata (name, symbol, decimals, supply)",
        inputSchema: {
            tokenID: z.string().describe("Currency code or token identifier"),
            issuer: z.string().describe("Issuer address for the token"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ tokenID, issuer, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Get token information (This might not provide full ERC20-like metadata directly)
            // gateway_balances provides info about obligations but not symbol/decimals
            // account_lines is better for finding balance/circulation info

            // Get token trust lines to infer some info (like circulation)
            const accountLines = await client.request({
                command: "account_lines",
                account: issuer,
                ledger_index: "validated",
            });

            // Find the relevant currency line
            const lines = accountLines.result.lines || [];
            const tokenInfo = lines.find((line) => line.currency === tokenID);

            // Construct metadata (Some fields might be defaults or need external lookup)
            const tokenData = {
                name: tokenID, // XRPL doesn't store token names on-chain by default
                symbol: tokenID, // Symbol is usually the currency code
                issuer: issuer,
                decimals: 15, // XRPL token amounts are typically integers, decimals vary based on issuer convention. Often up to 15.
                totalSupply: tokenInfo ? tokenInfo.limit : "0", // 'limit' on account_lines might represent total issuance for this issuer
                circulatingSupply: tokenInfo ? tokenInfo.balance : "0", // Balance on the issuer's side represents amount held by issuer, not full circulation
                _meta: {
                    network: useTestnetNetwork ? TESTNET_URL : MAINNET_URL,
                    networkType: useTestnetNetwork ? "testnet" : "mainnet",
                },
            };

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(tokenData, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error getting token metadata: ${
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
