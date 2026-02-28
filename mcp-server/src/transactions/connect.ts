import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL, DEFAULT_SEED } from "../core/constants.js";
import {
    connectedWallet,
    isConnectedToTestnet,
    setConnectedWallet,
} from "../core/state.js";

// Register XRPL connection tool
server.registerTool(
    "connect-to-xrpl",
    {
        title: "Connect to XRPL",
        description: "Connect to XRP Ledger using seed from .env or create a new wallet",
        inputSchema: {
            useSeedFromEnv: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the seed from .env file (true) or create a new wallet (false). Defaults to true if a seed is configured."
                ),

        },
    },
    async ({ useSeedFromEnv }) => {
        let client: Client | null = null;
        let isTestnet = true; // Always use testnet
        let wallet;
        try {
            // Default to using env seed if available
            const useEnvSeed =
                useSeedFromEnv === undefined ? !!DEFAULT_SEED : useSeedFromEnv;

            if (useEnvSeed && DEFAULT_SEED) {
                // Always use testnet even for existing wallets
                client = await getXrplClient(true);
                wallet = Wallet.fromSeed(DEFAULT_SEED);
                console.error("Using wallet from .env seed on testnet");
            } else {
                // Use testnet for creating new wallets
                client = await getXrplClient(true);

                if (useEnvSeed && !DEFAULT_SEED) {
                    console.error(
                        "No seed found in .env, creating new wallet on testnet"
                    );
                }

                const fundResult = await client.fundWallet();
                wallet = fundResult.wallet;
            }

            // Store the connected wallet
            setConnectedWallet(wallet, isTestnet);

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
                                status: "connected",
                                network: TESTNET_URL,
                                networkType: "testnet",
                                wallet: {
                                    address: wallet.address,
                                    publicKey: wallet.publicKey,
                                    seed:
                                        !useEnvSeed || !DEFAULT_SEED
                                            ? wallet.seed
                                            : undefined,
                                },
                                usingEnvSeed: useEnvSeed && !!DEFAULT_SEED,
                                balance:
                                    accountInfo.result.account_data.Balance,
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
                        text: `Error connecting to XRPL: ${
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
