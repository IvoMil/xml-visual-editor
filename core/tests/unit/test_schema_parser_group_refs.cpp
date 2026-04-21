#include "xmlvisualeditor/schema/schema_parser.h"
#include "xmlvisualeditor/schema/schema_types.h"

#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace xve;

TEST_CASE("SchemaParser - group ref in sequence", "[schema_parser]") {
    constexpr auto kGroupRefXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="AddressGroup">
    <xs:sequence>
      <xs:element name="street" type="xs:string"/>
      <xs:element name="city" type="xs:string"/>
      <xs:element name="zip" type="xs:string"/>
    </xs:sequence>
  </xs:group>
  <xs:element name="person">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:group ref="AddressGroup"/>
        <xs:element name="phone" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kGroupRefXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto cm = parser.GetContentModel("person");
    REQUIRE(cm.has_value());
    CHECK(cm->model_type == "sequence");

    auto ordered = parser.GetOrderedChildren("person");
    REQUIRE(ordered.size() == 5);
    CHECK(ordered[0].name == "name");
    CHECK(ordered[1].name == "street");
    CHECK(ordered[2].name == "city");
    CHECK(ordered[3].name == "zip");
    CHECK(ordered[4].name == "phone");

    auto allowed = parser.GetAllowedChildren("person");
    CHECK(allowed.size() == 5);
}

TEST_CASE("SchemaParser - group ref with choice", "[schema_parser]") {
    constexpr auto kGroupChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="PaymentGroup">
    <xs:choice>
      <xs:element name="cash" type="xs:decimal"/>
      <xs:element name="card" type="xs:string"/>
      <xs:element name="transfer" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:element name="order">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="item" type="xs:string"/>
        <xs:group ref="PaymentGroup"/>
        <xs:element name="total" type="xs:decimal"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kGroupChoiceXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto cm = parser.GetContentModel("order");
    REQUIRE(cm.has_value());
    CHECK(cm->model_type == "sequence");

    auto ordered = parser.GetOrderedChildren("order");
    REQUIRE(ordered.size() == 5);
    CHECK(ordered[0].name == "item");
    CHECK(ordered[1].name == "cash");
    CHECK(ordered[2].name == "card");
    CHECK(ordered[3].name == "transfer");
    CHECK(ordered[4].name == "total");

    REQUIRE(cm->choice_groups.size() == 1);
    auto grp = cm->choice_groups[0];
    CHECK(grp.size() == 3);

    auto cashInfo = parser.GetElementInfo("cash");
    REQUIRE(cashInfo.has_value());
    CHECK(!cashInfo->choice_path.empty());
}

TEST_CASE("SchemaParser - group ref in type extension", "[schema_parser]") {
    constexpr auto kGroupExtXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="TimeSeriesGroup">
    <xs:choice>
      <xs:element name="timeSeriesSet" type="xs:string"/>
      <xs:element name="timeSeriesRef" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:complexType name="baseVarType">
    <xs:sequence>
      <xs:element name="variableId" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="variableType">
    <xs:complexContent>
      <xs:extension base="baseVarType">
        <xs:sequence>
          <xs:group ref="TimeSeriesGroup"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:element name="variable" type="variableType"/>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kGroupExtXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto cm = parser.GetContentModel("variable");
    REQUIRE(cm.has_value());

    auto ordered = parser.GetOrderedChildren("variable");
    REQUIRE(ordered.size() >= 3);
    CHECK(ordered[0].name == "variableId");

    auto allowed = parser.GetAllowedChildren("variable");
    CHECK(allowed.size() == 3);

    REQUIRE(cm->choice_groups.size() == 1);
    auto grp = cm->choice_groups[0];
    CHECK(grp.size() == 2);
}

// Bug B: group ref with minOccurs="0" maxOccurs="unbounded" inside a choice —
// the referenced elements must inherit the group ref's cardinality.
TEST_CASE("SchemaParser - group ref min/max propagation in choice", "[schema_parser]") {
    constexpr auto kGroupRefMinMaxXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="ObsoleteChoice">
    <xs:choice>
      <xs:element name="obsoleteSet" type="xs:string"/>
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
        <xs:group ref="ObsoleteChoice"/>
        <xs:group ref="AnimatedLayerChoice" minOccurs="0" maxOccurs="unbounded"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="gridPlot" type="GridPlotComplexType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kGroupRefMinMaxXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    // (a) Content model for GridPlotComplexType: dataLayer should have min=0, max=unbounded
    auto cm = parser.GetContentModelByType("GridPlotComplexType");
    REQUIRE(cm.has_value());
    CHECK(cm->model_type == "sequence");

    bool found_data_layer = false;
    bool found_track_layer = false;
    for (const auto& elem : cm->elements) {
        if (elem.name == "dataLayer") {
            found_data_layer = true;
            CHECK(elem.min_occurs == 0);
            CHECK(elem.max_occurs == kUnbounded);
        }
        if (elem.name == "trackLayer") {
            found_track_layer = true;
            CHECK(elem.min_occurs == 0);
            CHECK(elem.max_occurs == kUnbounded);
        }
    }
    CHECK(found_data_layer);
    CHECK(found_track_layer);

    // (b) GetElementInfoByPath: should return content-model values (min=0, max=unbounded)
    auto path_info = parser.GetElementInfoByPath({"root", "gridPlot", "dataLayer"});
    REQUIRE(path_info.has_value());
    CHECK(path_info->min_occurs == 0);
    CHECK(path_info->max_occurs == kUnbounded);

    // (c) GetElementInfo (element_cache_): should also reflect the group ref cardinality
    auto cache_info = parser.GetElementInfo("dataLayer");
    REQUIRE(cache_info.has_value());
    CHECK(cache_info->min_occurs == 0);
    CHECK(cache_info->max_occurs == kUnbounded);
}

// Regression: group ref containing sequence with nested choices was incorrectly
// flattened by ProcessChoiceChildren() instead of being treated as a sequence branch.
TEST_CASE("SchemaParser - group ref with sequence containing nested choices",
          "[schema_parser][compositor][group_ref][regression]") {
    constexpr auto kGroupRefSequenceWithNestedChoicesXsd = R"(
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

    auto res = SchemaParser::ParseString(kGroupRefSequenceWithNestedChoicesXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto model = parser.GetContentModel("grid");
    REQUIRE(model.has_value());

    SECTION("top-level compositor is choice") {
        CHECK(model->model_type == "choice");
    }

    SECTION("all 6 elements are present") {
        CHECK(model->elements.size() == 6);
        std::vector<std::string> names;
        for (const auto& e : model->elements) {
            names.push_back(e.name);
        }
        CHECK(std::find(names.begin(), names.end(), "center") != names.end());
        CHECK(std::find(names.begin(), names.end(), "cellWidth") != names.end());
        CHECK(std::find(names.begin(), names.end(), "columnWidths") != names.end());
        CHECK(std::find(names.begin(), names.end(), "cellHeight") != names.end());
        CHECK(std::find(names.begin(), names.end(), "rowHeights") != names.end());
        CHECK(std::find(names.begin(), names.end(), "corners") != names.end());
    }

    SECTION("choice_groups has 3 groups: top-level + 2 nested") {
        // Top-level choice: sequence branch vs corners
        // Plus 2 nested choices inside CellSizeGroup sequence:
        //   cellWidth/columnWidths and cellHeight/rowHeights
        REQUIRE(model->choice_groups.size() == 3);
        // Verify the top-level choice branch identifiers exist
        bool found_sequence_branch = false;
        bool found_corners_branch = false;
        for (const auto& grp : model->choice_groups) {
            if (std::find(grp.begin(), grp.end(), "center") != grp.end()) {
                found_sequence_branch = true;
            }
            if (std::find(grp.begin(), grp.end(), "corners") != grp.end()) {
                found_corners_branch = true;
            }
        }
        CHECK(found_sequence_branch);
        CHECK(found_corners_branch);
    }

    SECTION("sequence_groups contains the group ref sequence") {
        REQUIRE(model->sequence_groups.size() >= 1);
        // Find the sequence group for the CellSizeGroup ref
        bool found = false;
        for (const auto& sg : model->sequence_groups) {
            if (sg.elements.size() == 5) {
                found = true;
                // Should contain center + 4 choice elements
                std::vector<std::string> sg_names;
                for (const auto& e : sg.elements) {
                    sg_names.push_back(e.name);
                }
                CHECK(std::find(sg_names.begin(), sg_names.end(), "center") != sg_names.end());
                CHECK(std::find(sg_names.begin(), sg_names.end(), "cellWidth") != sg_names.end());
                CHECK(std::find(sg_names.begin(), sg_names.end(), "columnWidths") != sg_names.end());
                CHECK(std::find(sg_names.begin(), sg_names.end(), "cellHeight") != sg_names.end());
                CHECK(std::find(sg_names.begin(), sg_names.end(), "rowHeights") != sg_names.end());
                // All elements in sequence group should share the same choice_path
                CHECK(sg.choice_path == "center");
            }
        }
        CHECK(found);
    }

    SECTION("corners element is NOT in any sequence_group") {
        for (const auto& sg : model->sequence_groups) {
            for (const auto& e : sg.elements) {
                CHECK(e.name != "corners");
            }
        }
    }
}
