#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {
constexpr const char* kTestXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="library">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="book" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="title" type="xs:string"/>
              <xs:element name="author" type="xs:string" minOccurs="0"/>
              <xs:element name="year" type="xs:integer" minOccurs="0"/>
            </xs:sequence>
            <xs:attribute name="isbn" type="xs:string" use="required"/>
            <xs:attribute name="category" type="categoryType" use="optional"/>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:simpleType name="categoryType">
    <xs:restriction base="xs:string">
      <xs:enumeration value="fiction"/>
      <xs:enumeration value="non-fiction"/>
      <xs:enumeration value="reference"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>
)";

constexpr const char* kMaxOccursOneXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="single" maxOccurs="1"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kUnionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="StatusEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="active"/>
      <xs:enumeration value="inactive"/>
      <xs:enumeration value="pending"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="CustomPattern">
    <xs:restriction base="xs:string">
      <xs:pattern value="\\$.*\\$"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="FlexibleType">
    <xs:union memberTypes="StatusEnum CustomPattern xs:string"/>
  </xs:simpleType>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="status" type="FlexibleType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kStrictUnionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="StatusEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="active"/>
      <xs:enumeration value="inactive"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="CustomPattern">
    <xs:restriction base="xs:string">
      <xs:pattern value="\\$.*\\$"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="StrictUnion">
    <xs:union memberTypes="StatusEnum CustomPattern"/>
  </xs:simpleType>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="status" type="StrictUnion"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

}  // namespace

TEST_CASE("SchemaValidator - various validation scenarios", "[schema][validator]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);

    // Load primary test schema
    CHECK(schema_service->LoadSchemaFromString("test", kTestXsd));

    SECTION("Valid XML produces no diagnostics") {
        const std::string xml = "<library><book isbn=\"123\"><title>Test</title></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    SECTION("Invalid root element") {
        const std::string xml = "<catalog><book isbn=\"123\"><title>Test</title></book></catalog>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_catalog = false;
        for (auto& d : diags)
            if (d.message.find("catalog") != std::string::npos)
                mentions_catalog = true;
        CHECK(mentions_catalog);
    }

    SECTION("Invalid child element") {
        const std::string xml = "<library><book isbn=\"123\"><title>T</title><invalid/></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_invalid = false;
        for (auto& d : diags)
            if (d.message.find("invalid") != std::string::npos)
                mentions_invalid = true;
        CHECK(mentions_invalid);
    }

    SECTION("Missing required attribute") {
        const std::string xml = "<library><book><title>T</title></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_isbn = false;
        for (auto& d : diags)
            if (d.message.find("isbn") != std::string::npos)
                mentions_isbn = true;
        CHECK(mentions_isbn);
    }

    SECTION("Unknown attribute") {
        const std::string xml = "<library><book isbn=\"123\" foo=\"bar\"><title>T</title></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_foo = false;
        for (auto& d : diags)
            if (d.message.find("foo") != std::string::npos)
                mentions_foo = true;
        CHECK(mentions_foo);
    }

    SECTION("Missing required child element") {
        const std::string xml = "<library><book isbn=\"123\"></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_title = false;
        for (auto& d : diags)
            if (d.message.find("title") != std::string::npos)
                mentions_title = true;
        CHECK(mentions_title);
    }

    SECTION("Too many elements (maxOccurs violation)") {
        // Load alternative schema with maxOccurs=1
        CHECK(schema_service->LoadSchemaFromString("max1", kMaxOccursOneXsd));
        const std::string xml = "<root><single/><single/></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "max1");
        REQUIRE(!diags.empty());
        bool mentions_single = false;
        for (auto& d : diags)
            if (d.message.find("single") != std::string::npos)
                mentions_single = true;
        CHECK(mentions_single);
    }

    SECTION("Diagnostics include line and column") {
        const std::string xml = "<library><book><title>T</title></book></library>";  // missing isbn
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        for (auto& d : diags) {
            CHECK(d.line > 0);
            CHECK(d.column > 0);
        }
    }

    SECTION("Diagnostics include element_path") {
        const std::string xml = "<library><book><title>T</title></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        for (auto& d : diags) {
            CHECK(!d.element_path.empty());
        }
    }

    SECTION("Malformed XML returns parse errors") {
        const std::string xml = "<unclosed";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        // Implementation may emit varied parse messages; ensure diagnostics are present
        CHECK(diags.front().line >= 0);
    }

    SECTION("Namespace attributes are skipped") {
        const std::string xml =
            "<library xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><book "
            "isbn=\"123\"><title>T</title></book></library>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        // Should be valid
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Regression tests for union type handling (Bug 1)
TEST_CASE("SchemaValidator - union type validation regressions", "[schema][validator]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  // Load flexible union (includes xs:string member)
  CHECK(schema_service->LoadSchemaFromString("union", kUnionXsd));
  // Load strict union (no xs:string member)
  CHECK(schema_service->LoadSchemaFromString("strict_union", kStrictUnionXsd));

  SECTION("Enum member value accepted") {
    const std::string xml = "<root><status>active</status></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "union");
    CHECK(diags.empty());
  }

  SECTION("Pattern member value accepted") {
    const std::string xml = "<root><status>$custom$</status></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "union");
    CHECK(diags.empty());
  }

  SECTION("Arbitrary string accepted via string member") {
    const std::string xml = "<root><status>anything goes</status></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "union");
    CHECK(diags.empty());
  }

  SECTION("Union without string member rejects invalid") {
    const std::string xml = "<root><status>INVALID_VALUE</status></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "strict_union");
    REQUIRE(!diags.empty());
  }

  container.Shutdown();
}
