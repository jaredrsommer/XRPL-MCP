import { z } from "zod";
import { server } from "../../server/server.js";
import { executor, walletRegistry } from "../../core/custody/index.js";
import { createDIDDocument } from "../../core/utils.js";

// Register create-did tool
server.registerTool(
    "create-did",
    {
        title: "Create DID",
        description: "Create a decentralized identifier (DID) for an XRPL account",
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
    },
    async ({ walletName, useTestnet }) => {
        try {
            // Resolve wallet to get address and public key for DID document creation
            const provider = walletRegistry.resolve(walletName);
            const address = provider.getAddress();
            const publicKey = provider.getPublicKey();
            const networkStr = useTestnet ? "testnet" : "mainnet";

            // Create DID document
            const didDocument = createDIDDocument(address, publicKey, networkStr);

            // Build the DIDSet transaction with memo containing the DID document
            const didDocumentStr = JSON.stringify(didDocument);
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
                toolName: "create-did",
                summary: {
                    transactionType: "DIDSet",
                    fromAddress: "",
                    description: `Create DID for account ${address} (${networkStr})`,
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
                                did: didDocument.id,
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
                        text: `Error creating DID: ${
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
