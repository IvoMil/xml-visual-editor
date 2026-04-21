#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

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
TEST_CASE("SchemaValidator - group ref choice-of-sequences with unbounded inner sequences does not cap element count",
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
