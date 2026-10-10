// All circloo resources, deployed into the single resource group created by main.bicep.
param location string
param tags object
param token string
@secure()
param postgresAdminPassword string
@secure()
param authSecret string
param webImageName string
param communicationDataLocation string

// Group calls (spec 009 T917): the call server VM exists only when callsEnabled is true. main.bicep picks the other
// values per environment (research R23).
param callsEnabled bool
param callsVmSize string
param callsDiskSku string
param callsTurnTls bool
param callsShutdownTime string
@secure()
param liveKitApiSecret string
@secure()
param callsVmPassword string

var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var webName = 'ca-circloo-${token}' // ≤ 32 chars; azd finds it by the azd-service-name tag
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

// Slide pictures of presentations (spec 006). Private: the API streams them after an access check.
resource presentations 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'presentations'
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

// Npgsql connection string, read by the API as ConnectionStrings__circloodb.
var databaseUrl = 'Host=${postgres.properties.fullyQualifiedDomainName};Port=5432;Database=${postgresDb};Username=${postgresAdmin};Password=${postgresAdminPassword};SSL Mode=VerifyFull'

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

// ---------- Microsoft Foundry: AI for icebreakers (pay per token, no fixed cost; keys disabled) ----------
var aiModel = 'gpt-4o-mini'
resource foundry 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'aif-circloo-${token}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'aif-circloo-${token}'
    disableLocalAuth: true // Entra ID only: the app's managed identity
    publicNetworkAccess: 'Enabled'
  }
}

resource chatModel 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: aiModel
  sku: { name: 'GlobalStandard', capacity: 10 }
  properties: {
    model: { format: 'OpenAI', name: aiModel, version: '2024-07-18' }
  }
}

var openAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd' // Cognitive Services OpenAI User
resource foundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, identity.id, openAiUserRoleId)
  scope: foundry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUserRoleId)
  }
}

// ---------- circloo app (ASP.NET Core API serving the React SPA) on Container Apps ----------
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

// ---------- Deck converter (spec 006, research R1) ----------
// LibreOffice parses untrusted .pptx files, so it runs on its own: internal ingress only (unreachable from the
// internet), no managed identity, no secrets, scale to zero. Webhooks, download-from and Chromium routes are off, so
// it never fetches a URL on request. Plan Complexity Tracking: the one justified second production container.
resource converter 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-conv-${token}'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 3000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'converter'
          image: 'docker.io/gotenberg/gotenberg:8.37.0' // pinned: bump deliberately
          args: [ 'gotenberg', '--api-timeout=120s', '--chromium-disable-routes=true', '--webhook-disable=true', '--api-disable-download-from=true', '--prometheus-disable-collect=true' ]
          resources: { cpu: json('1.0'), memory: '2Gi' }
          probes: [
            { type: 'Readiness', httpGet: { path: '/health', port: 3000 }, periodSeconds: 15 }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

// ---------- Group call server (spec 009 T917, research R23): only when callsEnabled ----------
// The webhook address is built from the environment's domain rather than read from the web app, which itself reads
// this module's outputs.
var liveKitApiKey = 'circloo'
module calls 'livekit.bicep' = if (callsEnabled) {
  name: 'circloo-calls'
  params: {
    location: location
    tags: tags
    token: token
    vmSize: callsVmSize
    diskSku: callsDiskSku
    turnTls: callsTurnTls
    shutdownTime: callsShutdownTime
    apiSecret: liveKitApiSecret
    apiKey: liveKitApiKey
    adminPassword: callsVmPassword
    vaultName: vault.name
    webhookUrl: 'https://${webName}.${containerEnv.properties.defaultDomain}/api/livekit/webhook'
  }
}

// Without these settings the app shows "Group calls are not available here" (FR-935).
var callSecrets = callsEnabled ? [
  { name: 'livekit-api-secret', keyVaultUrl: calls!.outputs.secretUri, identity: identity.id }
] : []
var callSettings = callsEnabled ? [
  { name: 'LiveKit__Url', value: calls!.outputs.url }
  { name: 'LiveKit__ApiUrl', value: calls!.outputs.apiUrl }
  { name: 'LiveKit__ApiKey', value: liveKitApiKey }
  { name: 'LiveKit__ApiSecret', secretRef: 'livekit-api-secret' }
  { name: 'Discussion__AwayEndSeconds', value: '300' }
] : []

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [ acrPull, kvSecretsUser, foundryUser, blobContributor ]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: empty(webImageName) ? 80 : webPort // placeholder image listens on 80
        transport: 'auto' // HTTP + WebSocket
      }
      registries: [
        { server: registry.properties.loginServer, identity: identity.id }
      ]
      secrets: concat([
        { name: 'database-url', keyVaultUrl: secretDatabaseUrl.properties.secretUri, identity: identity.id }
        { name: 'auth-secret', keyVaultUrl: secretAuth.properties.secretUri, identity: identity.id }
        { name: 'webpubsub-connection-string', keyVaultUrl: secretPubSub.properties.secretUri, identity: identity.id }
        { name: 'acs-connection-string', keyVaultUrl: secretAcs.properties.secretUri, identity: identity.id }
      ], callSecrets)
    }
    template: {
      containers: [
        {
          name: 'web'
          image: empty(webImageName) ? placeholderImage : webImageName
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat([
            { name: 'ASPNETCORE_HTTP_PORTS', value: string(webPort) }
            { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
            { name: 'Security__TrustForwardedHeaders', value: 'true' }
            { name: 'ConnectionStrings__circloodb', secretRef: 'database-url' }
            { name: 'Security__Pepper', secretRef: 'auth-secret' }
            { name: 'Email__Provider', value: 'Acs' }
            { name: 'Email__AcsConnectionString', secretRef: 'acs-connection-string' }
            { name: 'Email__From', value: emailSender }
            { name: 'Ai__Provider', value: 'OpenAICompatible' }
            { name: 'Ai__Endpoint', value: 'https://${foundry.properties.customSubDomainName}.openai.azure.com/openai/v1/' }
            { name: 'Ai__Model', value: chatModel.name }
            { name: 'Ai__Auth', value: 'ManagedIdentity' }
            { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
            { name: 'AZURE_STORAGE_CONTAINER', value: uploads.name }
            // Spec 006: slide pictures through managed identity, decks converted by the internal converter app.
            { name: 'ConnectionStrings__blobs', value: storage.properties.primaryEndpoints.blob }
            { name: 'Presentations__Container', value: presentations.name }
            { name: 'Presentations__ConverterUrl', value: 'https://${converter.properties.configuration.ingress.fqdn}' }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
          ], callSettings)
          // Probes only for the real app; the placeholder image has no /health.
          probes: empty(webImageName) ? [] : [
            { type: 'Liveness', httpGet: { path: '/alive', port: webPort }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: webPort }, periodSeconds: 15 }
            { type: 'Startup', httpGet: { path: '/alive', port: webPort }, periodSeconds: 5, failureThreshold: 24 }
          ]
        }
      ]
      // One replica: SignalR groups, presence and the quiz clock live in memory until the Web PubSub backplane
      // (spec 006 plan, Scale/Scope). Data-side rules (answers, conversion leases) already hold across replicas.
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output keyVaultName string = vault.name
output webUri string = 'https://${web.properties.configuration.ingress.fqdn}'
output emailSender string = emailSender
output aiEndpoint string = 'https://${foundry.properties.customSubDomainName}.openai.azure.com/openai/v1/'
// The call server's address for browsers (wss://lk-<token>...), empty when calls are not enabled.
output liveKitUrl string = callsEnabled ? calls!.outputs.url : ''
output callsVmName string = callsEnabled ? calls!.outputs.vmName : ''
