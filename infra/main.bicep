@description('Environment name (used in resource names)')
param environmentName string = 'prod'

@description('Azure region')
param location string = resourceGroup().location

@description('Azure OpenAI account name')
param aoaiName string = 'aoai-${uniqueString(resourceGroup().id)}'

@description('Realtime model name')
@allowed([
  'gpt-realtime'                // GA (vedi doc)
  'gpt-4o-realtime-preview'     // preview
  'gpt-4o-mini-realtime-preview'// preview, più economico
])
param modelName string = 'gpt-realtime'

@description('Realtime model version (vedi pagina modelli)')
param modelVersion string = '2025-08-28'

@description('Deployment name per il modello Realtime')
param modelDeploymentName string = 'rt-depl'

var appInsightsName   = 'appi-${uniqueString(resourceGroup().id)}'
var planName          = 'plan-${uniqueString(resourceGroup().id)}'
var webAppName        = 'web-${uniqueString(resourceGroup().id)}'

/* Azure OpenAI account */
resource aoai 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: aoaiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

/* Deployment del modello Realtime */
resource aoaiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  name: '${aoai.name}/${modelDeploymentName}'
  properties: {
    model: {
      name: modelName
      version: modelVersion
      format: 'OpenAI'
    }
    raiPolicyName: 'Microsoft.Default'
    scaleSettings: {
      scaleType: 'Standard'
    }
  }
  dependsOn: [
    aoai
  ]
}

/* Application Insights */
resource appi 'microsoft.insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

/* App Service Plan (Linux) */
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

/* Web App (Node 18) */
resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      appSettings: [
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appi.properties.ConnectionString }
        { name: 'AZURE_OPENAI_DEPLOYMENT', value: modelDeploymentName } // verrà sovrascritto dallo script
        { name: 'PORT', value: '8080' }
      ]
      alwaysOn: true
    }
    httpsOnly: true
  }
  dependsOn: [
    plan
    appi
    aoaiDeployment
  ]
}

output WEBAPP_NAME string = web.name
output AOAI_NAME string = aoai.name
output AOAI_ENDPOINT string = aoai.properties.endpoint
output AOAI_DEPLOYMENT string = modelDeploymentName
