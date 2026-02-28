import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "permissioned-domain-set",
    {
        title: "Set Permissioned Domain",
        description: "Create or modify a Permissioned Domain on the XRP Ledger. Permissioned Domains define access rules based on credentials, allowing only authorized accounts (those with accepted credentials from specified issuers) to participate in certain activities.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the domain owner's wallet. If not provided, the connected wallet will be used."
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
        fromSeed,
        domainID,
        acceptedCredentials,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Format accepted credentials
            const formattedCredentials = acceptedCredentials.map((cred) => ({
                Credential: {
                    Issuer: cred.issuer,
                    CredentialType: toHex(cred.credentialType),
                },
            }));

            const tx: any = {
                TransactionType: "PermissionedDomainSet",
                Account: wallet.address,
                AcceptedCredentials: formattedCredentials,
            };

            if (domainID) {
                tx.DomainID = domainID;
            }

            if (fee) tx.Fee = fee;

            const prepared = await client.autofill(tx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let newDomainID: string | undefined;

            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract new domain ID if created
                if (!domainID) {
                    const createdNodes = (result.result.meta as any).AffectedNodes?.filter(
                        (node: any) => node.CreatedNode?.LedgerEntryType === "PermissionedDomain"
                    );
                    if (createdNodes?.length > 0) {
                        newDomainID = createdNodes[0].CreatedNode.LedgerIndex;
                    }
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                domainID: newDomainID ?? domainID,
                                action: domainID ? "modified" : "created",
                                owner: wallet.address,
                                acceptedCredentials: acceptedCredentials.map((c) => ({
                                    issuer: c.issuer,
                                    credentialType: c.credentialType,
                                    credentialTypeHex: toHex(c.credentialType),
                                })),
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
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
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
