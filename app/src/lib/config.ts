// The deployment prefix is the Azure resource group name (infra/main.bicep names every
// resource from it, e.g. storage account `${prefix}xsa`). The build workflow supplies it
// from the AZURE_RESOURCE_GROUP variable; locally it comes from .env.
const PREFIX: string | undefined = import.meta.env.VITE_PREFIX;

if (!PREFIX) {
	throw new Error('VITE_PREFIX is not configured (see app/.env.example).');
}

// Public Blob Storage container holding guids.json, strings.json and image assets.
export const PUBLIC_URL = `https://${PREFIX}xsa.blob.core.windows.net/public`;

export const GUIDS_URL = `${PUBLIC_URL}/guids.json`;

export const ONESIGNAL_APP_ID: string = import.meta.env.DEV
	? '19b595b2-a74d-4f12-8ef5-5c250d1e7064' // localhost
	: '24ed781d-4a8b-4327-b388-467bf81dda37';

export const APP_VERSION = 'v.26.10.10 alpha';
