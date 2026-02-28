import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";
import { retrieveDIDDocument, storeDIDDocument } from "../../core/utils.js";

// Register update-did tool
server.registerTool(
    "update-did",
    {
        title: "Update DID",
        description: "Update a DID document with new properties",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Seed of the wallet that controls the DID, if not using connected wallet"
                ),
            additionalKeys: z
                .array(
                    z.object({
                        id: z.string(),
                        type: z.string(),
                        publicKeyHex: z.string(),
                    })
                )
                .optional()
                .describe(
                    "Additional verification keys to add to the DID document"
                ),
            serviceEndpoints: z
                .array(
                    z.object({
                        id: z.string(),
                        type: z.string(),
                        serviceEndpoint: z.string(),
                    })
                )
                .optional()
                .describe("Service endpoints to add to the DID document"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { idempotentHint: true },
    },
    async ({ fromSeed, additionalKeys, serviceEndpoints, useTestnet }) => {
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
                    "No existing DID document found. Create a DID first."
                );
            }

            // Update DID document
            const updatedDidDocument = {
                ...existingDidDocument,
                updated: new Date().toISOString(),
            };

            // Add additional verification methods if provided
            if (additionalKeys && additionalKeys.length > 0) {
                const allKeys = [
                    ...(updatedDidDocument.verificationMethod || []),
                    ...additionalKeys.map((key) => ({
                        ...key,
                        controller: updatedDidDocument.id,
                    })),
                ];

                // Remove duplicates by id
                const keyMap = new Map();
                allKeys.forEach((key) => keyMap.set(key.id, key));
                updatedDidDocument.verificationMethod = Array.from(
                    keyMap.values()
                );
            }

            // Add service endpoints if provided
            if (serviceEndpoints && serviceEndpoints.length > 0) {
                if (!updatedDidDocument.service) {
                    updatedDidDocument.service = [];
                }

                const allServices = [
                    ...updatedDidDocument.service,
                    ...serviceEndpoints,
                ];

                // Remove duplicates by id
                const serviceMap = new Map();
                allServices.forEach((service) =>
                    serviceMap.set(service.id, service)
                );
                updatedDidDocument.service = Array.from(serviceMap.values());
            }

            // Store updated DID document
            const result = await storeDIDDocument(
                client,
                wallet,
                updatedDidDocument
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
                                did: updatedDidDocument.id,
                                transaction: result.result.hash,
                                didDocument: updatedDidDocument,
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
                        text: `Error updating DID: ${
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