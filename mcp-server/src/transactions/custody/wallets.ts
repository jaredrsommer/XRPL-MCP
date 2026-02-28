import { z } from "zod";
import { server } from "../../server/server.js";
import { walletRegistry } from "../../core/custody/index.js";

// List registered wallets
server.registerTool(
    "list-wallets",
    {
        title: "List Wallets",
        description:
            "List all registered wallets in the custody system, showing their names, addresses, and types.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
    },
    async () => {
        try {
            const wallets = walletRegistry.list();

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                count: wallets.length,
                                defaultWallet: walletRegistry.getDefaultName(),
                                wallets,
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
                        text: `Error listing wallets: ${
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

// Set the default wallet
server.registerTool(
    "set-default-wallet",
    {
        title: "Set Default Wallet",
        description:
            "Set the default wallet used for transactions when no wallet name is specified.",
        inputSchema: {
            walletName: z
                .string()
                .describe(
                    "The name of the registered wallet to set as the default."
                ),
        },
    },
    async ({ walletName }) => {
        try {
            walletRegistry.setDefault(walletName);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "success",
                                defaultWallet: walletName,
                                message: `Default wallet set to "${walletName}".`,
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
                        text: `Error setting default wallet: ${
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
