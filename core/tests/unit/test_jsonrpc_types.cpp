#include "xmlvisualeditor/jsonrpc/jsonrpc_types.h"

#include <nlohmann/json.hpp>

#include <catch2/catch_test_macros.hpp>

#include <string>
#include <variant>

using namespace xve;

TEST_CASE("ParseJsonRpcRequest with valid request", "[jsonrpc]") {
    std::string line = R"({"jsonrpc":"2.0","method":"test.method","params":{"key":"value"},"id":1})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcRequest>(result));
    auto& req = std::get<JsonRpcRequest>(result);
    CHECK(req.jsonrpc == "2.0");
    CHECK(req.method == "test.method");
    CHECK(req.params["key"] == "value");
    CHECK(req.id == 1);
}

TEST_CASE("ParseJsonRpcRequest with string id", "[jsonrpc]") {
    std::string line = R"({"jsonrpc":"2.0","method":"test","id":"abc-123"})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcRequest>(result));
    auto& req = std::get<JsonRpcRequest>(result);
    CHECK(req.id == "abc-123");
}

TEST_CASE("ParseJsonRpcRequest with invalid JSON returns parse error", "[jsonrpc]") {
    std::string line = "not valid json{{{";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcResponse>(result));
    auto& resp = std::get<JsonRpcResponse>(result);
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kParseError));
}

TEST_CASE("ParseJsonRpcRequest with non-object JSON returns invalid request", "[jsonrpc]") {
    std::string line = R"([1, 2, 3])";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcResponse>(result));
    auto& resp = std::get<JsonRpcResponse>(result);
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidRequest));
}

TEST_CASE("ParseJsonRpcRequest with missing jsonrpc field", "[jsonrpc]") {
    std::string line = R"({"method":"test","id":1})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcResponse>(result));
    auto& resp = std::get<JsonRpcResponse>(result);
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidRequest));
}

TEST_CASE("ParseJsonRpcRequest with wrong jsonrpc version", "[jsonrpc]") {
    std::string line = R"({"jsonrpc":"1.0","method":"test","id":1})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcResponse>(result));
    auto& resp = std::get<JsonRpcResponse>(result);
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidRequest));
}

TEST_CASE("ParseJsonRpcRequest with missing method", "[jsonrpc]") {
    std::string line = R"({"jsonrpc":"2.0","id":1})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcResponse>(result));
    auto& resp = std::get<JsonRpcResponse>(result);
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidRequest));
}

TEST_CASE("ParseJsonRpcRequest defaults params to empty object", "[jsonrpc]") {
    std::string line = R"({"jsonrpc":"2.0","method":"test","id":1})";
    auto result = ParseJsonRpcRequest(line);

    REQUIRE(std::holds_alternative<JsonRpcRequest>(result));
    auto& req = std::get<JsonRpcRequest>(result);
    CHECK(req.params.is_object());
    CHECK(req.params.empty());
}

TEST_CASE("JsonRpcResponse::Success produces correct JSON", "[jsonrpc]") {
    auto resp = JsonRpcResponse::Success(42, {{"key", "value"}});
    auto j = resp.ToJson();

    CHECK(j["jsonrpc"] == "2.0");
    CHECK(j["id"] == 42);
    CHECK(j["result"]["key"] == "value");
    CHECK(!j.contains("error"));
}

TEST_CASE("JsonRpcResponse::Error produces correct JSON", "[jsonrpc]") {
    auto resp = JsonRpcResponse::Error(1, JsonRpcErrorCode::kMethodNotFound, "Not found");
    auto j = resp.ToJson();

    CHECK(j["jsonrpc"] == "2.0");
    CHECK(j["id"] == 1);
    CHECK(j["error"]["code"] == static_cast<int>(JsonRpcErrorCode::kMethodNotFound));
    CHECK(j["error"]["message"] == "Not found");
    CHECK(!j.contains("result"));
}
