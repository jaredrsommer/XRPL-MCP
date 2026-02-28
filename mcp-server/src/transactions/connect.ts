import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { TESTNET_URL, DEFAULT_SEED } from "../core/constants.js";
import { setConnectedWallet } from "../core/state.js";
import { walletRegistry, EnvCustodyProvider } from "../core/custody/index.js";

// Register XRPL connection tool
server.registerTool(
    "connect-to-xrpl",
    {
        title: "Connect to XRPL",
        description: "Connect to XRP Ledger using seed from .env or create a new wallet. Registers the wallet in the custody system.",
        inputSchema: {
            useSeedFromEnv: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the seed from .env file (true) or create a new wallet (false). Defaults to true if a seed is configured."
                ),
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name to register this wallet under. Defaults to 'default'."
                ),
        },
    },
    async ({ useSeedFromEnv, walletName = "default" }) => {
        let client: Client | null = null;
        let wallet: Wallet;
        try {
            // Default to using env seed if available
            const useEnvSeed =
                useSeedFromEnv === undefined ? !!DEFAULT_SEED : useSeedFromEnv;

            if (useEnvSeed && DEFAULT_SEED) {
                client = await getXrplClient(true);
                wallet = Wallet.fromSeed(DEFAULT_SEED);
                console.error("Using wallet from .env seed on testnet");
            } else {
                client = await getXrplClient(true);

                if (useEnvSeed && !DEFAULT_SEED) {
                    console.error(
                        "No seed found in .env, creating new wallet on testnet"
                    );
                }

                const fundResult = await client.fundWallet();
                wallet = fundResult.wallet;
            }

            // Store in legacy state for backward compatibility
            setConnectedWallet(wallet, true);

            // Register in the new wallet registry
            if (wallet.seed) {
                const provider = new EnvCustodyProvider(walletName, wallet.seed);
                walletRegistry.register(walletName, provider);
                console.error(
                    `Wallet "${walletName}" registered (${wallet.address})`
                );
            }

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
                                walletName,
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
                                registeredWallets: walletRegistry.list(),
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
