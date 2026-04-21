#pragma once

#include <nlohmann/json.hpp>

#include <functional>
#include <string>
#include <unordered_map>

namespace xve {

class ServiceContainer;
struct JsonRpcRequest;
struct JsonRpcResponse;

// Handler signature: receives params and service container, returns result JSON.
// Throws std::runtime_error or std::invalid_argument on failure.
using MethodHandler = std::function<nlohmann::json(const nlohmann::json& params, ServiceContainer& container)>;

// Raw-string handler: returns a pre-serialised JSON value that will be
// slotted directly into the JSON-RPC response's "result" field, bypassing
// nlohmann::json construction + dump() for large payloads (e.g.
// gridView.getTreeData on multi-megabyte trees). The returned string MUST be a
// valid JSON value (object, array, number, string, bool, or null). Throws the
// same exception types as MethodHandler on failure.
using RawMethodHandler = std::function<std::string(const nlohmann::json& params, ServiceContainer& container)>;

class JsonRpcServer {
public:
    explicit JsonRpcServer(ServiceContainer& container);

    void RegisterMethod(std::string method_name, MethodHandler handler);
    void RegisterRawMethod(std::string method_name, RawMethodHandler handler);

    // Run the server loop: reads stdin line-by-line, writes responses to stdout, blocks until EOF.
    void Run();

    // Process a single parsed request. Useful for unit testing.
    auto HandleRequest(const JsonRpcRequest& request) -> JsonRpcResponse;

private:
    ServiceContainer& container_;
    std::unordered_map<std::string, MethodHandler> methods_;
    std::unordered_map<std::string, RawMethodHandler> raw_methods_;
};

}  // namespace xve
