import { createFileRoute } from "@tanstack/react-router";
import { handleBridge } from "@/lib/folio/bridge.server";

const handle = ({ request }: { request: Request }) => handleBridge(request);

export const Route = createFileRoute("/api/bridge")({
  server: { handlers: { POST: handle } },
});
