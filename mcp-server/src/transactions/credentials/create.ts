import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-create",
    {
        title: "Create Credential",
        description: "Create a credential on the XRP Ledger. The issuer creates credentials to attest facts about a subject account (e.g., KYC verification, accreditation status). The credential must be accepted by the subject to become valid.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            subject: z
                .string()
                .describe(
                    "The account address of the credential subject (the account the credential is about)."
                ),
            credentialType: z
                .string()
                .describe(
                    "Type of credential being issued (e.g., 'KYC', 'ACCREDITED_INVESTOR', 'AML_VERIFIED'). Will be hex-encoded."
                ),
            expiration: z
                .number()
                .int()
                .optional()
                .describe(
                    "Optional expiration time as Unix timestamp (seconds since Jan 1, 2000 00:00 UTC - Ripple Epoch). After this time, the credential is considered expired."
                ),
            uri: z
                .string()
                .optional()
                .describe(
                    "Optional URI pointing to additional credential data or metadata. Will be hex-encoded."
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
        subject,
        credentialType,
        expiration,
        uri,
        fee,
        useTestnet,
    }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "CredentialCreate",
                Subject: subject,
                CredentialType: toHex(credentialType),
            };

            if (expiration !== undefined) {
                tx.Expiration = expiration;
            }

            if (uri) {
                tx.URI = toHex(uri);
            }

            if (fee) tx.Fee = fee;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "credential-create",
                summary: {
                    transactionType: "CredentialCreate",
                    fromAddress: "",
                    toAddress: subject,
                    description: `Create credential "${credentialType}" for subject ${subject}`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    const createdNodes = meta.AffectedNodes.filter(
                        (node: any) => node.CreatedNode?.LedgerEntryType === "Credential"
                    );
                    if (createdNodes?.length > 0) {
                        return { credentialIndex: createdNodes[0].CreatedNode.LedgerIndex };
                    }
                    return {};
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
                        text: `Error creating credential: ${
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
