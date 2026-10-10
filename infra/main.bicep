// =============================================================================
// Intra Club Infrastructure
// =============================================================================

@description('Azure region inherited from the target resource group')
param location string = resourceGroup().location

var prefix = resourceGroup().name

// -----------------------------------------------------------------------------
// Resource names
// -----------------------------------------------------------------------------

var storageAccountName = '${prefix}xsa'
var functionAppName = '${prefix}xfa'
var applicationInsightsName = '${prefix}xai'
var keyVaultName = '${prefix}xkv'
var staticWebAppName = '${prefix}xswa'
var userAssignedManagedIdentityName = '${prefix}xumai'

var sharedResourceGroupName = 'genc'

resource appServicePlan 'Microsoft.Web/serverfarms@2024-11-01' existing = {
  name: 'gencxasp'
  scope: resourceGroup(sharedResourceGroupName)
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: 'gencxlaws'
  scope: resourceGroup(sharedResourceGroupName)
}


// =============================================================================
// STORAGE ACCOUNT
// =============================================================================

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: storageAccountName
  location: location

  sku: {
    name: 'Standard_LRS'
  }

  kind: 'StorageV2'

  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
    supportsHttpsTrafficOnly: true
  }
}

// -----------------------------------------------------------------------------
// Table Storage
// -----------------------------------------------------------------------------

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2025-06-01' = {
  parent: storage
  name: 'default'
}

resource authsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'auths'
}

resource guidsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'guids'
}

resource logsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-06-01' = {
  parent: tableService
  name: 'logs'
}

// -----------------------------------------------------------------------------
// Blob Storage
// -----------------------------------------------------------------------------

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-06-01' = {
  parent: storage
  name: 'default'

  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            'https://app.intra.club',
            'http://localhost:5173'
          ]
          allowedMethods: [
            'GET'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            '*'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource publicContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobService
  name: 'public'

  properties: {
    publicAccess: 'Blob'
  }
}


// =============================================================================
// APPLICATION INSIGHTS
//
// Dedicated Application Insights instance for iClub with its telemetry stored in the shared genc Log Analytics workspace.
// =============================================================================

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'

  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}


// =============================================================================
// MANAGED IDENTITY
// =============================================================================

resource userAssignedManagedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: userAssignedManagedIdentityName
  location: location
}


// =============================================================================
// FUNCTION APP
//
// Runs on the existing gencxasp App Service Plan.
// Uses the Intra Club user-assigned managed identity.
// =============================================================================

resource functionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'

  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedManagedIdentity.id}': {}
    }
  }

  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true

    siteConfig: {
      alwaysOn: true
      linuxFxVersion: 'NODE|22'

      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
        }
        {
          name: 'ICLUB_STORAGE_ACCOUNT'
          value: storage.name
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: userAssignedManagedIdentity.properties.clientId
        }
      ]
    }
  }
}


// =============================================================================
// KEY VAULT
// =============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location

  properties: {
    tenantId: subscription().tenantId

    sku: {
      family: 'A'
      name: 'standard'
    }

    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}


// =============================================================================
// RBAC - Grants the Intra Club user-assigned managed identity access to:
// - Azure Table Storage
// - Azure Blob Storage
// - Key Vault secrets
// =============================================================================

// Azure built-in role: Storage Table Data Contributor
resource storageTableDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, userAssignedManagedIdentity.id, 'StorageTableDataContributor')
  scope: storage

  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
    )
    principalId: userAssignedManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Azure built-in role: Storage Blob Data Contributor
resource storageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, userAssignedManagedIdentity.id, 'StorageBlobDataContributor')
  scope: storage

  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    )
    principalId: userAssignedManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Azure built-in role: Key Vault Secrets User
resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, userAssignedManagedIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault

  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
    principalId: userAssignedManagedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}


// =============================================================================
// STATIC WEB APP
// =============================================================================

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: 'eastasia'

  sku: {
    name: 'Free'
    tier: 'Free'
  }

  properties: {}
}


// =============================================================================
// OUTPUTS
// =============================================================================

output storageAccountName string = storage.name

output userAssignedManagedIdentityName string = userAssignedManagedIdentity.name
output userAssignedManagedIdentityClientId string = userAssignedManagedIdentity.properties.clientId

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName

output applicationInsightsName string = applicationInsights.name

output keyVaultName string = keyVault.name

output staticWebAppName string = staticWebApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
