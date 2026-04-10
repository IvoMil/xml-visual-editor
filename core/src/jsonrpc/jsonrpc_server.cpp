#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"

#include "xmlvisualeditor/jsonrpc/jsonrpc_types.h"

#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>

namespace xve {

JsonRpcServer::JsonRpcServer(ServiceContainer& container) : container_(container) {}

void JsonRpcServer::RegisterMethod(std::string method_name, MethodHandler handler) {
    methods_.emplace(std::move(method_name), std::move(handler));
}

auto JsonRpcServer::HandleRequest(const JsonRpcRequest& request) -> JsonRpcResponse {
    auto it = methods_.find(request.method);
    if (it == methods_.end()) {
        return JsonRpcResponse::Error(
            request.id, JsonRpcErrorCode::kMethodNotFound, "Method not found: " + request.method);
    }

    try {
        nlohmann::json result = it->second(request.params, container_);
        return JsonRpcResponse::Success(request.id, std::move(result));
    } catch (const std::invalid_argument& e) {
        return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInvalidParams, e.what());
    } catch (const std::runtime_error& e) {
        return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInternalError, e.what());
    } catch (...) {
        return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInternalError, "Internal error");
    }
}

void JsonRpcServer::Run() {
    std::cerr << "Engine server ready" << std::endl;

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        auto parse_result = ParseJsonRpcRequest(line);

        JsonRpcResponse response;
        if (auto* request = std::get_if<JsonRpcRequest>(&parse_result)) {
            response = HandleRequest(*request);
        } else {
            response = std::get<JsonRpcResponse>(parse_result);
        }

        std::cout << response.ToJson().dump() << "\n";
        std::cout.flush();
    }
}

}  // namespace xve
