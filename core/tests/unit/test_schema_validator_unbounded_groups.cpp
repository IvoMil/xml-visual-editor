// Regression tests for validation bug fixes: maxOccurs="unbounded", choice with group ref,
// xs:any wildcard, namespace-prefixed elements.

#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kUnboundedSequenceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="item" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kGroupRefUnboundedXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="ItemGroup">
    <xs:sequence>
      <xs:element name="entry" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:group>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:group ref="ItemGroup"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kChoiceGroupRefXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="CenterGroup">
    <xs:sequence>
      <xs:element name="firstCellCenter" type="xs:string"/>
      <xs:choice>
        <xs:element name="xCellSize" type="xs:double"/>
        <xs:element name="columnWidth" type="xs:double"/>
      </xs:choice>
    </xs:sequence>
  </xs:group>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:choice>
          <xs:group ref="CenterGroup"/>
          <xs:element name="gridCorners" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kWildcardXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="known" type="xs:string"/>
        <xs:any minOccurs="0" maxOccurs="unbounded" processContents="lax"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kMaxOccursOneXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="single" type="xs:string" maxOccurs="1"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kRequiredElementXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="required_child" type="xs:string"/>
        <xs:element name="optional_child" type="xs:string" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

}  // namespace

// Test 1: maxOccurs="unbounded" in sequence — no false positive
TEST_CASE("SchemaValidator - maxOccurs unbounded in sequence no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kUnboundedSequenceXsd));

    SECTION("multiple items are valid") {
        const std::string xml = "<root><item>a</item><item>b</item><item>c</item><item>d</item><item>e</item></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("zero items valid with minOccurs=0") {
        const std::string xml = "<root></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 2: maxOccurs="unbounded" via group ref — no false positive
TEST_CASE("SchemaValidator - maxOccurs unbounded via group ref no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kGroupRefUnboundedXsd));

    SECTION("multiple entries via group ref are valid") {
        const std::string xml = "<root><entry>a</entry><entry>b</entry><entry>c</entry></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("many entries via group ref are valid") {
        std::string xml = "<root>";
        for (int i = 0; i < 20; ++i)
            xml += "<entry>v" + std::to_string(i) + "</entry>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 3: choice with group ref — alternate branch selected
TEST_CASE("SchemaValidator - choice with group ref alternate branch regression",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceGroupRefXsd));

    SECTION("gridCorners branch selected — firstCellCenter not required") {
        const std::string xml = "<root><gridCorners>test</gridCorners></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("group ref branch selected with xCellSize") {
        const std::string xml = "<root><firstCellCenter>test</firstCellCenter><xCellSize>1.0</xCellSize></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("group ref branch selected with columnWidth") {
        const std::string xml = "<root><firstCellCenter>test</firstCellCenter><columnWidth>2.5</columnWidth></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 4: xs:any wildcard allows unknown elements
TEST_CASE("SchemaValidator - xs:any wildcard allows unknown elements regression",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kWildcardXsd));

    SECTION("unknown element allowed by wildcard") {
        const std::string xml = "<root><known>a</known><unknown>b</unknown></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("multiple unknown elements allowed by wildcard") {
        const std::string xml = "<root><known>a</known><foo>1</foo><bar>2</bar><baz>3</baz></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 5: namespace-prefixed extension elements allowed
TEST_CASE("SchemaValidator - namespace-prefixed extension elements allowed regression",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kWildcardXsd));

    SECTION("namespace-prefixed element tolerated") {
        const std::string xml =
            "<?xml version=\"1.0\"?>\n"
            "<root xmlns:ext=\"http://example.com/ext\">"
            "<known>test</known><ext:custom>value</ext:custom></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 6: Negative — legitimate maxOccurs=1 violation still caught
TEST_CASE("SchemaValidator - maxOccurs=1 violation still caught", "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kMaxOccursOneXsd));

    SECTION("two instances of maxOccurs=1 element produces diagnostic") {
        const std::string xml = "<root><single>a</single><single>b</single></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_single = false;
        for (auto& d : diags)
            if (d.message.find("single") != std::string::npos)
                mentions_single = true;
        CHECK(mentions_single);
    }

    container.Shutdown();
}

// Test 7: Negative — truly missing required element still caught
TEST_CASE("SchemaValidator - missing required element still caught", "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kRequiredElementXsd));

    SECTION("missing required_child produces diagnostic") {
        const std::string xml = "<root><optional_child>test</optional_child></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        REQUIRE(!diags.empty());
        bool mentions_required = false;
        for (auto& d : diags)
            if (d.message.find("required_child") != std::string::npos)
                mentions_required = true;
        CHECK(mentions_required);
    }

    SECTION("present required_child with missing optional is valid") {
        const std::string xml = "<root><required_child>test</required_child></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    container.Shutdown();
}
