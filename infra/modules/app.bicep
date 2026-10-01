// All circloo resources, deployed into the single resource group created by main.bicep.
param location string
param tags object
param token string
param environmentName string
@secure()
param postgresAdminPassword string
@secure()
param authSecret string
param webImageName string
param communicationDataLocation string

var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var webPort = 3000
var postgresAdmin = 'circlooadmin'
var postgresDb = 'circloo'

// ---------- Observability ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-circloo-${token}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-circloo-${token}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------- Identity used by the web app (ACR pull, Key Vault, Storage) ----------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-circloo-${token}'
  location: location
  tags: tags
}

// ---------- Container registry ----------
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'crcircloo${token}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// ---------- PostgreSQL ----------
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-circloo-${token}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdmin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: postgresDb
}

// 0.0.0.0 - 0.0.0.0 = allow Azure services (the Container App). Keeps the all-in-one setup simple.
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// ---------- Realtime boards (Klaxoon-style collaboration) ----------
resource webPubSub 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: 'wps-circloo-${token}'
  location: location
  tags: tags
  sku: { name: 'Free_F1', capacity: 1 }
  properties: {}
}

// ---------- Email (magic-link sign-in + invitations) ----------
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: 'ecs-circloo-${token}'
  location: 'global'
  tags: tags
  properties: { dataLocation: communicationDataLocation }
}

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource communication 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: 'acs-circloo-${token}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: communicationDataLocation
    linkedDomains: [ emailDomain.id ]
  }
}

// ---------- Storage (avatars, board attachments) ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stcircloo${take(token, 13)}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'uploads'
}

var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, blobContributorRoleId)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
  }
}

// ---------- Secrets ----------
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-circloo-${take(token, 10)}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, kvSecretsUserRoleId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
  }
}

var databaseUrl = 'postgresql://${postgresAdmin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDb}?sslmode=require'

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}

resource secretAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'auth-secret'
  properties: { value: authSecret }
}

resource secretPubSub 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'webpubsub-connection-string'
  properties: { value: webPubSub.listKeys().primaryConnectionString }
}

resource secretAcs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'acs-connection-string'
  properties: { value: communication.listKeys().primaryConnectionString }
}

// ---------- Web app (Next.js) on Container Apps ----------
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-circloo-${token}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var emailSender = 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}'

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-circloo-web-${environmentName}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [ acrPull, kvSecretsUser ]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: webPort
        transport: 'auto' // HTTP + WebSocket
      }
      registries: [
        { server: registry.properties.loginServer, identity: identity.id }
      ]
      secrets: [
        { name: 'database-url', keyVaultUrl: secretDatabaseUrl.properties.secretUri, identity: identity.id }
        { name: 'auth-secret', keyVaultUrl: secretAuth.properties.secretUri, identity: identity.id }
        { name: 'webpubsub-connection-string', keyVaultUrl: secretPubSub.properties.secretUri, identity: identity.id }
        { name: 'acs-connection-string', keyVaultUrl: secretAcs.properties.secretUri, identity: identity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: empty(webImageName) ? placeholderImage : webImageName
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'PORT', value: string(webPort) }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'AUTH_TRUST_HOST', value: 'true' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
            { name: 'WEB_PUBSUB_CONNECTION_STRING', secretRef: 'webpubsub-connection-string' }
            { name: 'ACS_CONNECTION_STRING', secretRef: 'acs-connection-string' }
            { name: 'EMAIL_FROM', value: emailSender }
            { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
            { name: 'AZURE_STORAGE_CONTAINER', value: uploads.name }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 3 }
    }
  }
}

output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output keyVaultName string = vault.name
output webUri string = 'https://${web.properties.configuration.ingress.fqdn}'
output emailSender string = emailSender
