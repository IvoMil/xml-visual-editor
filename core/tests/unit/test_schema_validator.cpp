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

// XSDs for regression tests
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

// XSD for Bug 10 Sub-Issue 1: choice with sequence branches
constexpr const char* kChoiceWithSequenceBranchXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="colorSet">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:choice maxOccurs="unbounded">
          <xs:sequence>
            <xs:element name="lowerColor" type="xs:string"/>
            <xs:element name="upperColor" type="xs:string"/>
            <xs:element name="opacity" type="xs:integer" minOccurs="0"/>
          </xs:sequence>
          <xs:element name="namedColor" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// XSD for Bug 10 Sub-Issue 2: group ref with maxOccurs inside choice
constexpr const char* kGroupRefMaxOccursInChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="dataLayerGroup">
    <xs:choice>
      <xs:element name="dataLayer" type="xs:string"/>
      <xs:element name="trackLayer" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:element name="plot">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="title" type="xs:string"/>
        <xs:choice>
          <xs:element name="simpleData" type="xs:string"/>
          <xs:group ref="dataLayerGroup" minOccurs="0" maxOccurs="unbounded"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// XSD for Bug 10 Sub-Issue 3: nested sequence with maxOccurs
constexpr const char* kNestedSequenceMaxOccursXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="report">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="header" type="xs:string"/>
        <xs:sequence minOccurs="0" maxOccurs="unbounded">
          <xs:element name="row" type="xs:string"/>
          <xs:element name="detail" type="xs:string" minOccurs="0"/>
        </xs:sequence>
        <xs:element name="footer" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// XSD for Bug A: group containing choice of sequences with maxOccurs="unbounded" on sequences
// The group ref itself has default maxOccurs=1, but elements inside unbounded sequences should be unbounded.
constexpr const char* kGridPlotGroupChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="ObsoleteTimeSeriesSetChoice">
    <xs:choice>
      <xs:sequence maxOccurs="unbounded">
        <xs:element name="timeSeriesSet" type="xs:string"/>
      </xs:sequence>
      <xs:sequence maxOccurs="unbounded">
        <xs:element name="valueTimeSeriesSet" type="xs:string"/>
        <xs:element name="directionTimeSeriesSet" type="xs:string"/>
      </xs:sequence>
      <xs:sequence maxOccurs="unbounded">
        <xs:element name="uTimeSeriesSet" type="xs:string"/>
        <xs:element name="vTimeSeriesSet" type="xs:string"/>
      </xs:sequence>
      <xs:sequence/>
    </xs:choice>
  </xs:group>
  <xs:group name="AnimatedLayerChoice">
    <xs:choice>
      <xs:element name="dataLayer" type="xs:string"/>
      <xs:element name="trackLayer" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="GridPlotComplexType">
    <xs:sequence>
      <xs:element name="description" type="xs:string" minOccurs="0"/>
      <xs:choice>
        <xs:group ref="ObsoleteTimeSeriesSetChoice"/>
        <xs:group ref="AnimatedLayerChoice" minOccurs="0" maxOccurs="unbounded"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="gridPlotGroup">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="gridPlot" type="GridPlotComplexType" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// Regression: choice with sequence branch where first element is optional (minOccurs=0).
// Bug B: validator must check ALL elements in a sequence group for choice satisfaction,
// not just the first (representative) element.
constexpr const char* kChoiceSequenceOptionalFirstXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="parent">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:choice>
          <xs:sequence>
            <xs:element name="optionalFirst" type="xs:string" minOccurs="0"/>
            <xs:element name="requiredSecond" type="xs:string"/>
          </xs:sequence>
          <xs:element name="altElement" type="xs:string"/>
        </xs:choice>
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

// Regression tests for Bug 10 Sub-Issue 1: sequence-within-choice elements maxOccurs
TEST_CASE("SchemaValidator - choice with sequence branch maxOccurs regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("choice_seq_branch", kChoiceWithSequenceBranchXsd));

  SECTION("Single sequence branch is valid") {
    const std::string xml =
        "<colorSet><name>test</name><lowerColor>red</lowerColor><upperColor>blue</upperColor></colorSet>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_branch");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Multiple sequence branches — unbounded choice") {
    const std::string xml =
        "<colorSet><name>test</name>"
        "<lowerColor>red</lowerColor><upperColor>blue</upperColor><opacity>50</opacity>"
        "<lowerColor>green</lowerColor><upperColor>yellow</upperColor>"
        "</colorSet>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_branch");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Mixed sequence and namedColor branches") {
    const std::string xml =
        "<colorSet><name>test</name>"
        "<namedColor>red</namedColor>"
        "<lowerColor>a</lowerColor><upperColor>b</upperColor>"
        "<namedColor>blue</namedColor>"
        "</colorSet>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_branch");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  container.Shutdown();
}

// Regression tests for Bug 10 Sub-Issue 2: group ref maxOccurs propagation
TEST_CASE("SchemaValidator - group ref maxOccurs in choice regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("group_ref_max", kGroupRefMaxOccursInChoiceXsd));

  SECTION("Single dataLayer is valid") {
    const std::string xml = "<plot><title>P1</title><dataLayer>L1</dataLayer></plot>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Multiple dataLayers and trackLayer — group ref unbounded") {
    const std::string xml =
        "<plot><title>P1</title>"
        "<dataLayer>L1</dataLayer><dataLayer>L2</dataLayer><trackLayer>T1</trackLayer>"
        "</plot>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Many dataLayer repetitions — group ref unbounded") {
    std::string xml = "<plot><title>P1</title>";
    for (int i = 0; i < 20; ++i)
      xml += "<dataLayer>L" + std::to_string(i) + "</dataLayer>";
    xml += "</plot>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "group_ref_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  container.Shutdown();
}

// Regression tests for Bug 10 Sub-Issue 3: nested sequence maxOccurs propagation
TEST_CASE("SchemaValidator - nested sequence maxOccurs regressions", "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("nested_seq_max", kNestedSequenceMaxOccursXsd));

  SECTION("No rows — nested sequence minOccurs=0") {
    const std::string xml = "<report><header>H</header><footer>F</footer></report>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_seq_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Single row is valid") {
    const std::string xml = "<report><header>H</header><row>R1</row><footer>F</footer></report>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_seq_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Many rows with details — nested sequence unbounded") {
    const std::string xml =
        "<report><header>H</header>"
        "<row>R1</row><row>R2</row><row>R3</row><detail>D3</detail>"
        "<footer>F</footer></report>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "nested_seq_max");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  container.Shutdown();
}

// Regression tests for Bug A: group with choice-of-sequences where sequences have maxOccurs="unbounded"
// The group ref has default maxOccurs=1, but the sequences inside the choice are unbounded,
// so elements like timeSeriesSet should be allowed to repeat.
TEST_CASE("SchemaValidator - group choice-of-sequences unbounded regressions (Bug A)",
          "[schema][validator][regression]") {
  ServiceContainer container;
  container.Initialize();
  auto* schema_service = container.GetSchemaService();
  REQUIRE(schema_service != nullptr);

  CHECK(schema_service->LoadSchemaFromString("grid_plot", kGridPlotGroupChoiceXsd));

  SECTION("gridPlot with 7 timeSeriesSet children — no false positive") {
    std::string xml = "<gridPlotGroup><gridPlot>";
    for (int i = 0; i < 7; ++i)
      xml += "<timeSeriesSet>ts" + std::to_string(i) + "</timeSeriesSet>";
    xml += "</gridPlot></gridPlotGroup>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "grid_plot");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("gridPlot with single timeSeriesSet is valid") {
    const std::string xml =
        "<gridPlotGroup><gridPlot><timeSeriesSet>ts1</timeSeriesSet></gridPlot></gridPlotGroup>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "grid_plot");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("gridPlot with multiple dataLayer children (AnimatedLayerChoice branch)") {
    std::string xml = "<gridPlotGroup><gridPlot>";
    for (int i = 0; i < 5; ++i)
      xml += "<dataLayer>dl" + std::to_string(i) + "</dataLayer>";
    xml += "</gridPlot></gridPlotGroup>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "grid_plot");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("gridPlot with description and timeSeriesSet children") {
    std::string xml = "<gridPlotGroup><gridPlot><description>Test plot</description>";
    for (int i = 0; i < 3; ++i)
      xml += "<timeSeriesSet>ts" + std::to_string(i) + "</timeSeriesSet>";
    xml += "</gridPlot></gridPlotGroup>";
    auto diags = SchemaValidator::Validate(xml, *schema_service, "grid_plot");
    if (!diags.empty()) {
      for (auto& d : diags)
        std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
    }
    CHECK(diags.empty());
  }

  SECTION("Content model for timeSeriesSet should have max_occurs = kUnbounded") {
    auto cm = schema_service->GetContentModel("grid_plot", "gridPlot");
    REQUIRE(cm.has_value());
    bool found_tss = false;
    for (const auto& elem : cm->elements) {
      if (elem.name == "timeSeriesSet") {
        found_tss = true;
        CHECK(elem.max_occurs == kUnbounded);
        break;
      }
    }
    CHECK(found_tss);
  }

  container.Shutdown();
}

// Regression: Bug B — choice satisfaction must check ALL elements in a sequence group,
// not just the representative (first element). When the first element of a sequence-in-choice
// is optional (minOccurs=0) and absent, but a later required element IS present, the choice
// should be considered satisfied.
TEST_CASE("SchemaValidator - choice sequence with optional first element", "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("choice_seq_opt", kChoiceSequenceOptionalFirstXsd));

    SECTION("requiredSecond present, optionalFirst absent — choice is satisfied") {
        const std::string xml =
            "<parent><name>test</name><requiredSecond>val</requiredSecond></parent>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_opt");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("both optionalFirst and requiredSecond present — choice is satisfied") {
        const std::string xml =
            "<parent><name>test</name><optionalFirst>a</optionalFirst><requiredSecond>b</requiredSecond></parent>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_opt");
        CHECK(diags.empty());
    }

    SECTION("neither sequence element present — missing choice reported") {
        const std::string xml = "<parent><name>test</name></parent>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_opt");
        REQUIRE(!diags.empty());
        bool mentions_choice = false;
        for (auto& d : diags)
            if (d.message.find("choice") != std::string::npos)
                mentions_choice = true;
        CHECK(mentions_choice);
    }

    SECTION("altElement present — alternate branch satisfies choice") {
        const std::string xml = "<parent><name>test</name><altElement>val</altElement></parent>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "choice_seq_opt");
        CHECK(diags.empty());
    }

    container.Shutdown();
}