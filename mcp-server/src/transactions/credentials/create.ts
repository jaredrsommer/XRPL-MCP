import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-create",
    {
        title: "Create Credential",
        description: "Create a credential on the XRP Ledger. The issuer creates credentials to attest facts about a subject account (e.g., KYC verification, accreditation status). The credential must be accepted by the subject to become valid.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the issuer's wallet. If not provided, the connected wallet will be used."
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
        fromSeed,
        subject,
        credentialType,
        expiration,
        uri,
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

            const tx: any = {
                TransactionType: "CredentialCreate",
                Account: wallet.address,
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

            const prepared = await client.autofill(tx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let credentialIndex: string | undefined;

            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract credential index from created nodes
                const createdNodes = (result.result.meta as any).AffectedNodes?.filter(
                    (node: any) => node.CreatedNode?.LedgerEntryType === "Credential"
                );
                if (createdNodes?.length > 0) {
                    credentialIndex = createdNodes[0].CreatedNode.LedgerIndex;
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
                                credentialIndex,
                                issuer: wallet.address,
                                subject,
                                credentialType,
                                credentialTypeHex: toHex(credentialType),
                                expiration: expiration ?? null,
                                uri: uri ?? null,
                                note: "Credential is provisionally issued. Subject must accept it with CredentialAccept for it to be valid.",
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
                        text: `Error creating credential: ${
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
