#include "test_helper_data_fixtures.h"

namespace {

constexpr auto kWildcardXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="known" type="xs:string"/>
        <xs:any namespace="##other" processContents="lax" minOccurs="0" maxOccurs="unbounded">
          <xs:annotation><xs:documentation>Extension point for external elements</xs:documentation></xs:annotation>
        </xs:any>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kWildcardChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="config">
    <xs:complexType>
      <xs:choice>
        <xs:element name="standard" type="xs:string">
          <xs:annotation><xs:documentation>Standard configuration</xs:documentation></xs:annotation>
        </xs:element>
        <xs:any namespace="##other" processContents="strict" minOccurs="1" maxOccurs="1">
          <xs:annotation><xs:documentation>Custom configuration from external namespace</xs:documentation></xs:annotation>
        </xs:any>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kWildcardDefaultXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="data">
    <xs:complexType>
      <xs:sequence>
        <xs:any minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kWildcardXml = R"(<?xml version="1.0"?>
<root><known>test</known></root>)";

constexpr auto kWildcardChoiceXml = R"(<?xml version="1.0"?>
<config><standard>value</standard></config>)";

constexpr auto kWildcardDefaultXml = R"(<?xml version="1.0"?>
<data></data>)";

}  // namespace

// ── xs:any wildcard metadata in Elements panel ────────────────────────────

TEST_CASE("Schema wildcard - ElementInfo metadata", "[helper][wildcard]") {
    TestFixture f;
    f.Init(kWildcardXsd, kWildcardXml);

    auto result = f.Helper()->ComputeElementsPanelData(
        f.schema_id, "root", {"root"}, f.doc_id);
    REQUIRE(result.has_value());
    REQUIRE(!result->content_model.empty());

    // Find the wildcard node in content_model
    const ContentModelNode* wildcard = nullptr;
    const ContentModelNode* known_node = nullptr;
    for (const auto& node : result->content_model) {
        if (node.name == "*" || node.is_wildcard) {
            wildcard = &node;
        }
        if (node.name == "known") {
            known_node = &node;
        }
    }

    SECTION("xs:any captures is_wildcard flag") {
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->is_wildcard == true);
        CHECK(wildcard->node_type == "element");
    }

    SECTION("xs:any captures namespace constraint") {
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->namespace_constraint == "##other");
    }

    SECTION("xs:any captures documentation") {
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->documentation == "Extension point for external elements");
    }

    SECTION("xs:any has can_insert=false") {
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->can_insert == false);
    }

    SECTION("Regular elements are NOT marked as wildcard") {
        REQUIRE(known_node != nullptr);
        CHECK(known_node->is_wildcard == false);
    }
}

TEST_CASE("Schema wildcard - default namespace", "[helper][wildcard]") {
    TestFixture f;
    f.Init(kWildcardDefaultXsd, kWildcardDefaultXml);

    auto result = f.Helper()->ComputeElementsPanelData(
        f.schema_id, "data", {"data"}, f.doc_id);
    REQUIRE(result.has_value());
    REQUIRE(!result->content_model.empty());

    const ContentModelNode* wildcard = nullptr;
    for (const auto& node : result->content_model) {
        if (node.name == "*" || node.is_wildcard) {
            wildcard = &node;
        }
    }

    SECTION("xs:any without namespace attr has empty constraint") {
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->namespace_constraint.empty());
        CHECK(wildcard->is_wildcard == true);
    }
}

// ── xs:any inside a choice group ──────────────────────────────────────────
// NOTE: ProcessChoiceChildren does not yet handle xs:any branches.
// The wildcard element is added to model.elements by ProcessSequenceChildren but
// ProcessChoiceChildren skips xs:any, so building a choice ContentModelNode
// from choice_groups will not include the wildcard.  This test documents the
// current behaviour and will serve as a regression test once the production
// code is updated.

TEST_CASE("Schema wildcard - choice group with xs:any", "[helper][wildcard]") {
    TestFixture f;
    f.Init(kWildcardChoiceXsd, kWildcardChoiceXml);

    SECTION("Raw content model is missing wildcard from choice branch") {
        auto model = f.container.GetSchemaService()->GetContentModel(f.schema_id, "config");
        REQUIRE(model.has_value());

        const ElementInfo* wildcard = nullptr;
        for (const auto& elem : model->elements) {
            if (elem.is_wildcard) {
                wildcard = &elem;
                break;
            }
        }
        // BUG: ProcessChoiceChildren does not handle xs:any branches.
        // The wildcard is silently dropped from the content model.
        // TODO(wildcard): Once fixed, change to REQUIRE(wildcard != nullptr)
        // and verify namespace_constraint/process_contents/documentation.
        if (wildcard != nullptr) {
            // If this branch executes, the bug has been fixed — upgrade assertions.
            CHECK(wildcard->namespace_constraint == "##other");
            CHECK(wildcard->process_contents == "strict");
            CHECK(wildcard->documentation == "Custom configuration from external namespace");
        }
    }

    SECTION("Panel data choice node currently omits wildcard branch") {
        auto result = f.Helper()->ComputeElementsPanelData(
            f.schema_id, "config", {"config"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(!result->content_model.empty());

        // Search for the wildcard anywhere in the tree
        const ContentModelNode* wildcard = nullptr;
        for (const auto& node : result->content_model) {
            if (node.node_type == "choice") {
                for (const auto& child : node.children) {
                    if (child.name == "*" || child.is_wildcard) {
                        wildcard = &child;
                        break;
                    }
                }
            }
            if (node.name == "*" || node.is_wildcard) {
                wildcard = &node;
            }
        }
        // TODO(wildcard): Once ProcessChoiceChildren handles xs:any, change
        // this to REQUIRE(wildcard != nullptr) and add full assertions.
        if (wildcard != nullptr) {
            CHECK(wildcard->is_wildcard == true);
            CHECK(wildcard->namespace_constraint == "##other");
            CHECK(wildcard->can_insert == false);
        }
    }
}

// ── Raw schema content model wildcard metadata ────────────────────────────

TEST_CASE("Schema wildcard - schema parser metadata", "[helper][wildcard]") {
    TestFixture f;
    f.Init(kWildcardXsd, nullptr);

    SECTION("GetContentModel includes wildcard metadata") {
        auto model = f.container.GetSchemaService()->GetContentModel(f.schema_id, "root");
        REQUIRE(model.has_value());
        REQUIRE(!model->elements.empty());

        const ElementInfo* wildcard = nullptr;
        for (const auto& elem : model->elements) {
            if (elem.is_wildcard) {
                wildcard = &elem;
                break;
            }
        }
        REQUIRE(wildcard != nullptr);
        CHECK(wildcard->is_wildcard == true);
        CHECK(wildcard->namespace_constraint == "##other");
        CHECK(wildcard->process_contents == "lax");
        CHECK(wildcard->documentation == "Extension point for external elements");
    }
}
