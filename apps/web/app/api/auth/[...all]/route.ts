import { auth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const handle = (request: Request) => auth().handler(request);

export { handle as GET, handle as POST };
