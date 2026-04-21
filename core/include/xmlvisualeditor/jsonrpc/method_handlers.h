#pragma once

namespace xve {

class JsonRpcServer;

// Register all JSON-RPC method handlers on the given server.
void RegisterDocumentHandlers(JsonRpcServer& server);
void RegisterValidationHandlers(JsonRpcServer& server);
void RegisterSchemaHandlers(JsonRpcServer& server);
void RegisterHelperHandlers(JsonRpcServer& server);
void RegisterGridViewHandlers(JsonRpcServer& server);

}  // namespace xve
