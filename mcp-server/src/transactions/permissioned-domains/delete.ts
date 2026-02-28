import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

server.registerTool(
    "permissioned-domain-delete",
    {
        title: "Delete Permissioned Domain",
        description: "Delete a Permissioned Domain from the XRP Ledger. Only the domain owner can delete a domain.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            domainID: z
                .string()
                .describe(
                    "The ID of the Permissioned Domain to delete (64-character hex string)."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({
        walletName,
        domainID,
        fee,
        useTestnet,
    }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "PermissionedDomainDelete",
                DomainID: domainID,
            };

            if (fee) tx.Fee = fee;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "permissioned-domain-delete",
                summary: {
                    transactionType: "PermissionedDomainDelete",
                    fromAddress: "",
                    description: `Delete permissioned domain ${domainID}`,
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
                        text: `Error deleting permissioned domain: ${
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
