#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kNestedUnionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="colorEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="red"/>
      <xs:enumeration value="blue"/>
      <xs:enumeration value="green"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="rgbPattern">
    <xs:restriction base="xs:string">
      <xs:pattern value="[0-9A-F]{6}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="innerUnion">
    <xs:union memberTypes="colorEnum rgbPattern"/>
  </xs:simpleType>
  <xs:simpleType name="customString">
    <xs:restriction base="xs:string">
      <xs:pattern value="custom:.*"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="outerUnion">
    <xs:union memberTypes="innerUnion customString"/>
  </xs:simpleType>
  <xs:element name="config">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="color" type="outerUnion"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kPathResolutionAttrsXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="HeaderItemType">
    <xs:simpleContent>
      <xs:extension base="xs:string">
        <xs:attribute name="priority" type="xs:integer" use="required"/>
      </xs:extension>
    </xs:simpleContent>
  </xs:complexType>
  <xs:complexType name="FooterItemType">
    <xs:simpleContent>
      <xs:extension base="xs:string">
        <xs:attribute name="align" type="xs:string" use="required"/>
      </xs:extension>
    </xs:simpleContent>
  </xs:complexType>
  <xs:element name="page">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="header">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="item" type="HeaderItemType" maxOccurs="unbounded"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="footer">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="item" type="FooterItemType" maxOccurs="unbounded"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kTypeElementCollisionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="StringPropertyType">
    <xs:attribute name="key" type="xs:string" use="required"/>
    <xs:attribute name="value" type="xs:string" use="required"/>
  </xs:complexType>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="properties" minOccurs="0">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="string" type="StringPropertyType" maxOccurs="unbounded"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="settings">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string"/>
              <xs:element name="description" type="xs:string" minOccurs="0"/>
              <xs:element name="expression" type="xs:string" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

}  // namespace

// Regression tests for nested union type validation (Bug 5)
TEST_CASE("SchemaValidator - nested union type regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("nested_union", kNestedUnionXsd));

  SECTION("Enum value from inner union accepted") {
    const std::string xml = "<config><color>red</color></config>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_union");
    CHECK(diags.empty());
  }

  SECTION("Pattern value from inner union accepted") {
    const std::string xml = "<config><color>B5D0D0</color></config>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_union");
    CHECK(diags.empty());
  }

  SECTION("Pattern value from outer union member accepted") {
    const std::string xml = "<config><color>custom:myColor</color></config>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_union");
    CHECK(diags.empty());
  }

  SECTION("Invalid value rejected by nested union") {
    const std::string xml = "<config><color>INVALID</color></config>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_union");
    REQUIRE(!diags.empty());
  }

  container.Shutdown();
}

// Regression tests for path-based attribute resolution (Bug 6)
TEST_CASE("SchemaValidator - path-based attribute resolution regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("path_attrs", kPathResolutionAttrsXsd));

  SECTION("Header item with priority attribute is valid") {
    const std::string xml =
      "<page><header><item priority=\"1\">Title</item></header>"
      "<footer><item align=\"center\">Copyright</item></footer></page>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_attrs");
    CHECK(diags.empty());
  }

  SECTION("Header item with wrong attribute name is invalid") {
    const std::string xml =
      "<page><header><item align=\"center\">Title</item></header>"
      "<footer><item align=\"center\">Copyright</item></footer></page>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_attrs");
    REQUIRE(!diags.empty());
  }

  SECTION("Footer item with wrong attribute name is invalid") {
    const std::string xml =
      "<page><header><item priority=\"1\">Title</item></header>"
      "<footer><item priority=\"1\">Copyright</item></footer></page>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_attrs");
    REQUIRE(!diags.empty());
  }

  container.Shutdown();
}

// Regression tests for type/element namespace collision (Bug 9)
TEST_CASE("SchemaValidator - type/element name collision regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("collision", kTypeElementCollisionXsd));

  SECTION("Property element with key/value attributes is valid") {
    const std::string xml =
      "<root><properties><string key=\"foo\" value=\"bar\"/></properties>"
      "<settings><name>Test</name></settings></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "collision");
    CHECK(diags.empty());
  }

  SECTION("Simple string element without key/value is valid — no false positive") {
    const std::string xml =
      "<root><settings><name>MyName</name><description>Some desc</description>"
      "<expression>x + y</expression></settings></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "collision");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Property element missing key attribute is invalid") {
    const std::string xml =
      "<root><properties><string value=\"bar\"/></properties>"
      "<settings><name>Test</name></settings></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "collision");
    REQUIRE(!diags.empty());
    bool mentions_key = false;
    for (auto& d : diags)
      if (d.message.find("key") != std::string::npos)
        mentions_key = true;
    CHECK(mentions_key);
  }

  SECTION("Both property and simple elements in same document") {
    const std::string xml =
      "<root><properties><string key=\"k1\" value=\"v1\"/><string key=\"k2\" value=\"v2\"/></properties>"
      "<settings><name>Name</name><description>Desc</description><expression>a * b</expression></settings></root>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "collision");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  container.Shutdown();
}
