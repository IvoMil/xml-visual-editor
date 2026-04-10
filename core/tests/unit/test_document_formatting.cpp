#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/jsonrpc_types.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <string>

using namespace xve;
using Catch::Matchers::ContainsSubstring;

namespace {

auto MakeRequest(const std::string& method, const nlohmann::json& params, int id = 1) -> JsonRpcRequest {
    return JsonRpcRequest{.jsonrpc = "2.0", .method = method, .params = params, .id = id};
}

// Opens a document from string, returns doc_id. Fails the test if open fails.
auto OpenDoc(JsonRpcServer& server, const std::string& content) -> std::string {
    auto resp = server.HandleRequest(MakeRequest("document.openFromString", {{"content", content}}));
    REQUIRE(resp.result.has_value());
    return (*resp.result)["doc_id"].get<std::string>();
}

constexpr const char* kMinifiedXml = R"(<?xml version="1.0" encoding="UTF-8"?><catalog><book id="1"><title>XML Guide</title><price>29.99</price></book><book id="2"><title>XSD Handbook</title><price>39.99</price></book></catalog>)";

constexpr const char* kPrettyXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    "<catalog>\n"
    "    <book id=\"1\">\n"
    "        <title>XML Guide</title>\n"
    "        <price>29.99</price>\n"
    "    </book>\n"
    "    <book id=\"2\">\n"
    "        <title>XSD Handbook</title>\n"
    "        <price>39.99</price>\n"
    "    </book>\n"
    "</catalog>\n";

constexpr const char* kSimpleXml = "<root><name>John</name><age>30</age></root>";

}  // namespace

// ── Pretty-Print Tests ─────────────────────────────────────────────────────

TEST_CASE("document.prettyPrint - formats minified XML with indentation", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kMinifiedXml);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    CHECK_THAT(content, ContainsSubstring("\n"));
    CHECK_THAT(content, ContainsSubstring("    <book"));
    CHECK_THAT(content, ContainsSubstring("        <title>"));

    container.Shutdown();
}

TEST_CASE("document.prettyPrint - idempotent on already-formatted XML", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kPrettyXml);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    // Pretty-printing already-pretty XML should produce identical output.
    CHECK(content == kPrettyXml);

    container.Shutdown();
}

TEST_CASE("document.prettyPrint - preserves text content", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kSimpleXml);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    CHECK_THAT(content, ContainsSubstring("<name>John</name>"));
    CHECK_THAT(content, ContainsSubstring("<age>30</age>"));

    container.Shutdown();
}

TEST_CASE("document.prettyPrint - preserves XML declaration", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kMinifiedXml);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    CHECK_THAT(content, ContainsSubstring("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));

    container.Shutdown();
}

// ── Linearize Tests ────────────────────────────────────────────────────────

TEST_CASE("document.linearize - compacts formatted XML", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kPrettyXml);

    auto resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    // Linearized XML should have no indentation newlines between elements.
    CHECK(content.find("    <") == std::string::npos);
    CHECK_THAT(content, ContainsSubstring("<catalog>"));
    CHECK_THAT(content, ContainsSubstring("<book id=\"1\">"));
    CHECK_THAT(content, ContainsSubstring("</catalog>"));

    container.Shutdown();
}

TEST_CASE("document.linearize - idempotent on already-compact XML", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kMinifiedXml);

    auto resp1 = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp1.result.has_value());
    auto content1 = (*resp1.result)["content"].get<std::string>();

    // Update the document with linearized content and linearize again.
    server.HandleRequest(MakeRequest("document.update", {{"doc_id", doc_id}, {"content", content1}}));
    auto resp2 = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp2.result.has_value());
    auto content2 = (*resp2.result)["content"].get<std::string>();

    CHECK(content1 == content2);

    container.Shutdown();
}

TEST_CASE("document.linearize - preserves text content", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kSimpleXml);

    auto resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    CHECK_THAT(content, ContainsSubstring("<name>John</name>"));
    CHECK_THAT(content, ContainsSubstring("<age>30</age>"));

    container.Shutdown();
}

TEST_CASE("document.linearize - preserves XML declaration", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    std::string xml_with_decl = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<root>\n    <child/>\n</root>\n";
    auto doc_id = OpenDoc(server, xml_with_decl);

    auto resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    CHECK_THAT(content, ContainsSubstring("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));

    container.Shutdown();
}

// ── Roundtrip Tests ────────────────────────────────────────────────────────

TEST_CASE("document.prettyPrint and linearize - roundtrip preserves content", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, kMinifiedXml);

    // Pretty-print first.
    auto pretty_resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(pretty_resp.result.has_value());
    auto pretty_content = (*pretty_resp.result)["content"].get<std::string>();

    // Update document with pretty-printed content.
    server.HandleRequest(MakeRequest("document.update", {{"doc_id", doc_id}, {"content", pretty_content}}));

    // Linearize the pretty-printed content.
    auto linear_resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(linear_resp.result.has_value());
    auto linear_content = (*linear_resp.result)["content"].get<std::string>();

    // Roundtripped content should have the same elements and text.
    CHECK_THAT(linear_content, ContainsSubstring("<catalog>"));
    CHECK_THAT(linear_content, ContainsSubstring("<title>XML Guide</title>"));
    CHECK_THAT(linear_content, ContainsSubstring("<price>29.99</price>"));
    CHECK_THAT(linear_content, ContainsSubstring("<title>XSD Handbook</title>"));
    CHECK_THAT(linear_content, ContainsSubstring("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));

    container.Shutdown();
}

// ── Error Handling ─────────────────────────────────────────────────────────

TEST_CASE("document.prettyPrint - invalid doc_id returns error", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", "nonexistent"}}));
    REQUIRE(resp.error.has_value());
    CHECK_THAT(resp.error->message, ContainsSubstring("not found"));

    container.Shutdown();
}

TEST_CASE("document.linearize - invalid doc_id returns error", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", "nonexistent"}}));
    REQUIRE(resp.error.has_value());
    CHECK_THAT(resp.error->message, ContainsSubstring("not found"));

    container.Shutdown();
}

TEST_CASE("document.prettyPrint - missing doc_id returns InvalidParams", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", nlohmann::json::object()));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidParams));

    container.Shutdown();
}

TEST_CASE("document.linearize - missing doc_id returns InvalidParams", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto resp = server.HandleRequest(MakeRequest("document.linearize", nlohmann::json::object()));
    REQUIRE(resp.error.has_value());
    CHECK(resp.error->code == static_cast<int>(JsonRpcErrorCode::kInvalidParams));

    container.Shutdown();
}

// ── Self-closing tag space removal ─────────────────────────────────────────

TEST_CASE("document.prettyPrint - pugixml preserves space before />", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, "<root><empty/><withAttr name=\"val\"/></root>");

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    // pugixml adds a space before "/>" — we now keep it
    CHECK(content.find(" />") != std::string::npos);
    CHECK_THAT(content, ContainsSubstring("<empty />"));
    CHECK_THAT(content, ContainsSubstring("name=\"val\" />"));

    container.Shutdown();
}

TEST_CASE("document.linearize - pugixml omits space before /> in raw mode", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    auto doc_id = OpenDoc(server, "<root>\n  <item attr=\"x\" />\n</root>");

    auto resp = server.HandleRequest(MakeRequest("document.linearize", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    // In raw (linearize) mode, pugixml does NOT add space before />
    CHECK_THAT(content, ContainsSubstring("attr=\"x\"/>"));

    container.Shutdown();
}

TEST_CASE("document.prettyPrint - space in quoted attributes preserved near />", "[formatting]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    // Attribute value contains " />" — that must NOT be modified
    auto doc_id = OpenDoc(server, R"(<root><tag val="has space /&gt; inside"/></root>)");

    auto resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}}));
    REQUIRE(resp.result.has_value());
    auto content = (*resp.result)["content"].get<std::string>();

    // Self-closing tags now keep the space before />
    CHECK_THAT(content, ContainsSubstring(" />"));

    container.Shutdown();
}

// ── Regression: Bug N — comments must survive pretty-print ─────────────────

TEST_CASE("Pretty-print preserves XML comments", "[formatting][regression]") {
    constexpr const char* kXmlWithComments =
        "<?xml version=\"1.0\"?>\n"
        "<root><!-- header comment --><child>text</child><!-- footer comment --></root>";

    auto [doc, res] = Document::ParseString(kXmlWithComments);
    REQUIRE(doc != nullptr);
    REQUIRE(res.success);

    auto output = doc->ToString(true, "    ");

    CHECK_THAT(output, ContainsSubstring("<!-- header comment -->"));
    CHECK_THAT(output, ContainsSubstring("<!-- footer comment -->"));
    CHECK_THAT(output, ContainsSubstring("<child>text</child>"));
}

// ── Regression: Trailing space before > corrupts structure ─────────────────

TEST_CASE("Pretty-print preserves children when opening tag has trailing space", "[formatting][regression]") {
    // Bug: <book id="4" > (trailing space before >) caused children to become siblings
    constexpr const char* kTrailingSpaceXml =
        R"(<book id="4" ><title>Test</title><author>Bob</author></book>)";

    auto [doc, res] = Document::ParseString(kTrailingSpaceXml);
    REQUIRE(doc != nullptr);
    REQUIRE(res.success);

    auto output = doc->ToString(true, "    ");

    // title and author must be CHILDREN of book, not siblings
    CHECK_THAT(output, ContainsSubstring("<book"));
    CHECK_THAT(output, ContainsSubstring("    <title>Test</title>"));
    CHECK_THAT(output, ContainsSubstring("    <author>Bob</author>"));

    // Must have exactly ONE </book> closing tag (children inside)
    auto first_close = output.find("</book>");
    auto second_close = output.find("</book>", first_close + 1);
    CHECK(first_close != std::string::npos);
    CHECK(second_close == std::string::npos);  // Only one </book>

    // <book> opening tag must NOT be self-closed
    CHECK(output.find("<book id=\"4\"></book>") == std::string::npos);
}

TEST_CASE("document.update + prettyPrint with trailing space", "[formatting][regression]") {
    ServiceContainer container;
    container.Initialize();
    JsonRpcServer server(container);
    RegisterDocumentHandlers(server);

    // First open a document (any content)
    auto doc_id = OpenDoc(server, "<root/>");

    // Now update with content that has trailing space before >
    constexpr const char* kTrailingSpace =
        R"(<?xml version="1.0"?>
<library>
	<book id="4" >
		<title>Data Structures</title>
		<author>Bob Johnson</author>
	</book>
</library>)";

    auto update_resp =
        server.HandleRequest(MakeRequest("document.update", {{"doc_id", doc_id}, {"content", kTrailingSpace}}));
    REQUIRE(update_resp.result.has_value());
    CHECK((*update_resp.result)["success"].get<bool>() == true);

    auto pp_resp = server.HandleRequest(MakeRequest("document.prettyPrint", {{"doc_id", doc_id}, {"indent", "\t"}}));
    REQUIRE(pp_resp.result.has_value());
    auto content = (*pp_resp.result)["content"].get<std::string>();

    // title and author must be children of book, not siblings
    CHECK_THAT(content, ContainsSubstring("<book"));
    CHECK_THAT(content, ContainsSubstring("<title>Data Structures</title>"));
    CHECK_THAT(content, ContainsSubstring("<author>Bob Johnson</author>"));

    // Must NOT have self-closed <book> (which would mean children became siblings)
    CHECK(content.find("<book id=\"4\"></book>") == std::string::npos);

    // Verify structure: only one </book>
    auto first_close = content.find("</book>");
    auto second_close = content.find("</book>", first_close + 1);
    CHECK(first_close != std::string::npos);
    CHECK(second_close == std::string::npos);

    container.Shutdown();
}
