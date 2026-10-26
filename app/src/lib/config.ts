// The deployment prefix is the Azure resource group name (infra/main.bicep names every
// resource from it, e.g. storage account `${prefix}xsa`). The build workflow supplies it
// from the AZURE_RESOURCE_GROUP variable; locally it comes from .env.
const PREFIX: string | undefined = import.meta.env.VITE_PREFIX;

if (!PREFIX) {
	throw new Error('VITE_PREFIX is not configured (see app/.env.example).');
}

// Public Blob Storage container
export const PUBLIC_URL = `https://${PREFIX}xsa.blob.core.windows.net/public`;
export const GUIDS_URL = `${PUBLIC_URL}/guids.json`;

// Function App hosting the API
export const API_URL: string = import.meta.env.VITE_API_URL ?? `https://${PREFIX}xfa.azurewebsites.net/api`;

// App version
export const APP_VERSION = 'v.26.10.10 alpha';
