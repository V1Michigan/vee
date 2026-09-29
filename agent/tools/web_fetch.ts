import { disableTool } from "eve/tools";

// The framework fetcher makes arbitrary server-side requests and follows
// redirects. Keep egress on fixed provider endpoints until a public-web adapter
// can enforce destination and private-session boundaries through redirects.
export default disableTool();
