#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kUnboundedChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="container">
    <xs:complexType>
      <xs:choice minOccurs="0" maxOccurs="unbounded">
        <xs:element name="alpha" type="xs:string"/>
        <xs:element name="beta" type="xs:string"/>
        <xs:element name="gamma" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kBoundedChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="container">
    <xs:complexType>
      <xs:choice minOccurs="0" maxOccurs="2">
        <xs:element name="alpha" type="xs:string"/>
        <xs:element name="beta" type="xs:string"/>
        <xs:element name="gamma" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kPathResolutionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="ColorEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="red"/>
      <xs:enumeration value="blue"/>
      <xs:enumeration value="green"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="PositionEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="top"/>
      <xs:enumeration value="bottom"/>
      <xs:enumeration value="left"/>
      <xs:enumeration value="right"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="display">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="header">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="setting" type="ColorEnum"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="footer">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="setting" type="PositionEnum"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kGroupRefChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="itemChoice">
    <xs:choice>
      <xs:element name="apple" type="xs:string"/>
      <xs:element name="banana" type="xs:string"/>
      <xs:element name="cherry" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:element name="basket">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="label" type="xs:string"/>
        <xs:group ref="itemChoice" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

}  // namespace

// Regression tests for choice group cardinality (Bug 2)
TEST_CASE("SchemaValidator - choice group cardinality regressions", "[schema][validator]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("unbounded_choice", kUnboundedChoiceXsd));
  CHECK(schema_service->LoadSchemaFromString("bounded_choice", kBoundedChoiceXsd));

  SECTION("Single choice element is valid") {
    const std::string xml = "<container><alpha>a</alpha></container>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "unbounded_choice");
    CHECK(diags.empty());
  }

  SECTION("Multiple same element in unbounded choice") {
    const std::string xml = "<container><alpha>a</alpha><alpha>b</alpha><alpha>c</alpha></container>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "unbounded_choice");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Mixed elements in unbounded choice") {
    const std::string xml =
      "<container><alpha>a</alpha><beta>b</beta><alpha>c</alpha><gamma>d</gamma></container>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "unbounded_choice");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Many repetitions in unbounded choice") {
    std::string xml = "<container>";
    for (int i = 0; i < 12; ++i)
      xml += "<alpha>v</alpha>";
    xml += "</container>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "unbounded_choice");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Bounded choice rejects excess") {
    const std::string xml = "<container><alpha>1</alpha><alpha>2</alpha><alpha>3</alpha></container>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "bounded_choice");
    REQUIRE(!diags.empty());
  }

  container.Shutdown();
}

// Regression tests for path-based type resolution (Bug 3)
TEST_CASE("SchemaValidator - path-based type resolution regressions", "[schema][validator]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("path_resolution", kPathResolutionXsd));

  SECTION("Same name, different parent — header/setting accepts color") {
    const std::string xml =
      "<display><header><setting>red</setting></header><footer><setting>top</setting></footer></display>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_resolution");
    CHECK(diags.empty());
  }

  SECTION("Wrong type for parent context — header/setting rejects position") {
    const std::string xml =
      "<display><header><setting>top</setting></header><footer><setting>bottom</setting></footer></display>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_resolution");
    REQUIRE(diags.size() == 1);
  }

  SECTION("Wrong type for parent context — footer/setting rejects color") {
    const std::string xml =
      "<display><header><setting>red</setting></header><footer><setting>red</setting></footer></display>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "path_resolution");
    REQUIRE(diags.size() == 1);
  }

  container.Shutdown();
}

// Regression tests for group ref choice cardinality (Bug 4)
TEST_CASE("SchemaValidator - group ref choice in sequence regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("group_ref_choice", kGroupRefChoiceXsd));

  SECTION("Single group ref choice element is valid") {
    const std::string xml = "<basket><label>Fruit</label><apple>Granny Smith</apple></basket>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_choice");
    CHECK(diags.empty());
  }

  SECTION("Multiple group ref choice elements with unbounded maxOccurs") {
    const std::string xml =
      "<basket><label>Fruit</label><apple>a</apple><banana>b</banana><cherry>c</cherry><apple>d</apple></basket>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_choice");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Many repetitions of group ref choice") {
    std::string xml = "<basket><label>Lots</label>";
    for (int i = 0; i < 20; ++i)
      xml += "<banana>b</banana>";
    xml += "</basket>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_choice");
    CHECK(diags.empty());
  }

  container.Shutdown();
}
