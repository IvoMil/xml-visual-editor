#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/services/service_container.h"

int main() {
    xve::ServiceContainer container;
    container.Initialize();

    xve::JsonRpcServer server(container);
    xve::RegisterDocumentHandlers(server);
    xve::RegisterValidationHandlers(server);
    xve::RegisterSchemaHandlers(server);
    xve::RegisterHelperHandlers(server);

    server.Run();

    container.Shutdown();
    return 0;
}
