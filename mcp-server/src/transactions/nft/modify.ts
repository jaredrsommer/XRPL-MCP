import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "nft-modify",
    {
        title: "Modify NFT",
        description:
            "Modify the URI of a dynamic NFT (dNFT) on the XRP Ledger. The NFT must have been minted with the tfMutable flag enabled. Only the issuer or their authorized minter can modify the URI.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            nftokenID: z
                .string()
                .describe(
                    "The NFTokenID of the NFT to modify (64-character hex string). The NFT must have tfMutable flag set."
                ),
            uri: z
                .string()
                .optional()
                .describe(
                    "The new URI for the NFT. Can be an HTTPS URL, IPFS URI, or any other URI format (max 256 bytes). Will be hex-encoded. If empty, the URI will be cleared."
                ),
            owner: z
                .string()
                .optional()
                .describe(
                    "Optional: The account that owns the NFT. Required if the issuer is different from the current owner."
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
    async ({ walletName, nftokenID, uri, owner, fee, useTestnet }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "NFTokenModify",
                NFTokenID: nftokenID,
            };

            if (uri !== undefined) {
                if (uri === "") {
                    // Empty string clears the URI
                    tx.URI = "";
                } else {
                    tx.URI = toHex(uri);
                }
            }

            if (owner) {
                tx.Owner = owner;
            }

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "nft-modify",
                summary: {
                    transactionType: "NFTokenModify",
                    fromAddress: "",
                    description: `Modify NFT ${nftokenID} URI to ${uri !== undefined ? (uri === "" ? "(clear)" : uri) : "(unchanged)"}`,
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
                                networkType:
                                    result.pendingTransaction.networkType,
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
                        text: `Error modifying NFT: ${
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
