import docusign from 'docusign-esign';

const SCOPES = ['signature', 'impersonation'];

function getPrivateKey() {
  const raw = process.env.DOCUSIGN_PRIVATE_KEY;
  if (!raw) {
    throw new Error('DOCUSIGN_PRIVATE_KEY is not set');
  }
  // .env files store the key with literal \n sequences — expand them back to newlines.
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

// Authenticates via JWT Grant and returns a ready-to-use ApiClient plus the account id.
export async function getAuthenticatedApiClient() {
  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(process.env.DOCUSIGN_AUTH_SERVER);

  const results = await apiClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    SCOPES,
    getPrivateKey(),
    3600
  );

  const accessToken = results.body.access_token;
  apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH);
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

  return {
    apiClient,
    accessToken,
    accountId: process.env.DOCUSIGN_ACCOUNT_ID,
  };
}

export async function getEnvelopesApi() {
  const { apiClient, accountId } = await getAuthenticatedApiClient();
  return { envelopesApi: new docusign.EnvelopesApi(apiClient), accountId };
}
