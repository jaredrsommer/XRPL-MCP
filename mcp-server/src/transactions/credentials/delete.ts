import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-delete",
    {
        title: "Delete Credential",
        description: "Delete a credential from the XRP Ledger. Either the issuer or the subject can delete a credential at any time. Anyone can delete an expired credential.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            issuer: z
                .string()
                .optional()
                .describe(
                    "The account address of the credential issuer. Required if caller is not the issuer."
                ),
            subject: z
                .string()
                .optional()
                .describe(
                    "The account address of the credential subject. Required if caller is not the subject."
                ),
            credentialType: z
                .string()
                .describe(
                    "Type of credential to delete. Will be hex-encoded."
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
        issuer,
        subject,
        credentialType,
        fee,
        useTestnet,
    }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "CredentialDelete",
                CredentialType: toHex(credentialType),
            };

            // Determine issuer and subject based on who is calling
            if (issuer) {
                tx.Issuer = issuer;
            }
            if (subject) {
                tx.Subject = subject;
            }

            if (fee) tx.Fee = fee;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "credential-delete",
                summary: {
                    transactionType: "CredentialDelete",
                    fromAddress: "",
                    description: `Delete credential "${credentialType}"${issuer ? ` (issuer: ${issuer})` : ""}${subject ? ` (subject: ${subject})` : ""}`,
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
                        text: `Error deleting credential: ${
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
