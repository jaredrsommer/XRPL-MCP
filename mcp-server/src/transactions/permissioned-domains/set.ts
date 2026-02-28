import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "permissioned-domain-set",
    {
        title: "Set Permissioned Domain",
        description: "Create or modify a Permissioned Domain on the XRP Ledger. Permissioned Domains define access rules based on credentials, allowing only authorized accounts (those with accepted credentials from specified issuers) to participate in certain activities.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            domainID: z
                .string()
                .optional()
                .describe(
                    "Optional: The ID of an existing Permissioned Domain to modify (64-character hex string). If not provided, a new domain will be created."
                ),
            acceptedCredentials: z
                .array(
                    z.object({
                        issuer: z
                            .string()
                            .describe("The account address of the credential issuer."),
                        credentialType: z
                            .string()
                            .describe("The type of credential required. Will be hex-encoded."),
                    })
                )
                .min(1)
                .max(10)
                .describe(
                    "List of accepted credentials (1-10). Accounts holding any one of these credentials from the specified issuers are members of the domain."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { idempotentHint: true },
    },
    async ({
        walletName,
        domainID,
        acceptedCredentials,
        fee,
        useTestnet,
    }) => {
        try {
            // Format accepted credentials
            const formattedCredentials = acceptedCredentials.map((cred) => ({
                Credential: {
                    Issuer: cred.issuer,
                    CredentialType: toHex(cred.credentialType),
                },
            }));

            const tx: Record<string, unknown> = {
                TransactionType: "PermissionedDomainSet",
                AcceptedCredentials: formattedCredentials,
            };

            if (domainID) {
                tx.DomainID = domainID;
            }

            if (fee) tx.Fee = fee;

            const action = domainID ? "modify" : "create";

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "permissioned-domain-set",
                summary: {
                    transactionType: "PermissionedDomainSet",
                    fromAddress: "",
                    description: `${action} permissioned domain${domainID ? ` ${domainID}` : ""} with ${acceptedCredentials.length} credential(s)`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    const createdNodes = meta.AffectedNodes.filter(
                        (node: any) => node.CreatedNode?.LedgerEntryType === "PermissionedDomain"
                    );
                    if (createdNodes?.length > 0) {
                        return { newDomainID: createdNodes[0].CreatedNode.LedgerIndex };
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
                        text: `Error setting permissioned domain: ${
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
