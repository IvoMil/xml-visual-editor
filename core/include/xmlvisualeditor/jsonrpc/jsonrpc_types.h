#pragma once

#include <nlohmann/json.hpp>

#include <optional>
#include <string>
#include <variant>

namespace xve {

// Standard JSON-RPC 2.0 error codes.
enum class JsonRpcErrorCode : int {
    kParseError = -32700,
    kInvalidRequest = -32600,
    kMethodNotFound = -32601,
    kInvalidParams = -32602,
    kInternalError = -32603,
};

struct JsonRpcError {
    int code;
    std::string message;
};

struct JsonRpcRequest {
    std::string jsonrpc;  // Should be "2.0"
    std::string method;
    nlohmann::json params;  // Can be object or array
    nlohmann::json id;      // Can be string, int, or null
};

struct JsonRpcResponse {
    nlohmann::json id;
    std::optional<nlohmann::json> result;
    std::optional<JsonRpcError> error;

    static auto Success(nlohmann::json id, nlohmann::json result) -> JsonRpcResponse;
    static auto Error(nlohmann::json id, JsonRpcErrorCode code, std::string message) -> JsonRpcResponse;
    static auto Error(nlohmann::json id, int code, std::string message) -> JsonRpcResponse;

    auto ToJson() const -> nlohmann::json;
};

// Parse a JSON string into a JsonRpcRequest. Returns an error response if the input is invalid JSON
// or does not conform to JSON-RPC 2.0.
auto ParseJsonRpcRequest(const std::string& line) -> std::variant<JsonRpcRequest, JsonRpcResponse>;

}  // namespace xve
