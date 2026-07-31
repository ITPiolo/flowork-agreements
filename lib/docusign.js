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

// Returns a one-time URL that opens DocuSign's signing UI directly in the browser, for a
// recipient set up as embedded (clientUserId supplied on the signer when the envelope was
// created). `returnUrl` is where DocuSign sends the browser back to once signing completes.
export async function getEmbeddedSigningUrl({ envelopesApi, accountId, envelopeId, signerEmail, signerName, clientUserId, returnUrl }) {
  const viewRequest = new docusign.RecipientViewRequest();
  viewRequest.returnUrl = returnUrl;
  viewRequest.authenticationMethod = 'none';
  viewRequest.email = signerEmail;
  viewRequest.userName = signerName;
  viewRequest.clientUserId = clientUserId;

  const results = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewRequest });
  return results.url;
}
