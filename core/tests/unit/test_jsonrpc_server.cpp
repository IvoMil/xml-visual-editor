#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/jsonrpc_types.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <catch2/catch_test_macros.hpp>

#include <string>

using namespace xve;

namespace {

auto MakeRequest(const std::string& method, const nlohmann::json& params, int id = 1) -> JsonRpcRequest {
    return JsonRpcRequest{.jsonrpc = "2.0", .method = method, .params = params, .id = id};
}

}  // namespace

// ── Server Dispatch Tests ──────────────────────────────────────────────────

TEST_CASE("Unknown method returns MethodNotFound", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);

    auto resp = server.HandleRequest(MakeRequest("nonexistent.method", {}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kMethodNotFound));

    container.Shutdown();
}

TEST_CASE("Handler throwing invalid_argument returns InvalidParams", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);

    server.RegisterMethod("test.throw_invalid", [](const nlohmann::json&, ServiceContainer&) -> nlohmann::json {
        throw std::invalid_argument("bad param");
    });

    auto resp = server.HandleRequest(MakeRequest("test.throw_invalid", {}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidParams));
    CHECK(resp.error->message == "bad param");

    container.Shutdown();
}

TEST_CASE("Handler throwing runtime_error returns InternalError", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);

    server.RegisterMethod("test.throw_runtime", [](const nlohmann::json&, ServiceContainer&) -> nlohmann::json {
        throw std::runtime_error("something broke");
    });

    auto resp = server.HandleRequest(MakeRequest("test.throw_runtime", {}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInternalError));
    CHECK(resp.error->message == "something broke");

    container.Shutdown();
}

// ── Method Handler Integration Tests ───────────────────────────────────────

TEST_CASE("document.openFromString with valid XML", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.openFromString", {{"content", "<root/>"}}));
    REQUIRE(resp.result.has_value());
    CHECK(resp.result->contains("doc_id"));
    CHECK((*resp.result)["doc_id"].is_string());

    container.Shutdown();
}

TEST_CASE("document.getContent returns XML content", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    // Open a document first.
    auto open_resp =
        server.HandleRequest(MakeRequest("document.openFromString", {{"content", "<root><child/></root>"}}));
    REQUIRE(open_resp.result.has_value());
    std::string doc_id = (*open_resp.result)["doc_id"].get<std::string>();

    // Get its content.
    auto get_resp = server.HandleRequest(MakeRequest("document.getContent", {{"doc_id", doc_id}}));
    REQUIRE(get_resp.result.has_value());
    CHECK((*get_resp.result)["content"].get<std::string>().find("<root>") != std::string::npos);

    container.Shutdown();
}

TEST_CASE("document.update modifies content", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto open_resp = server.HandleRequest(MakeRequest("document.openFromString", {{"content", "<root/>"}}));
    std::string doc_id = (*open_resp.result)["doc_id"].get<std::string>();

    auto update_resp =
        server.HandleRequest(MakeRequest("document.update", {{"doc_id", doc_id}, {"content", "<new/>"}}));
    REQUIRE(update_resp.result.has_value());
    CHECK((*update_resp.result)["success"] == true);

    // Verify updated content.
    auto get_resp = server.HandleRequest(MakeRequest("document.getContent", {{"doc_id", doc_id}}));
    CHECK((*get_resp.result)["content"].get<std::string>().find("<new") != std::string::npos);

    container.Shutdown();
}

TEST_CASE("document.close succeeds", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto open_resp = server.HandleRequest(MakeRequest("document.openFromString", {{"content", "<root/>"}}));
    std::string doc_id = (*open_resp.result)["doc_id"].get<std::string>();

    auto close_resp = server.HandleRequest(MakeRequest("document.close", {{"doc_id", doc_id}}));
    REQUIRE(close_resp.result.has_value());
    CHECK((*close_resp.result)["success"] == true);

    container.Shutdown();
}

TEST_CASE("document.getContent with unknown doc_id returns error", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.getContent", {{"doc_id", "nonexistent"}}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInternalError));

    container.Shutdown();
}

TEST_CASE("document.open missing path returns InvalidParams", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.open", {}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidParams));

    container.Shutdown();
}

TEST_CASE("validation.validateWellFormedness with valid XML", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterValidationHandlers(server);

    auto resp =
        server.HandleRequest(MakeRequest("validation.validateWellFormedness", {{"content", "<root><child/></root>"}}));
    REQUIRE(resp.result.has_value());
    CHECK((*resp.result)["diagnostics"].is_array());
    CHECK((*resp.result)["diagnostics"].empty());

    container.Shutdown();
}

TEST_CASE("validation.validateWellFormedness with malformed XML", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterValidationHandlers(server);

    auto resp =
        server.HandleRequest(MakeRequest("validation.validateWellFormedness", {{"content", "<root><unclosed>"}}));
    REQUIRE(resp.result.has_value());
    CHECK((*resp.result)["diagnostics"].is_array());
    CHECK(!(*resp.result)["diagnostics"].empty());

    container.Shutdown();
}

TEST_CASE("validation.validateWellFormedness missing content returns InvalidParams", "[jsonrpc][server]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterValidationHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("validation.validateWellFormedness", {}));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidParams));

    container.Shutdown();
}

TEST_CASE("Schema JSON-RPC handlers", "[jsonrpc][schema]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);
    RegisterValidationHandlers(server);
    RegisterSchemaHandlers(server);

    constexpr const char* kTestXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="library">
        <xs:complexType>
            <xs:sequence>
                <xs:element name="book" maxOccurs="unbounded">
                    <xs:complexType>
                        <xs:sequence>
                            <xs:element name="title" type="xs:string"/>
                        </xs:sequence>
                        <xs:attribute name="isbn" type="xs:string" use="required"/>
                    </xs:complexType>
                </xs:element>
            </xs:sequence>
        </xs:complexType>
    </xs:element>
</xs:schema>
)";

    SECTION("schema.load and schema.getRootElements") {
        auto load =
            server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "test"}, {"content", kTestXsd}}));
        REQUIRE(load.result.has_value());

        auto roots = server.HandleRequest(MakeRequest("schema.getRootElements", {{"schema_id", "test"}}));
        REQUIRE(roots.result.has_value());
        CHECK(((*roots.result).is_array() || (*roots.result).is_object()));
    }

    SECTION("schema.getElementInfo") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "test2"}, {"content", kTestXsd}}));
        auto info = server.HandleRequest(
            MakeRequest("schema.getElementInfo", {{"schema_id", "test2"}, {"element_name", "book"}}));
        REQUIRE(info.result.has_value());
        CHECK((*info.result).is_object());
    }

    SECTION("schema.getAllowedChildren") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "test3"}, {"content", kTestXsd}}));
        auto c = server.HandleRequest(
            MakeRequest("schema.getAllowedChildren", {{"schema_id", "test3"}, {"element_name", "library"}}));
        REQUIRE(c.result.has_value());
        CHECK(((*c.result).is_array() || (*c.result).is_object()));
    }

    SECTION("schema.getAllowedAttributes") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "test4"}, {"content", kTestXsd}}));
        auto a = server.HandleRequest(
            MakeRequest("schema.getAllowedAttributes", {{"schema_id", "test4"}, {"element_name", "book"}}));
        REQUIRE(a.result.has_value());
        CHECK((*a.result).is_object());
    }

    SECTION("schema.unload") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "tounload"}, {"content", kTestXsd}}));
        auto u = server.HandleRequest(MakeRequest("schema.unload", {{"schema_id", "tounload"}}));
        REQUIRE(u.result.has_value());
        CHECK((*u.result)["success"].get<bool>() == true);
    }

    SECTION("validation.validateSchema with valid XML") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "valtest"}, {"content", kTestXsd}}));
        auto resp = server.HandleRequest(MakeRequest(
            "validation.validateSchema",
            {{"schema_id", "valtest"}, {"content", "<library><book isbn=\"1\"><title>T</title></book></library>"}}));
        REQUIRE(resp.result.has_value());
        CHECK((*resp.result)["diagnostics"].is_array());
        CHECK((*resp.result)["diagnostics"].empty());
    }

    SECTION("validation.validateSchema with invalid XML") {
        server.HandleRequest(MakeRequest("schema.loadFromString", {{"schema_id", "valtest2"}, {"content", kTestXsd}}));
        auto resp = server.HandleRequest(
            MakeRequest("validation.validateSchema",
                        {{"schema_id", "valtest2"}, {"content", "<library><book><title>T</title></book></library>"}}));
        REQUIRE(resp.result.has_value());
        CHECK((*resp.result)["diagnostics"].is_array());
        CHECK(!(*resp.result)["diagnostics"].empty());
    }

    container.Shutdown();
}
