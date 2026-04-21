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

void JsonRpcServer::RegisterRawMethod(std::string method_name, RawMethodHandler handler) {
    raw_methods_.emplace(std::move(method_name), std::move(handler));
}

auto JsonRpcServer::HandleRequest(const JsonRpcRequest& request) -> JsonRpcResponse {
    // Raw-result handlers take precedence. In the HandleRequest path we parse
    // the raw string back into nlohmann::json so JsonRpcResponse stays
    // structurally uniform (this is the test/API path; the hot stdin loop uses
    // Run() which bypasses this parse).
    if (auto raw_it = raw_methods_.find(request.method); raw_it != raw_methods_.end()) {
        try {
            std::string raw = raw_it->second(request.params, container_);
            nlohmann::json result = nlohmann::json::parse(raw);
            return JsonRpcResponse::Success(request.id, std::move(result));
        } catch (const std::invalid_argument& e) {
            return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInvalidParams, e.what());
        } catch (const std::runtime_error& e) {
            return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInternalError, e.what());
        } catch (...) {
            return JsonRpcResponse::Error(request.id, JsonRpcErrorCode::kInternalError, "Internal error");
        }
    }

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

        if (auto* request = std::get_if<JsonRpcRequest>(&parse_result)) {
            // Fast path: raw-string handler — write envelope directly, skipping
            // nlohmann::json construction of the result payload.
            auto raw_it = raw_methods_.find(request->method);
            if (raw_it != raw_methods_.end()) {
                std::optional<JsonRpcResponse> err_response;
                std::string raw_result;
                try {
                    raw_result = raw_it->second(request->params, container_);
                } catch (const std::invalid_argument& e) {
                    err_response = JsonRpcResponse::Error(
                        request->id, JsonRpcErrorCode::kInvalidParams, e.what());
                } catch (const std::runtime_error& e) {
                    err_response = JsonRpcResponse::Error(
                        request->id, JsonRpcErrorCode::kInternalError, e.what());
                } catch (...) {
                    err_response = JsonRpcResponse::Error(
                        request->id, JsonRpcErrorCode::kInternalError, "Internal error");
                }
                if (err_response) {
                    std::cout << err_response->ToJson().dump() << "\n";
                } else {
                    std::string envelope;
                    envelope.reserve(raw_result.size() + 64);
                    envelope.append("{\"jsonrpc\":\"2.0\",\"id\":");
                    envelope.append(request->id.dump());
                    envelope.append(",\"result\":");
                    envelope.append(raw_result);
                    envelope.push_back('}');
                    std::cout << envelope << "\n";
                }
                std::cout.flush();
                continue;
            }
        }

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
