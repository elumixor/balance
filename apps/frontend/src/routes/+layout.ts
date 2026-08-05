// One client-rendered bundle: the app is a Capacitor webview on iOS and a static SPA on the web,
// and everything it shows depends on a Clerk session that only exists in the browser.
export const ssr = false;
export const prerender = false;
