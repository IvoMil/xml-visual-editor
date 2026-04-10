#include "test_helper_data_fixtures.h"

#include <catch2/catch_test_macros.hpp>

#include <iostream>

using namespace xve;

namespace {

// Regression: Bug A — ApplyChoiceExclusion must propagate active_branch to the
// active sequence child node of a choice, so the webview auto-expands it.
constexpr auto kChoiceSequenceActiveBranchXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="gridDef">
    <xs:complexType>
      <xs:choice>
        <xs:sequence>
          <xs:element name="firstCellCenter" type="xs:double"/>
          <xs:element name="xCellSize" type="xs:double"/>
        </xs:sequence>
        <xs:element name="gridCorners" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

constexpr auto kChoiceSequenceActiveBranchXml = R"(<?xml version="1.0"?>
<gridDef>
  <firstCellCenter>1.0</firstCellCenter>
  <xCellSize>0.5</xCellSize>
</gridDef>
)";

constexpr auto kChoiceSequenceActiveBranchAltXml = R"(<?xml version="1.0"?>
<gridDef>
  <gridCorners>10,20,30,40</gridCorners>
</gridDef>
)";

// Regression: BuildContentModelTree must preserve nested choice groups within
// sequence nodes (group ref with sequence containing nested choices), instead
// of flattening them into the parent sequence.
constexpr auto kNestedChoiceInSequenceXsd = R"(
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

// Regression: same nested choices but inside a top-level SEQUENCE (not choice).
// This exercises the sequence/all path in BuildContentModelTree which had a bug
// where seq_group_rep expansion in elem_to_cg made nested choice detection fail.
constexpr auto kNestedChoiceInTopSequenceXsd = R"(
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
  <complexType name="RegularType">
    <sequence>
      <element name="description" type="string"/>
      <element name="rows" type="int"/>
      <choice>
        <group ref="t:CellSizeGroup"/>
        <element name="corners" type="string"/>
      </choice>
    </sequence>
  </complexType>
  <element name="regular" type="t:RegularType"/>
</schema>
)";

}  // namespace

TEST_CASE("HelperDataService - nested choice groups within sequence preserved in tree",
          "[helper][elements][choice][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    REQUIRE(schema_service->LoadSchemaFromString("test_schema", kNestedChoiceInSequenceXsd));

    auto* helper = container.GetHelperDataService();
    REQUIRE(helper != nullptr);

    // Schema-only mode (no document) — we only care about tree structure.
    auto result = helper->ComputeElementsPanelData("test_schema", "grid", {}, "");
    REQUIRE(result.has_value());

    SECTION("top-level is a choice node with 2 children") {
        // Expected tree:
        //   choice (2 children)
        //     sequence (3 children)
        //     element: corners
        REQUIRE(result->content_model.size() == 1);
        const auto& top_choice = result->content_model[0];
        CHECK(top_choice.node_type == "choice");
        CHECK(top_choice.children.size() == 2);
    }

    SECTION("first child of top choice is a sequence with 3 children") {
        REQUIRE(result->content_model.size() == 1);
        const auto& top_choice = result->content_model[0];
        REQUIRE(top_choice.children.size() >= 1);

        const auto& seq = top_choice.children[0];
        CHECK(seq.node_type == "sequence");
        // 3 children: center (element) + 2 nested choices — NOT 5 flat elements
        CHECK(seq.children.size() == 3);
    }

    SECTION("sequence child 0 is element center") {
        const auto& seq = result->content_model[0].children[0];
        REQUIRE(seq.children.size() >= 1);
        CHECK(seq.children[0].node_type == "element");
        CHECK(seq.children[0].name == "center");
    }

    SECTION("sequence child 1 is choice: cellWidth | columnWidths") {
        const auto& seq = result->content_model[0].children[0];
        REQUIRE(seq.children.size() >= 2);

        const auto& nested_choice1 = seq.children[1];
        CHECK(nested_choice1.node_type == "choice");
        REQUIRE(nested_choice1.children.size() == 2);
        CHECK(nested_choice1.children[0].name == "cellWidth");
        CHECK(nested_choice1.children[1].name == "columnWidths");
    }

    SECTION("sequence child 2 is choice: cellHeight | rowHeights") {
        const auto& seq = result->content_model[0].children[0];
        REQUIRE(seq.children.size() >= 3);

        const auto& nested_choice2 = seq.children[2];
        CHECK(nested_choice2.node_type == "choice");
        REQUIRE(nested_choice2.children.size() == 2);
        CHECK(nested_choice2.children[0].name == "cellHeight");
        CHECK(nested_choice2.children[1].name == "rowHeights");
    }

    SECTION("second child of top choice is element corners") {
        const auto& top_choice = result->content_model[0];
        REQUIRE(top_choice.children.size() >= 2);
        CHECK(top_choice.children[1].node_type == "element");
        CHECK(top_choice.children[1].name == "corners");
    }
}

TEST_CASE("HelperDataService - nested choice in sequence path (top-level sequence)",
          "[helper][elements][choice][regression]") {
    ServiceContainer container;
    container.Initialize();
    auto* schema_service = container.GetSchemaService();
    REQUIRE(schema_service != nullptr);
    REQUIRE(schema_service->LoadSchemaFromString("test_schema", kNestedChoiceInTopSequenceXsd));

    auto* helper = container.GetHelperDataService();
    REQUIRE(helper != nullptr);

    auto result = helper->ComputeElementsPanelData("test_schema", "regular", {}, "");
    REQUIRE(result.has_value());

    SECTION("top-level has 3 children: description, rows, choice") {
        // model_type is "sequence", so tree should be:
        //   element: description
        //   element: rows
        //   choice (2 children)
        //     sequence (3 children: center, choice, choice)
        //     element: corners
        REQUIRE(result->content_model.size() == 3);
        CHECK(result->content_model[0].node_type == "element");
        CHECK(result->content_model[0].name == "description");
        CHECK(result->content_model[1].node_type == "element");
        CHECK(result->content_model[1].name == "rows");
        CHECK(result->content_model[2].node_type == "choice");
    }

    SECTION("choice node has 2 children: sequence and corners") {
        REQUIRE(result->content_model.size() >= 3);
        const auto& choice = result->content_model[2];
        REQUIRE(choice.children.size() == 2);
        CHECK(choice.children[0].node_type == "sequence");
        CHECK(choice.children[1].node_type == "element");
        CHECK(choice.children[1].name == "corners");
    }

    SECTION("sequence within choice has 3 children: center + 2 nested choices") {
        const auto& seq = result->content_model[2].children[0];
        CHECK(seq.node_type == "sequence");
        // Must be 3 (center, choice, choice) — NOT 5 flat elements
        CHECK(seq.children.size() == 3);
    }

    SECTION("sequence child 0 is element center") {
        const auto& seq = result->content_model[2].children[0];
        REQUIRE(seq.children.size() >= 1);
        CHECK(seq.children[0].node_type == "element");
        CHECK(seq.children[0].name == "center");
    }

    SECTION("sequence child 1 is nested choice: cellWidth | columnWidths") {
        const auto& seq = result->content_model[2].children[0];
        REQUIRE(seq.children.size() >= 2);
        const auto& nc1 = seq.children[1];
        CHECK(nc1.node_type == "choice");
        REQUIRE(nc1.children.size() == 2);
        CHECK(nc1.children[0].name == "cellWidth");
        CHECK(nc1.children[1].name == "columnWidths");
    }

    SECTION("sequence child 2 is nested choice: cellHeight | rowHeights") {
        const auto& seq = result->content_model[2].children[0];
        REQUIRE(seq.children.size() >= 3);
        const auto& nc2 = seq.children[2];
        CHECK(nc2.node_type == "choice");
        REQUIRE(nc2.children.size() == 2);
        CHECK(nc2.children[0].name == "cellHeight");
        CHECK(nc2.children[1].name == "rowHeights");
    }
}

// Regression: Bug A — ApplyChoiceExclusion must propagate active_branch to the active
// sequence child node of a choice, so the webview knows to auto-expand it.
TEST_CASE("HelperDataService - sequence node active_branch propagation in choice tree",
          "[helper][elements][choice][regression]") {
    TestFixture f;
    f.Init(kChoiceSequenceActiveBranchXsd, kChoiceSequenceActiveBranchXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "gridDef", {"gridDef"}, f.doc_id);
    REQUIRE(result.has_value());

    SECTION("top-level is a choice node with 2 children") {
        REQUIRE(result->content_model.size() == 1);
        const auto& choice = result->content_model[0];
        CHECK(choice.node_type == "choice");
        CHECK(choice.children.size() == 2);
    }

    SECTION("choice active_branch is set to firstCellCenter (sequence representative)") {
        REQUIRE(result->content_model.size() == 1);
        const auto& choice = result->content_model[0];
        CHECK(choice.active_branch == "firstCellCenter");
    }

    SECTION("sequence child node has active_branch propagated (non-empty)") {
        REQUIRE(result->content_model.size() == 1);
        const auto& choice = result->content_model[0];
        REQUIRE(choice.children.size() >= 1);
        const auto& seq = choice.children[0];
        CHECK(seq.node_type == "sequence");
        // Bug A fix: active_branch MUST be propagated to the sequence node
        CHECK(!seq.active_branch.empty());
    }

    SECTION("sequence children have correct instance counts") {
        REQUIRE(result->content_model.size() == 1);
        const auto& seq = result->content_model[0].children[0];
        REQUIRE(seq.children.size() == 2);
        CHECK(seq.children[0].name == "firstCellCenter");
        CHECK(seq.children[0].current_count == 1);
        CHECK(seq.children[1].name == "xCellSize");
        CHECK(seq.children[1].current_count == 1);
    }

    SECTION("inactive branch (gridCorners) has can_insert=false") {
        REQUIRE(result->content_model.size() == 1);
        const auto& choice = result->content_model[0];
        REQUIRE(choice.children.size() >= 2);
        const auto& alt = choice.children[1];
        CHECK(alt.name == "gridCorners");
        CHECK(alt.can_insert == false);
    }
}

TEST_CASE("HelperDataService - alternate branch active_branch not set for sequence",
          "[helper][elements][choice][regression]") {
    TestFixture f;
    f.Init(kChoiceSequenceActiveBranchXsd, kChoiceSequenceActiveBranchAltXml);

    auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "gridDef", {"gridDef"}, f.doc_id);
    REQUIRE(result.has_value());
    REQUIRE(result->content_model.size() == 1);
    const auto& choice = result->content_model[0];

    SECTION("choice active_branch is set to gridCorners") {
        CHECK(choice.active_branch == "gridCorners");
    }

    SECTION("sequence child node does NOT have active_branch set") {
        REQUIRE(choice.children.size() >= 1);
        const auto& seq = choice.children[0];
        CHECK(seq.node_type == "sequence");
        CHECK(seq.active_branch.empty());
    }
}
