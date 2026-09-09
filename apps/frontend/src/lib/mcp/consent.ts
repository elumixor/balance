import { api, apiGet, callApi } from "$lib/core/api";

/** Everything the assistant put in the authorization request, as the consent page reads it. */
export interface ConsentRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

/** Who is asking, and where they would be sent back to — refused outright if either is wrong. */
export const describeClient = (clientId: string, redirectUri: string) =>
  apiGet<{ name: string; redirectUri: string }>("/oauth/consent", { clientId, redirectUri });

/** The answer, either way. What comes back is the URL the browser is handed to. */
export const answerConsent = (decision: "allow" | "deny", request: ConsentRequest) =>
  callApi(api.oauth.approve.$post({ decision, ...request })).then((r) => r.redirectTo);

/** The authorization request as it arrived, or nothing when it is not one we could answer. */
export function readConsentRequest(params: URLSearchParams): ConsentRequest | null {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  if (!clientId || !redirectUri || !codeChallenge) return null;
  return {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: params.get("code_challenge_method") ?? undefined,
    state: params.get("state") ?? undefined,
    scope: params.get("scope") ?? undefined,
    resource: params.get("resource") ?? undefined,
  };
}
