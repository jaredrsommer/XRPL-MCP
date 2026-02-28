import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-accept",
    {
        title: "Accept Credential",
        description: "Accept a credential that was issued to your account. The credential must be accepted by the subject for it to be considered valid. After acceptance, the reserve burden transfers from the issuer to the subject.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            issuer: z
                .string()
                .describe(
                    "The account address of the credential issuer."
                ),
            credentialType: z
                .string()
                .describe(
                    "Type of credential to accept (must match the issued credential type). Will be hex-encoded."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
    },
    async ({
        walletName,
        issuer,
        credentialType,
        fee,
        useTestnet,
    }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "CredentialAccept",
                Issuer: issuer,
                CredentialType: toHex(credentialType),
            };

            if (fee) tx.Fee = fee;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "credential-accept",
                summary: {
                    transactionType: "CredentialAccept",
                    fromAddress: "",
                    description: `Accept credential "${credentialType}" from issuer ${issuer}`,
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
                        text: `Error accepting credential: ${
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
