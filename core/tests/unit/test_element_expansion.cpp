#include "test_helper_data_fixtures.h"

#include "xmlvisualeditor/core/document.h"

#include <sstream>

namespace {

constexpr auto kExpansionXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="noReqAttrs" type="xs:string"/>
        <xs:element name="withReqAttrs">
          <xs:complexType>
            <xs:attribute name="id" type="xs:string" use="required"/>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kExpansionXml = R"(<?xml version="1.0"?>
<root></root>)";

}  // namespace

// ── Regression Bug P: Empty element expansion ─────────────────────────────
// Elements WITHOUT required attributes should be inserted in expanded form
// <foo></foo> instead of self-closing <foo/>.
// Elements WITH required attributes stay self-closing <foo attr="..."/>.

TEST_CASE("InsertElement - element expansion form based on required attributes",
          "[helper][insert][element-expansion][regression]") {
    TestFixture f;
    f.Init(kExpansionXsd, kExpansionXml);

    SECTION("Element without required attributes is inserted in expanded form") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "noReqAttrs");
        REQUIRE(result.success);
        // Must be expanded: <noReqAttrs></noReqAttrs>
        CHECK(result.new_content.find("<noReqAttrs></noReqAttrs>") != std::string::npos);
        // Must NOT be self-closing
        CHECK(result.new_content.find("<noReqAttrs/>") == std::string::npos);
    }

    SECTION("Element with required attributes is also expanded") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "withReqAttrs");
        REQUIRE(result.success);
        // Must contain the opening tag
        CHECK(result.new_content.find("<withReqAttrs") != std::string::npos);
        // With expand_empty, even elements with required attrs are expanded
        CHECK(result.new_content.find("</withReqAttrs>") != std::string::npos);
        // Must NOT be self-closing
        CHECK(result.new_content.find("<withReqAttrs/>") == std::string::npos);
    }
}

// ── Regression Bug P: Document::ToString with expand_empty flag ───────────
// InsertRequiredChildren uses ToString(true, "    ", true) to ensure that
// empty elements are serialized in expanded form <foo></foo> not <foo/>.

TEST_CASE("Document::ToString - expand_empty prevents self-closing tags",
          "[document][element-expansion][regression]") {
    SECTION("Self-closing tag is expanded") {
        auto [doc, result] = xve::Document::ParseString("<root><empty/></root>");
        REQUIRE(result.success);

        // Default: self-closing preserved (pugixml adds space before />)
        auto default_str = doc->ToString(true, "    ", false);
        CHECK(default_str.find("<empty />") != std::string::npos);

        // With expand_empty: expanded form
        auto expanded_str = doc->ToString(true, "    ", true);
        CHECK(expanded_str.find("<empty></empty>") != std::string::npos);
        CHECK(expanded_str.find("<empty />") == std::string::npos);
    }

    SECTION("Multiple self-closing tags are all expanded") {
        auto [doc, result] = xve::Document::ParseString("<root><a/><b attr=\"v\"/><c/></root>");
        REQUIRE(result.success);

        auto expanded = doc->ToString(true, "    ", true);
        CHECK(expanded.find("<a></a>") != std::string::npos);
        CHECK(expanded.find("<b attr=\"v\"></b>") != std::string::npos);
        CHECK(expanded.find("<c></c>") != std::string::npos);
        CHECK(expanded.find(" />") == std::string::npos);
    }

    SECTION("Already-expanded elements are preserved") {
        auto [doc, result] = xve::Document::ParseString("<root><child>text</child></root>");
        REQUIRE(result.success);

        auto expanded = doc->ToString(true, "    ", true);
        CHECK(expanded.find("<child>text</child>") != std::string::npos);
    }
}
