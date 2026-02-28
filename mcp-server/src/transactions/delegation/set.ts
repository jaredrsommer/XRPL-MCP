import { Client } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Permission values for delegation
// Note: Full list at https://xrpl.org/docs/references/protocol/data-types/permission-values
const PermissionValues: { [key: string]: number } = {
    // Payment operations
    Payment: 0x0001,
    PaymentMint: 0x0002,
    PaymentBurn: 0x0003,

    // Trust line operations
    TrustSet: 0x0010,
    TrustSetAuthorize: 0x0011,
    TrustSetNoRipple: 0x0012,

    // Offer operations
    OfferCreate: 0x0020,
    OfferCancel: 0x0021,

    // Check operations
    CheckCreate: 0x0030,
    CheckCash: 0x0031,
    CheckCancel: 0x0032,

    // Escrow operations
    EscrowCreate: 0x0040,
    EscrowFinish: 0x0041,
    EscrowCancel: 0x0042,

    // Payment Channel operations
    PaymentChannelCreate: 0x0050,
    PaymentChannelFund: 0x0051,
    PaymentChannelClaim: 0x0052,

    // NFT operations
    NFTokenMint: 0x0060,
    NFTokenBurn: 0x0061,
    NFTokenCreateOffer: 0x0062,
    NFTokenCancelOffer: 0x0063,
    NFTokenAcceptOffer: 0x0064,
    NFTokenModify: 0x0065,

    // AMM operations
    AMMCreate: 0x0070,
    AMMDeposit: 0x0071,
    AMMWithdraw: 0x0072,
    AMMVote: 0x0073,
    AMMBid: 0x0074,
    AMMDelete: 0x0075,

    // DID operations
    DIDSet: 0x0080,
    DIDDelete: 0x0081,

    // MPT operations
    MPTokenIssuanceCreate: 0x0090,
    MPTokenIssuanceSet: 0x0091,
    MPTokenIssuanceDestroy: 0x0092,
    MPTokenAuthorize: 0x0093,

    // Oracle operations
    OracleSet: 0x00A0,
    OracleDelete: 0x00A1,

    // Credential operations
    CredentialCreate: 0x00B0,
    CredentialAccept: 0x00B1,
    CredentialDelete: 0x00B2,

    // Ticket operations
    TicketCreate: 0x00C0,

    // Deposit Preauth operations
    DepositPreauth: 0x00D0,

    // Clawback operations
    Clawback: 0x00E0,
    AMMClawback: 0x00E1,
};

server.registerTool(
    "delegate-set",
    {
        title: "Set Delegate",
        description: "Delegate transaction permissions to another account on the XRP Ledger. Allows an account to authorize another account to submit specific transaction types on their behalf. Note: AccountSet, SetRegularKey, SignerListSet, DelegateSet, and AccountDelete cannot be delegated for security reasons.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            delegate: z
                .string()
                .describe(
                    "The account address to delegate permissions to."
                ),
            permissions: z
                .array(z.string())
                .optional()
                .describe(
                    "List of permission names to grant (e.g., ['Payment', 'OfferCreate', 'NFTokenMint']). Use an empty array to revoke all permissions."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Note: Permission Delegation may only be available on devnet."
                ),
        },
    },
    async ({
        walletName,
        delegate,
        permissions = [],
        fee,
        useTestnet,
    }) => {
        try {
            // Convert permission names to values
            const permissionValues: number[] = [];
            const unknownPermissions: string[] = [];

            for (const perm of permissions) {
                if (PermissionValues[perm] !== undefined) {
                    permissionValues.push(PermissionValues[perm]);
                } else {
                    unknownPermissions.push(perm);
                }
            }

            if (unknownPermissions.length > 0) {
                throw new Error(
                    `Unknown permission names: ${unknownPermissions.join(", ")}. Available permissions: ${Object.keys(PermissionValues).join(", ")}`
                );
            }

            // Build permissions array in the format expected by XRPL
            const formattedPermissions = permissionValues.map((value) => ({
                Permission: {
                    PermissionValue: value,
                },
            }));

            const tx: Record<string, unknown> = {
                TransactionType: "DelegateSet",
                Delegate: delegate,
                Permissions: formattedPermissions,
            };

            if (fee) tx.Fee = fee;

            const action = permissions.length === 0 ? "revoke all permissions from" : "grant permissions to";

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "delegate-set",
                summary: {
                    transactionType: "DelegateSet",
                    fromAddress: "",
                    toAddress: delegate,
                    description: `${action} delegate ${delegate}${permissions.length > 0 ? ` (${permissions.join(", ")})` : ""}`,
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
                        text: `Error setting delegation: ${
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

server.registerTool(
    "delegate-list",
    {
        title: "List Delegates",
        description: "List all delegate permissions for an account.",
        inputSchema: {
            account: z
                .string()
                .optional()
                .describe(
                    "The account address to list delegates for. If not provided, uses the connected wallet."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { readOnlyHint: true },
    },
    async ({ account, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let queryAccount: string;
            if (account) {
                queryAccount = account;
            } else if (connectedWallet) {
                queryAccount = connectedWallet.address;
            } else {
                throw new Error(
                    "No account specified and no wallet connected."
                );
            }

            const result = await client.request({
                command: "account_objects",
                account: queryAccount,
                type: "delegate",
                ledger_index: "validated",
            } as any);

            const delegates = (result.result as any).account_objects || [];

            // Create reverse lookup for permission values to names
            const permissionNames: { [value: number]: string } = {};
            for (const [name, value] of Object.entries(PermissionValues)) {
                permissionNames[value] = name;
            }

            const formattedDelegates = delegates.map((del: any) => {
                const permissions = (del.Permissions || []).map((item: any) => {
                    const value = item.Permission?.PermissionValue;
                    return {
                        name: permissionNames[value] || "Unknown",
                        value,
                    };
                });

                return {
                    delegate: del.Delegate,
                    permissions,
                    index: del.index,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                account: queryAccount,
                                count: formattedDelegates.length,
                                delegates: formattedDelegates,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
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
                        text: `Error listing delegates: ${
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

server.registerTool(
    "delegate-list-permissions",
    {
        title: "List Delegate Permissions",
        description: "List all available permission names that can be delegated.",
        inputSchema: {
        },
        annotations: { readOnlyHint: true },
    },
    async () => {
        const permissionList = Object.entries(PermissionValues).map(([name, value]) => ({
            name,
            value,
            hexValue: `0x${value.toString(16).padStart(4, '0')}`,
        }));

        // Group permissions by category
        const categories: { [key: string]: any[] } = {
            "Payment": [],
            "TrustLine": [],
            "Offer": [],
            "Check": [],
            "Escrow": [],
            "PaymentChannel": [],
            "NFT": [],
            "AMM": [],
            "DID": [],
            "MPT": [],
            "Oracle": [],
            "Credential": [],
            "Other": [],
        };

        for (const perm of permissionList) {
            if (perm.name.startsWith("Payment")) categories["Payment"].push(perm);
            else if (perm.name.startsWith("Trust")) categories["TrustLine"].push(perm);
            else if (perm.name.startsWith("Offer")) categories["Offer"].push(perm);
            else if (perm.name.startsWith("Check")) categories["Check"].push(perm);
            else if (perm.name.startsWith("Escrow")) categories["Escrow"].push(perm);
            else if (perm.name.startsWith("PaymentChannel")) categories["PaymentChannel"].push(perm);
            else if (perm.name.startsWith("NFToken")) categories["NFT"].push(perm);
            else if (perm.name.startsWith("AMM")) categories["AMM"].push(perm);
            else if (perm.name.startsWith("DID")) categories["DID"].push(perm);
            else if (perm.name.startsWith("MPToken")) categories["MPT"].push(perm);
            else if (perm.name.startsWith("Oracle")) categories["Oracle"].push(perm);
            else if (perm.name.startsWith("Credential")) categories["Credential"].push(perm);
            else categories["Other"].push(perm);
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            totalPermissions: permissionList.length,
                            categories,
                            note: "AccountSet, SetRegularKey, SignerListSet, DelegateSet, and AccountDelete cannot be delegated for security reasons.",
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }
);
