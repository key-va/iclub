// Resources follow the deployment naming convention `<prefix><suffix>` (see infra/main.bicep),
// e.g. prefix "iclub" gives the storage account "iclubxsa" and the key vault "iclubxkv".
export const resourceSuffix = {
    storageAccount: "xsa",
    keyVault: "xkv"
} as const;

export function resourceName(suffix: string): string {
    const prefix = process.env.RESOURCE_GROUP_PREFIX;

    if (!prefix) {
        throw new Error("RESOURCE_GROUP_PREFIX is not configured.");
    }

    return `${prefix}${suffix}`;
}
