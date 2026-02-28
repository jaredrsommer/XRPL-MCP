import { z } from "zod";
import { server } from "../../server/server.js";
import { executor, walletRegistry } from "../../core/custody/index.js";
import { retrieveDIDDocument } from "../../core/utils.js";
import { getXrplClient } from "../../core/services/clients.js";
import { isConnectedToTestnet } from "../../core/state.js";

// Register update-did tool
server.registerTool(
    "update-did",
    {
        title: "Update DID",
        description: "Update a DID document with new properties",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
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
    async ({ walletName, additionalKeys, serviceEndpoints, useTestnet }) => {
        try {
            // Resolve wallet to get address for DID document retrieval
            const provider = walletRegistry.resolve(walletName);
            const address = provider.getAddress();

            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            // Get existing DID document via a temporary client connection
            let client = null;
            let existingDidDocument;
            try {
                client = await getXrplClient(useTestnetNetwork);
                existingDidDocument = await retrieveDIDDocument(client, address);
            } finally {
                if (client) await client.disconnect();
            }

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

            // Build the transaction to store updated DID document
            const didDocumentStr = JSON.stringify(updatedDidDocument);
            const tx: Record<string, unknown> = {
                TransactionType: "AccountSet",
                Memos: [
                    {
                        Memo: {
                            MemoType: Buffer.from("did:document")
                                .toString("hex")
                                .toUpperCase(),
                            MemoData: Buffer.from(didDocumentStr)
                                .toString("hex")
                                .toUpperCase(),
                        },
                    },
                ],
            };

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "update-did",
                summary: {
                    transactionType: "DIDSet",
                    fromAddress: "",
                    description: `Update DID for account ${address}`,
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "pending_approval",
                                transactionId: result.pendingTransaction.id,
                                summary: result.pendingTransaction.summary,
                                expiresAt: result.pendingTransaction.expiresAt,
                                network: result.pendingTransaction.network,
                                networkType: result.pendingTransaction.networkType,
                                did: updatedDidDocument.id,
                                message: result.message,
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
        }
    }
);
