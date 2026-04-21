#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kChoiceSatisfactionXsd = R"(
<schema xmlns="http://www.w3.org/2001/XMLSchema"
        xmlns:t="http://test" targetNamespace="http://test"
        elementFormDefault="qualified">
  <group name="CellSizeGroup">
    <sequence>
      <element name="center" type="string"/>
      <choice>
        <element name="cellWidth" type="double"/>
        <element name="columnWidths" type="double" minOccurs="2" maxOccurs="unbounded"/>
      </choice>
      <choice>
        <element name="cellHeight" type="double"/>
        <element name="rowHeights" type="double" minOccurs="2" maxOccurs="unbounded"/>
      </choice>
    </sequence>
  </group>
  <complexType name="GridType">
    <choice>
      <group ref="t:CellSizeGroup"/>
      <element name="corners" type="string"/>
    </choice>
  </complexType>
  <element name="grid" type="t:GridType"/>
</schema>
)";

}  // namespace

// Test 16: Empty <grid/> — missing required top-level choice
TEST_CASE("SchemaValidator - choice satisfaction empty grid missing top-level choice",
          "[schema][validator][choice_satisfaction][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceSatisfactionXsd));

    SECTION("empty grid produces 1 diagnostic for top-level choice") {
        const std::string xml = R"(<grid xmlns="http://test"/>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        REQUIRE(diags.size() == 1);
        CHECK(diags[0].message.find("choice") != std::string::npos);
        CHECK(diags[0].message.find("center") != std::string::npos);
        CHECK(diags[0].message.find("corners") != std::string::npos);
    }

    container.Shutdown();
}

// Test 17: <grid> with <corners> — fully valid (alternate branch)
TEST_CASE("SchemaValidator - choice satisfaction corners branch fully valid",
          "[schema][validator][choice_satisfaction][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceSatisfactionXsd));

    SECTION("corners satisfies top-level choice, no nested choice errors") {
        const std::string xml = R"(<grid xmlns="http://test"><corners>abc</corners></grid>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 18: <grid> with <center> only — missing required nested choices
TEST_CASE("SchemaValidator - choice satisfaction center only missing nested choices",
          "[schema][validator][choice_satisfaction][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceSatisfactionXsd));

    SECTION("center activates sequence branch, 2 diagnostics for nested choices") {
        const std::string xml = R"(<grid xmlns="http://test"><center>abc</center></grid>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        REQUIRE(diags.size() == 2);
        // One diagnostic for [cellWidth, columnWidths], one for [cellHeight, rowHeights]
        bool found_width_choice = false;
        bool found_height_choice = false;
        for (const auto& d : diags) {
            if (d.message.find("cellWidth") != std::string::npos &&
                d.message.find("columnWidths") != std::string::npos) {
                found_width_choice = true;
            }
            if (d.message.find("cellHeight") != std::string::npos &&
                d.message.find("rowHeights") != std::string::npos) {
                found_height_choice = true;
            }
        }
        CHECK(found_width_choice);
        CHECK(found_height_choice);
    }

    container.Shutdown();
}

// Test 19: <grid> with full CellSizeGroup — fully valid
TEST_CASE("SchemaValidator - choice satisfaction full CellSizeGroup valid",
          "[schema][validator][choice_satisfaction][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceSatisfactionXsd));

    SECTION("center + cellWidth + cellHeight is fully valid") {
        const std::string xml =
            R"(<grid xmlns="http://test"><center>abc</center><cellWidth>1.0</cellWidth><cellHeight>2.0</cellHeight></grid>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// Test 20: <grid> with center + cellWidth only — missing second nested choice
TEST_CASE("SchemaValidator - choice satisfaction center cellWidth missing height choice",
          "[schema][validator][choice_satisfaction][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kChoiceSatisfactionXsd));

    SECTION("center + cellWidth but no height choice produces 1 diagnostic") {
        const std::string xml =
            R"(<grid xmlns="http://test"><center>abc</center><cellWidth>1.0</cellWidth></grid>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        REQUIRE(diags.size() == 1);
        CHECK(diags[0].message.find("cellHeight") != std::string::npos);
        CHECK(diags[0].message.find("rowHeights") != std::string::npos);
    }

    container.Shutdown();
}
