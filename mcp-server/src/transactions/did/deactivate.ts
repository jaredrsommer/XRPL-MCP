import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";
import { retrieveDIDDocument, storeDIDDocument } from "../../core/utils.js";

// Register deactivate-did tool
server.registerTool(
    "deactivate-did",
    {
        title: "Deactivate DID",
        description: "Deactivate a DID by marking it as revoked",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Seed of the wallet that controls the DID, if not using connected wallet"
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { destructiveHint: true },
    },
    async ({ fromSeed, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            const networkStr = useTestnetNetwork ? "testnet" : "mainnet";
            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first or provide a fromSeed."
                );
            }

            // Get existing DID document
            const existingDidDocument = await retrieveDIDDocument(
                client,
                wallet.address
            );

            if (!existingDidDocument) {
                throw new Error(
                    "No existing DID document found to deactivate."
                );
            }

            // Update DID document to mark as deactivated
            const deactivatedDidDocument = {
                ...existingDidDocument,
                updated: new Date().toISOString(),
                deactivated: true,
            };

            // Store deactivated DID document
            const result = await storeDIDDocument(
                client,
                wallet,
                deactivatedDidDocument
            );

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
                                did: deactivatedDidDocument.id,
                                deactivated: true,
                                transaction: result.result.hash,
                                _meta: {
                                    network: useTestnetNetwork
                                        ? TESTNET_URL
                                        : MAINNET_URL,
                                    networkType: networkStr,
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
                        text: `Error deactivating DID: ${
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
