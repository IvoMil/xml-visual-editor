#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

namespace xve {

void RegisterGridViewHandlers(JsonRpcServer& server) {
    // Phase B.4: gridView.getTreeData is served by a raw-string handler so the
    // engine can emit multi-megabyte tree JSON without constructing an
    // intermediate nlohmann::json tree. GridViewService writes the JSON body
    // directly into a std::string; the server slots it verbatim into the
    // JSON-RPC envelope's "result" field. Output is byte-identical (same field
    // names, order, numbers, booleans, array ordering) to the previous
    // nlohmann::json-based path.
    server.RegisterRawMethod(
        "gridView.getTreeData",
        [](const nlohmann::json& params, ServiceContainer& container) -> std::string {
            if (!params.contains("documentId") || !params["documentId"].is_string()) {
                throw std::invalid_argument("Missing required parameter: documentId");
            }
            // Phase B.4 diagnostic timing (enabled via XVE_GRID_PROFILE=1).
            const char* prof_env = std::getenv("XVE_GRID_PROFILE");
            const bool prof = prof_env && *prof_env && *prof_env != '0';
            auto t0 = std::chrono::steady_clock::now();

            auto result = container.GetGridViewService()->GetTreeDataJson(
                params["documentId"].get<std::string>());
            auto t_end = std::chrono::steady_clock::now();

            if (!result) {
                throw std::runtime_error("Document not found or empty");
            }

            if (prof) {
                using ms = std::chrono::duration<double, std::milli>;
                std::cerr << "[grid-profile] handler total="
                          << ms(t_end - t0).count() << "ms json-bytes="
                          << result->size() << "\n";
            }
            return std::move(*result);
        });
}

}  // namespace xve

