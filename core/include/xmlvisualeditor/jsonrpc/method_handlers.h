#pragma once

namespace xve {

class JsonRpcServer;

// Register all Phase 1 JSON-RPC method handlers.
void RegisterDocumentHandlers(JsonRpcServer& server);
void RegisterValidationHandlers(JsonRpcServer& server);
void RegisterSchemaHandlers(JsonRpcServer& server);
void RegisterHelperHandlers(JsonRpcServer& server);

}  // namespace xve
