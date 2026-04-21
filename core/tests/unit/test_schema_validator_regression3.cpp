// Regression tests for Bug A: maxOccurs="unbounded" choice groups with group refs.
// Tests the fix for orphaned choice_groups_occurrences when ProcessChoiceChildren
// merges choice_groups from group ref branches that contain sequences with inner choices.

#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <string>

using namespace xve;

namespace {

// 1. Simple: choice maxOccurs="unbounded" inside a sequence.
constexpr const char* kSimpleUnboundedChoiceInSeqXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="header" type="xs:string" minOccurs="0"/>
        <xs:choice maxOccurs="unbounded">
          <xs:element name="node" type="xs:string"/>
          <xs:element name="nodes" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// 2. FEWS-like: group refs (including a choice-group) BEFORE choice unbounded.
constexpr const char* kFewsLikeGroupRefsBeforeChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="runOptionsGroup">
    <xs:sequence>
      <xs:element name="runOption" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:group>
  <xs:group name="LocalRunOptionsChoice">
    <xs:choice>
      <xs:element name="localOption1" type="xs:string"/>
      <xs:element name="localOption2" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="connectivityGroup">
    <xs:sequence>
      <xs:element name="connectivity" type="xs:string" minOccurs="0"/>
    </xs:sequence>
  </xs:group>
  <xs:complexType name="NodesComplexType">
    <xs:sequence>
      <xs:element name="showModifiers" type="xs:boolean" default="false" minOccurs="0"/>
      <xs:group ref="runOptionsGroup" minOccurs="0"/>
      <xs:group ref="LocalRunOptionsChoice" minOccurs="0"/>
      <xs:element name="showButton" type="xs:boolean" default="false" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="node" type="xs:string"/>
        <xs:element name="nodes" type="xs:string"/>
        <xs:element name="groupId" type="xs:string"/>
      </xs:choice>
      <xs:group ref="connectivityGroup" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="container" type="NodesComplexType"/>
</xs:schema>
)";

// 3. Bug trigger: group ref as a choice BRANCH where the group is a sequence with inner choice.
// This is the exact pattern that causes orphaned choice_groups_occurrences.
constexpr const char* kGroupRefSeqWithChoiceInChoiceBranchXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="SeqWithInnerChoice">
    <xs:sequence>
      <xs:element name="innerElem" type="xs:string"/>
      <xs:choice>
        <xs:element name="innerA" type="xs:string"/>
        <xs:element name="innerB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:group>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:choice maxOccurs="unbounded">
          <xs:group ref="SeqWithInnerChoice"/>
          <xs:element name="node" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

// 4. Full FEWS pattern with group ref before unbounded choice + group ref AS choice branch.
constexpr const char* kFullFewsPatternXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="OptionsChoice">
    <xs:choice>
      <xs:element name="optA" type="xs:string"/>
      <xs:element name="optB" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="SeqWithChoice">
    <xs:sequence>
      <xs:element name="seqFirst" type="xs:string"/>
      <xs:choice>
        <xs:element name="seqChoiceA" type="xs:string"/>
        <xs:element name="seqChoiceB" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:group>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:group ref="OptionsChoice" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:group ref="SeqWithChoice"/>
        <xs:element name="node" type="xs:string"/>
        <xs:element name="item" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="container" type="ContainerType"/>
</xs:schema>
)";

// 5. Enumeration pattern: single-element unbounded choice (parameters.xsd style).
constexpr const char* kEnumerationUnboundedChoiceXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="ParamGroup">
    <xs:choice>
      <xs:element name="paramA" type="xs:string"/>
      <xs:element name="paramB" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="EnumerationsType">
    <xs:sequence>
      <xs:group ref="ParamGroup" minOccurs="0"/>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="enumeration" type="xs:string"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="enumerations" type="EnumerationsType"/>
</xs:schema>
)";

}  // namespace

// ============================================================================
// Test 1: Simple choice unbounded in sequence — baseline
// ============================================================================

TEST_CASE("SchemaValidator - unbounded choice in sequence accepts repeated children without false positive", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kSimpleUnboundedChoiceInSeqXsd));

    SECTION("many node elements valid") {
        std::string xml = "<root>";
        for (int i = 0; i < 10; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-1] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("mixed elements valid") {
        const std::string xml = "<root><node>a</node><nodes>b</nodes><node>c</node><nodes>d</nodes></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        CHECK(diags.empty());
    }

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModel("test", "root");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    container.Shutdown();
}

// ============================================================================
// Test 2: FEWS-like group refs before unbounded choice
// ============================================================================

TEST_CASE("SchemaValidator - group refs preceding unbounded choice do not cap element count", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kFewsLikeGroupRefsBeforeChoiceXsd));

    SECTION("many node elements NOT flagged as too-many") {
        std::string xml = "<container>";
        for (int i = 0; i < 5; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-2] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("many nodes elements NOT flagged") {
        std::string xml = "<container>";
        for (int i = 0; i < 14; ++i)
            xml += "<nodes>n" + std::to_string(i) + "</nodes>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-2] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModelByType("test", "NodesComplexType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
        // Verify the unbounded choice group has kUnbounded max
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

// ============================================================================
// Test 3: Bug trigger — group ref (sequence with inner choice) as choice branch
// ============================================================================

TEST_CASE("SchemaValidator - group ref containing sequence-with-choice as a choice branch resolves content model correctly", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kGroupRefSeqWithChoiceInChoiceBranchXsd));

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModel("test", "root");
        REQUIRE(cm.has_value());
        INFO("choice_groups.size()=" << cm->choice_groups.size()
                                     << " occurrences.size()=" << cm->choice_groups_occurrences.size());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    SECTION("many node elements valid in unbounded choice") {
        std::string xml = "<root>";
        for (int i = 0; i < 10; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-3] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("group ref branch elements also valid") {
        const std::string xml = "<root><innerElem>x</innerElem><innerA>y</innerA></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-3] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// ============================================================================
// Test 4: Full FEWS pattern — group refs + group ref as choice branch
// ============================================================================

TEST_CASE("SchemaValidator - full FEWS pattern with group ref before and inside unbounded choice accepts all valid children", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kFullFewsPatternXsd));

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModelByType("test", "ContainerType");
        REQUIRE(cm.has_value());
        INFO("choice_groups.size()=" << cm->choice_groups.size()
                                     << " occurrences.size()=" << cm->choice_groups_occurrences.size());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    SECTION("many node elements NOT flagged as too-many") {
        std::string xml = "<container>";
        for (int i = 0; i < 10; ++i)
            xml += "<node>n" + std::to_string(i) + "</node>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-4] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("many item elements NOT flagged as too-many") {
        std::string xml = "<container>";
        for (int i = 0; i < 8; ++i)
            xml += "<item>i" + std::to_string(i) + "</item>";
        xml += "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-4] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("mixed elements including group ref branch valid") {
        const std::string xml =
            "<container>"
            "<seqFirst>s</seqFirst><seqChoiceA>a</seqChoiceA>"
            "<node>n1</node><item>i1</item><node>n2</node>"
            "</container>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-4] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}

// ============================================================================
// Test 5: Enumeration pattern — unbounded choice after group ref
// ============================================================================

TEST_CASE("SchemaValidator - enumeration elements after group ref under unbounded choice are all accepted without false positive", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    CHECK(schema_service->LoadSchemaFromString("test", kEnumerationUnboundedChoiceXsd));

    SECTION("many enumeration elements NOT flagged") {
        std::string xml = "<enumerations>";
        for (int i = 0; i < 9; ++i)
            xml += "<enumeration>e" + std::to_string(i) + "</enumeration>";
        xml += "</enumerations>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-5] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    SECTION("choice_groups and occurrences in sync") {
        auto cm = schema_service->GetContentModelByType("test", "EnumerationsType");
        REQUIRE(cm.has_value());
        CHECK(cm->choice_groups.size() == cm->choice_groups_occurrences.size());
    }

    container.Shutdown();
}

// ============================================================================
// Negative tests — legitimate violations still caught
// ============================================================================

TEST_CASE("SchemaValidator - genuine maxOccurs violations are still detected when element count truly exceeds the limit", "[schema][validator][bugA]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);

    constexpr const char* xsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="single" type="xs:string" maxOccurs="1"/>
        <xs:choice maxOccurs="unbounded">
          <xs:element name="multi" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

    CHECK(schema_service->LoadSchemaFromString("test", xsd));

    SECTION("two instances of maxOccurs=1 element produces diagnostic") {
        const std::string xml = "<root><single>a</single><single>b</single><multi>m</multi></root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        bool found = false;
        for (auto& d : diags) {
            if (d.message.find("single") != std::string::npos && d.message.find("Too many") != std::string::npos) {
                found = true;
            }
        }
        CHECK(found);
    }

    SECTION("many multi elements are still valid (unbounded choice)") {
        std::string xml = "<root><single>a</single>";
        for (int i = 0; i < 20; ++i)
            xml += "<multi>m" + std::to_string(i) + "</multi>";
        xml += "</root>";
        auto diags = SchemaValidator::Validate(xml, *schema_service, "test");
        if (!diags.empty()) {
            for (auto& d : diags)
                std::cerr << "[BugA-neg] " << d.message << std::endl;
        }
        CHECK(diags.empty());
    }

    container.Shutdown();
}
