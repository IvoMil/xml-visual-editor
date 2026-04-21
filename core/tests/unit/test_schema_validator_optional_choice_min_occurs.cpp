#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kOptionalChoiceMinOccursXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:choice minOccurs="0">
          <xs:element name="optA" type="xs:string" minOccurs="1"/>
          <xs:element name="optB" type="xs:string" minOccurs="1"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kSeqInOptionalChoiceMinOccursXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:choice minOccurs="0">
        <xs:sequence>
          <xs:element name="first" type="xs:string" minOccurs="1"/>
          <xs:element name="second" type="xs:string" minOccurs="1"/>
        </xs:sequence>
        <xs:element name="alt" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr const char* kMultiGroupRefUnboundedChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="optionsGroupA">
    <xs:choice>
      <xs:element name="optA1" type="xs:string"/>
      <xs:element name="optA2" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="optionsGroupB">
    <xs:choice>
      <xs:element name="optB1" type="xs:string"/>
      <xs:element name="optB2" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="header" type="xs:string" minOccurs="0"/>
      <xs:group ref="optionsGroupA" minOccurs="0"/>
      <xs:group ref="optionsGroupB" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="node" type="xs:string"/>
        <xs:element name="nodes" type="xs:string"/>
        <xs:element name="groupId" type="xs:string"/>
      </xs:choice>
      <xs:element name="footer" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="container" type="ContainerType"/>
</xs:schema>
)";

}  // namespace

// Test 8: Elements in optional choice keep their declared min_occurs
TEST_CASE("SchemaParser - elements in optional choice keep min_occurs",
          "[schema][parser][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kOptionalChoiceMinOccursXsd));

    auto cm = schema_service->GetContentModel("test", "root");
    REQUIRE(cm.has_value());

    SECTION("optA has min_occurs == 1") {
        bool found = false;
        for (const auto& el : cm->elements) {
            if (el.name == "optA") {
                CHECK(el.min_occurs == 1);
                found = true;
            }
        }
        CHECK(found);
    }

    SECTION("optB has min_occurs == 1") {
        bool found = false;
        for (const auto& el : cm->elements) {
            if (el.name == "optB") {
                CHECK(el.min_occurs == 1);
                found = true;
            }
        }
        CHECK(found);
    }

    SECTION("choice group itself is optional (minOccurs=0)") {
        REQUIRE(!cm->choice_groups_occurrences.empty());
        CHECK(cm->choice_groups_occurrences[0].first == 0);
    }

    container.Shutdown();
}

// Test 9: Elements in sequence-within-optional-choice keep min_occurs
TEST_CASE("SchemaParser - sequence in optional choice preserves element min_occurs",
          "[schema][parser][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kSeqInOptionalChoiceMinOccursXsd));

    auto cm = schema_service->GetContentModel("test", "root");
    REQUIRE(cm.has_value());

    SECTION("first has min_occurs == 1") {
        bool found = false;
        for (const auto& el : cm->elements) {
            if (el.name == "first") {
                CHECK(el.min_occurs == 1);
                found = true;
            }
        }
        CHECK(found);
    }

    SECTION("second has min_occurs == 1") {
        bool found = false;
        for (const auto& el : cm->elements) {
            if (el.name == "second") {
                CHECK(el.min_occurs == 1);
                found = true;
            }
        }
        CHECK(found);
    }

    SECTION("choice group itself is optional (minOccurs=0)") {
        REQUIRE(!cm->choice_groups_occurrences.empty());
        CHECK(cm->choice_groups_occurrences[0].first == 0);
    }

    container.Shutdown();
}

// Test 10: maxOccurs=unbounded choice after multiple group refs — no false positive
TEST_CASE("SchemaValidator - unbounded choice after group refs no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kMultiGroupRefUnboundedChoiceXsd));

    SECTION("many node elements valid in unbounded choice") {
        std::string xml = "<container>";
        for (int i = 0; i < 14; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("many nodes elements valid in unbounded choice") {
        std::string xml = "<container>";
        for (int i = 0; i < 5; ++i)
            xml += "<nodes>n" + std::to_string(i) + "</nodes>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("mixed elements in unbounded choice valid") {
        const std::string xml =
            "<container>"
            "<node>a</node><nodes>b</nodes><groupId>g1</groupId>"
            "<node>c</node><node>d</node><nodes>e</nodes>"
            "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("choice_groups_occurrences aligned with choice_groups") {
        auto cm = schema_service->GetContentModelByType("test", "ContainerType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
        // Find the group containing 'node' and verify it has unbounded max
        for (size_t gi = 0; gi < cm->choice_groups.size(); ++gi) {
            for (const auto& member : cm->choice_groups[gi]) {
                if (member == "node" || member == "nodes" || member == "groupId") {
                    CHECK(cm->choice_groups_occurrences[gi].second == kUnbounded);
                }
            }
        }
    }

    container.Shutdown();
}
