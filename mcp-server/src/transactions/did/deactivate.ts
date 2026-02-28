import { z } from "zod";
import { server } from "../../server/server.js";
import { executor, walletRegistry } from "../../core/custody/index.js";
import { retrieveDIDDocument } from "../../core/utils.js";
import { getXrplClient } from "../../core/services/clients.js";
import { isConnectedToTestnet } from "../../core/state.js";

// Register deactivate-did tool
server.registerTool(
    "deactivate-did",
    {
        title: "Deactivate DID",
        description: "Deactivate a DID by marking it as revoked",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, useTestnet }) => {
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
                    "No existing DID document found to deactivate."
                );
            }

            // Update DID document to mark as deactivated
            const deactivatedDidDocument = {
                ...existingDidDocument,
                updated: new Date().toISOString(),
                deactivated: true,
            };

            // Build the transaction to store deactivated DID document
            const didDocumentStr = JSON.stringify(deactivatedDidDocument);
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
                toolName: "deactivate-did",
                summary: {
                    transactionType: "DIDDelete",
                    fromAddress: "",
                    description: `Deactivate DID for account ${address}`,
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
                                did: deactivatedDidDocument.id,
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
                        text: `Error deactivating DID: ${
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
