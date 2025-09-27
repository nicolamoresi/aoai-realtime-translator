#!/usr/bin/env sh
set -e

# Azd espone gli output del bicep come variabili d'ambiente nella sessione del hook.
# Necessario: az CLI è già autenticata (grazie a azure/login nel workflow).

# Variabili attese da azd/bicep outputs:
# AOAI_NAME, AOAI_ENDPOINT, AOAI_DEPLOYMENT, WEBAPP_NAME
if [ -z "$AOAI_NAME" ] || [ -z "$AOAI_ENDPOINT" ] || [ -z "$AOAI_DEPLOYMENT" ] || [ -z "$WEBAPP_NAME" ]; then
  echo "Missing expected outputs (AOAI_NAME/AOAI_ENDPOINT/AOAI_DEPLOYMENT/WEBAPP_NAME)."
  exit 1
fi

# Resource group corrente (azd la esporta)
RG="${AZURE_RESOURCE_GROUP:-$(az config get defaults.group -o tsv --query 'value' 2>/dev/null || true)}"
SUB="${AZURE_SUBSCRIPTION_ID:-$(az account show -o tsv --query id)}"

echo "Using SUB=$SUB RG=$RG WEBAPP=$WEBAPP_NAME AOAI=$AOAI_NAME"

# Recupera key dell'account AOAI
AOAI_KEY=$(az cognitiveservices account keys list \
  -n "$AOAI_NAME" -g "$RG" --query key1 -o tsv)

# Imposta app settings sul WebApp (endpoint, key, deployment, api version)
az webapp config appsettings set -g "$RG" -n "$WEBAPP_NAME" --settings \
  AOAI_ENDPOINT="$AOAI_ENDPOINT" \
  AOAI_KEY="$AOAI_KEY" \
  AOAI_DEPLOYMENT="$AOAI_DEPLOYMENT" \
  AOAI_API_VERSION="2025-04-01-preview" \
  WEBSITE_NODE_DEFAULT_VERSION="~18"

echo "Postprovision: app settings configured."
