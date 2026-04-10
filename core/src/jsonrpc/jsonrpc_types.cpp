#include "xmlvisualeditor/jsonrpc/jsonrpc_types.h"

#include <utility>

namespace xve {

auto JsonRpcResponse::Success(nlohmann::json id, nlohmann::json result) -> JsonRpcResponse {
    return JsonRpcResponse{.id = std::move(id), .result = std::move(result), .error = std::nullopt};
}

auto JsonRpcResponse::Error(nlohmann::json id, JsonRpcErrorCode code, std::string message) -> JsonRpcResponse {
    return Error(std::move(id), static_cast<int>(code), std::move(message));
}

auto JsonRpcResponse::Error(nlohmann::json id, int code, std::string message) -> JsonRpcResponse {
    return JsonRpcResponse{
        .id = std::move(id),
        .result = std::nullopt,
        .error = JsonRpcError{.code = code, .message = std::move(message)},
    };
}

auto JsonRpcResponse::ToJson() const -> nlohmann::json {
    nlohmann::json j;
    j["jsonrpc"] = "2.0";
    j["id"] = id;

    if (result.has_value()) {
        j["result"] = *result;
    }
    if (error.has_value()) {
        j["error"] = {{"code", error->code}, {"message", error->message}};
    }

    return j;
}

auto ParseJsonRpcRequest(const std::string& line) -> std::variant<JsonRpcRequest, JsonRpcResponse> {
    nlohmann::json j;
    try {
        j = nlohmann::json::parse(line);
    } catch (const nlohmann::json::parse_error&) {
        return JsonRpcResponse::Error(nullptr, JsonRpcErrorCode::kParseError, "Parse error: invalid JSON");
    }

    if (!j.is_object()) {
        return JsonRpcResponse::Error(nullptr, JsonRpcErrorCode::kInvalidRequest, "Invalid request: not a JSON object");
    }

    // Extract id (may be absent — use null).
    nlohmann::json id = j.contains("id") ? j["id"] : nlohmann::json(nullptr);

    // Validate jsonrpc field.
    if (!j.contains("jsonrpc") || j["jsonrpc"] != "2.0") {
        return JsonRpcResponse::Error(
            id, JsonRpcErrorCode::kInvalidRequest, "Invalid request: missing or invalid jsonrpc field");
    }

    // Validate method field.
    if (!j.contains("method") || !j["method"].is_string()) {
        return JsonRpcResponse::Error(
            id, JsonRpcErrorCode::kInvalidRequest, "Invalid request: missing or invalid method field");
    }

    JsonRpcRequest request;
    request.jsonrpc = j["jsonrpc"].get<std::string>();
    request.method = j["method"].get<std::string>();
    request.params = j.value("params", nlohmann::json::object());
    request.id = id;

    return request;
}

}  // namespace xve
