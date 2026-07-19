// THE PLATFORM'S PUBLIC URL, IN ONE PLACE.
//
// This string was copy-pasted into nine files - every email template, the invite link, the cost alert, the
// Inngest serve origin. Moving the platform from influencers.gasmarketing.co.za to studio.gasmarketing.co.za
// therefore meant nine edits and a deploy, and missing one would have sent a client an email linking to a
// domain that no longer served the app.
//
// Now it is one constant, read from the environment. Changing the platform's address is an env var and a
// redeploy, not a code change, and it can never be half-done.
//
// THE FALLBACK IS DELIBERATELY THE OLD DOMAIN. Nothing here should move until studio.gasmarketing.co.za
// actually resolves and has a certificate: an email that links somewhere dead is worse than one linking to
// the old address, which still works. Set APP_URL to the new domain once DNS is verified, and this file needs
// no edit at all.
export const APP_URL = (process.env.APP_URL || "https://influencers.gasmarketing.co.za").replace(/\/+$/, "");

// The bare host, for copy that shows the address rather than links to it.
export const APP_HOST = APP_URL.replace(/^https?:\/\//, "");
