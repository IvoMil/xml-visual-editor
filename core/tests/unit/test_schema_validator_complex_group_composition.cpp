#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

constexpr const char* kOptionalSequenceRequiredChildXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ValidationLimitType">
    <xs:sequence minOccurs="0">
      <xs:element name="monthLimit" type="xs:float" minOccurs="12" maxOccurs="12"/>
    </xs:sequence>
    <xs:attribute name="constantLimit" type="xs:float" use="required"/>
  </xs:complexType>
  <xs:element name="validationLimit" type="ValidationLimitType"/>
</xs:schema>
)";

constexpr const char* kExtensionWithChoiceGroupsXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="BaseType">
    <xs:sequence>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="baseItem" type="xs:string"/>
        <xs:element name="baseOther" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ExtendedType">
    <xs:complexContent>
      <xs:extension base="BaseType">
        <xs:sequence>
          <xs:element name="extra" type="xs:string" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:element name="root" type="ExtendedType"/>
</xs:schema>
)";

constexpr const char* kSeqGroupWithChoiceBeforeUnboundedXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="seqGroupWithChoice">
    <xs:sequence>
      <xs:element name="flag" type="xs:boolean" minOccurs="0"/>
      <xs:choice>
        <xs:element name="modeA" type="xs:string"/>
        <xs:element name="modeB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:group>
  <xs:group name="bareChoiceGroup">
    <xs:choice>
      <xs:element name="optX" type="xs:string"/>
      <xs:element name="optY" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="NodesType">
    <xs:sequence>
      <xs:element name="label" type="xs:string" minOccurs="0"/>
      <xs:group ref="seqGroupWithChoice" minOccurs="0"/>
      <xs:group ref="bareChoiceGroup" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="node" type="xs:string"/>
        <xs:element name="nodes" type="xs:string"/>
        <xs:element name="groupId" type="xs:string"/>
      </xs:choice>
      <xs:element name="footer" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="root" type="NodesType"/>
</xs:schema>
)";

constexpr const char* kPostChoiceGroupRefNameCollisionXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="preGroup">
    <xs:choice>
      <xs:element name="optA" type="xs:string"/>
      <xs:element name="optB" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="postGroup">
    <xs:choice>
      <xs:element name="node" type="xs:string"/>
      <xs:element name="extra" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:group ref="preGroup" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="node" type="xs:string"/>
        <xs:element name="nodes" type="xs:string"/>
        <xs:element name="groupId" type="xs:string"/>
      </xs:choice>
      <xs:group ref="postGroup" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="container" type="ContainerType"/>
</xs:schema>
)";

constexpr const char* kFewsLikeRecursiveXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="runOptionsGroup">
    <xs:sequence>
      <xs:element name="optionFlag" type="xs:boolean" minOccurs="0"/>
      <xs:choice>
        <xs:element name="modeA" type="xs:string"/>
        <xs:element name="modeB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:group>
  <xs:group name="localRunOptions">
    <xs:choice>
      <xs:element name="localOptX" type="xs:string"/>
      <xs:element name="localOptY" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="connectivityGroup">
    <xs:choice>
      <xs:element name="node" type="xs:string"/>
      <xs:element name="connection" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="NodesComplexType">
    <xs:sequence>
      <xs:element name="showModifiers" type="xs:boolean" minOccurs="0"/>
      <xs:group ref="runOptionsGroup" minOccurs="0"/>
      <xs:group ref="localRunOptions" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="node" type="xs:string"/>
        <xs:element name="nodes" type="NodesComplexType"/>
        <xs:element name="groupId" type="xs:string"/>
      </xs:choice>
      <xs:group ref="connectivityGroup" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="topLevelNodes" type="NodesComplexType"/>
</xs:schema>
)";

}  // namespace

// Test 11: Optional sequence wrapping required elements — no false positive when absent
TEST_CASE("SchemaValidator - optional sequence minOccurs=0 no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kOptionalSequenceRequiredChildXsd));

    SECTION("no monthLimit with constantLimit attribute is valid") {
        const std::string xml = R"(<validationLimit constantLimit="1.5"/>)";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("12 monthLimit elements is valid") {
        std::string xml = R"(<validationLimit constantLimit="1.5">)";
        for (int i = 0; i < 12; ++i)
            xml += "<monthLimit>" + std::to_string(static_cast<float>(i)) + "</monthLimit>";
        xml += "</validationLimit>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("content model has min_occurs=0") {
        auto cm = schema_service->GetContentModelByType("test", "ValidationLimitType");
        REQUIRE(cm.has_value());
        CHECK(cm->min_occurs == 0);
    }

    container.Shutdown();
}

// Test 12: Extension inherits choice_groups_occurrences from base
TEST_CASE("SchemaValidator - extension inherits choice_groups_occurrences",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kExtensionWithChoiceGroupsXsd));

    SECTION("many baseItem elements valid via inherited unbounded choice") {
        std::string xml = "<root>";
        for (int i = 0; i < 10; ++i)
            xml += "<baseItem>v" + std::to_string(i) + "</baseItem>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("choice_groups_occurrences inherited in extended type") {
        auto cm = schema_service->GetContentModelByType("test", "ExtendedType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
        if (!cm->choice_groups_occurrences.empty()) {
            CHECK(cm->choice_groups_occurrences[0].second == kUnbounded);
        }
    }

    container.Shutdown();
}

// Test 13: Sequence-containing group refs before unbounded choice — no false positive
TEST_CASE("SchemaValidator - seq group refs before unbounded choice no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kSeqGroupWithChoiceBeforeUnboundedXsd));

    SECTION("many node elements valid in unbounded choice after seq group ref") {
        std::string xml = "<root>";
        for (int i = 0; i < 10; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("mixed elements in unbounded choice valid after seq group ref") {
        const std::string xml =
            "<root>"
            "<node>a</node><nodes>b</nodes><groupId>g1</groupId>"
            "<node>c</node><node>d</node><nodes>e</nodes>"
            "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModelByType("test", "NodesType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    container.Shutdown();
}

// Test 14: Post-choice group ref with same element name — unbounded must win
TEST_CASE("SchemaValidator - post-choice group ref name collision unbounded wins",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kPostChoiceGroupRefNameCollisionXsd));

    SECTION("many node elements valid despite post-choice name collision") {
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

    SECTION("mixed unbounded choice elements valid despite name collision") {
        const std::string xml =
            "<container>"
            "<node>a</node><nodes>b</nodes><node>c</node><groupId>g</groupId>"
            "<node>d</node><node>e</node><nodes>f</nodes>"
            "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("validator maps node to unbounded group index") {
        auto cm = schema_service->GetContentModelByType("test", "ContainerType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
        // Find that at least one group containing "node" has kUnbounded
        bool found_unbounded = false;
        for (size_t gi = 0; gi < cm->choice_groups.size(); ++gi) {
            for (const auto& member : cm->choice_groups[gi]) {
                if (member == "node" && gi < cm->choice_groups_occurrences.size() &&
                    cm->choice_groups_occurrences[gi].second == kUnbounded) {
                    found_unbounded = true;
                }
            }
        }
        CHECK(found_unbounded);
    }

    container.Shutdown();
}

// Test 15: FEWS-like recursive type — node/nodes/groupId unbounded despite group refs
TEST_CASE("SchemaValidator - FEWS-like recursive unbounded choice no false positive",
          "[schema][validator][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kFewsLikeRecursiveXsd));

    SECTION("many node elements at top level") {
        std::string xml = "<topLevelNodes>";
        for (int i = 0; i < 5; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</topLevelNodes>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("nested nodes with many node children") {
        std::string xml = "<topLevelNodes><nodes>";
        for (int i = 0; i < 14; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</nodes></topLevelNodes>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("deeply nested recursive structure") {
        const std::string xml =
            "<topLevelNodes>"
            "<nodes><node>a</node><nodes><node>b</node><node>c</node></nodes></nodes>"
            "<node>d</node><groupId>g1</groupId>"
            "</topLevelNodes>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "diag: " << d.message << " @" << d.line << ":" << d.column << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("content model has aligned choice_groups and occurrences") {
        auto cm = schema_service->GetContentModelByType("test", "NodesComplexType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    container.Shutdown();
}
