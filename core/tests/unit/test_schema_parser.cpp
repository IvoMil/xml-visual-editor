#include "xmlvisualeditor/schema/schema_parser.h"
#include "xmlvisualeditor/schema/schema_types.h"

#include <catch2/catch_test_macros.hpp>

using namespace xve;

TEST_CASE("SchemaParser - simple library schema", "[schema_parser]") {
    constexpr auto kLibraryXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="library">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="book" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="title" type="xs:string"/>
              <xs:element name="author" type="xs:string"/>
              <xs:element name="year" type="xs:integer" minOccurs="0"/>
            </xs:sequence>
            <xs:attribute name="isbn" type="xs:string" use="required"/>
            <xs:attribute name="genre" type="xs:string"/>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kLibraryXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto roots = parser.GetRootElements();
    REQUIRE(!roots.empty());
    CHECK(roots.size() == 1);
    CHECK(roots[0] == "library");

    auto libInfo = parser.GetElementInfo("library");
    REQUIRE(libInfo.has_value());

    auto libContent = parser.GetContentModel("library");
    REQUIRE(libContent.has_value());
    CHECK(libContent->model_type == "sequence");
    auto allowed = parser.GetAllowedChildren("library");
    CHECK(allowed.size() == 1);
    CHECK(allowed[0] == "book");

    auto bookContent = parser.GetContentModel("book");
    REQUIRE(bookContent.has_value());
    CHECK(bookContent->model_type == "sequence");
    auto ordered = parser.GetOrderedChildren("book");
    REQUIRE(ordered.size() == 3);
    CHECK(ordered[0].name == "title");
    CHECK(ordered[1].name == "author");
    CHECK(ordered[2].name == "year");
    CHECK(ordered[2].min_occurs == 0);

    // book maxOccurs should be unbounded
    auto bookInfo = parser.GetElementInfo("book");
    REQUIRE(bookInfo.has_value());
    CHECK(bookInfo->max_occurs == kUnbounded);

    auto attrs = parser.GetAllowedAttributes("book");
    REQUIRE(attrs.contains("isbn"));
    REQUIRE(attrs.contains("genre"));
    CHECK(attrs.at("isbn").required == true);
    CHECK(attrs.at("genre").required == false);
}

TEST_CASE("SchemaParser - choice groups", "[schema_parser]") {
    constexpr auto kChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="payment">
    <xs:complexType>
      <xs:choice>
        <xs:element name="cash" type="xs:decimal"/>
        <xs:element name="card" type="xs:string"/>
        <xs:element name="check" type="xs:string"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kChoiceXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto cm = parser.GetContentModel("payment");
    REQUIRE(cm.has_value());
    CHECK(cm->model_type == "choice");

    // choice_groups should contain the three alternatives
    REQUIRE(cm->choice_groups.size() == 1);
    auto grp = cm->choice_groups[0];
    CHECK(grp.size() == 3);
    CHECK((grp[0] == "cash"));
    CHECK((grp[1] == "card"));
    CHECK((grp[2] == "check"));

    // Each element should have its choice_path set (single-element branches)
    auto cashInfo = parser.GetElementInfo("cash");
    REQUIRE(cashInfo.has_value());
    CHECK(!cashInfo->choice_path.empty());
}

TEST_CASE("SchemaParser - nested sequence within choice", "[schema_parser]") {
    constexpr auto kNestedXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="importConfig">
    <xs:complexType>
      <xs:sequence>
        <xs:choice minOccurs="1">
          <xs:sequence>
            <xs:element name="folder" type="xs:string"/>
            <xs:element name="failedFolder" type="xs:string" minOccurs="0"/>
          </xs:sequence>
          <xs:sequence>
            <xs:element name="jdbcDriverClass" type="xs:string"/>
            <xs:element name="jdbcConnectionString" type="xs:string"/>
          </xs:sequence>
        </xs:choice>
        <xs:element name="idMapId" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kNestedXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto cm = parser.GetContentModel("importConfig");
    REQUIRE(cm.has_value());
    CHECK(cm->model_type == "sequence");

    // Elements include both branches and the trailing idMapId
    auto ordered = parser.GetOrderedChildren("importConfig");
    // Expect at least 5 named elements in ordered list
    REQUIRE(ordered.size() >= 3);

    auto folderInfo = parser.GetElementInfo("folder");
    auto failedInfo = parser.GetElementInfo("failedFolder");
    auto jdbcInfo = parser.GetElementInfo("jdbcDriverClass");
    auto idMapInfo = parser.GetElementInfo("idMapId");
    REQUIRE(folderInfo.has_value());
    REQUIRE(failedInfo.has_value());
    REQUIRE(jdbcInfo.has_value());
    REQUIRE(idMapInfo.has_value());

    CHECK(folderInfo->choice_path == "folder");
    CHECK(failedInfo->choice_path == "folder");
    CHECK(jdbcInfo->choice_path == "jdbcDriverClass");
    CHECK(idMapInfo->choice_path.empty());

    // choice_groups should contain one group mapping branches
    REQUIRE(cm->choice_groups.size() == 1);
    auto group = cm->choice_groups[0];
    CHECK(group.size() >= 2);
}

TEST_CASE("SchemaParser - simple types and enumerations", "[schema_parser]") {
    constexpr auto kTypesXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="GenreType">
    <xs:restriction base="xs:string">
      <xs:enumeration value="fiction"/>
      <xs:enumeration value="non-fiction"/>
      <xs:enumeration value="science"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="YearType">
    <xs:restriction base="xs:integer">
      <xs:minInclusive value="1900"/>
      <xs:maxInclusive value="2100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="item">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="genre" type="GenreType"/>
        <xs:element name="year" type="YearType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kTypesXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto gt = parser.GetTypeInfo("GenreType");
    REQUIRE(gt.has_value());
    CHECK(gt->is_simple == true);
    auto enums = parser.GetEnumerationValues("GenreType");
    REQUIRE(enums.size() == 3);
    CHECK(enums[0] == "fiction");

    auto yt = parser.GetTypeInfo("YearType");
    REQUIRE(yt.has_value());
    REQUIRE(yt->restrictions.min_inclusive.has_value());
    REQUIRE(yt->restrictions.max_inclusive.has_value());
    CHECK(yt->restrictions.min_inclusive.value() == "1900");
    CHECK(yt->restrictions.max_inclusive.value() == "2100");

    auto genreElem = parser.GetElementInfo("genre");
    REQUIRE(genreElem.has_value());
    CHECK(genreElem->type_name == "GenreType");
}

TEST_CASE("SchemaParser - type extension and inheritance", "[schema_parser]") {
    constexpr auto kExtXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="BaseType">
    <xs:sequence>
      <xs:element name="id" type="xs:string"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string"/>
  </xs:complexType>
  <xs:complexType name="ExtendedType">
    <xs:complexContent>
      <xs:extension base="BaseType">
        <xs:sequence>
          <xs:element name="description" type="xs:string"/>
        </xs:sequence>
        <xs:attribute name="category" type="xs:string"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:element name="item" type="ExtendedType"/>
</xs:schema>)";

    auto res = SchemaParser::ParseString(kExtXsd);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();

    auto content = parser.GetContentModel("item");
    REQUIRE(content.has_value());
    // Should include id (from base) and description (from extension) in ordered children
    auto ordered = parser.GetOrderedChildren("item");
    bool has_id = false;
    bool has_desc = false;
    for (const auto& e : ordered) {
        if (e.name == "id")
            has_id = true;
        if (e.name == "description")
            has_desc = true;
    }
    CHECK(has_id);
    CHECK(has_desc);

    auto attrs = parser.GetAllowedAttributes("item");
    CHECK(attrs.contains("version"));
    CHECK(attrs.contains("category"));

    auto et = parser.GetTypeInfo("ExtendedType");
    REQUIRE(et.has_value());
    CHECK(et->base_type == "BaseType");
}

TEST_CASE("SchemaParser - xsd prefix handling and errors", "[schema_parser]") {
    constexpr auto kXsdPrefix = R"(<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:element name="root" type="xsd:string"/>
</xsd:schema>)";

    auto res = SchemaParser::ParseString(kXsdPrefix);
    REQUIRE(res.has_value());
    const auto parser = std::move(res).value();
    auto roots = parser.GetRootElements();
    REQUIRE(roots.size() == 1);
    CHECK(roots[0] == "root");

    // Invalid XML
    constexpr auto kInvalid = "<xs:schema><xs:element></xs:schema>";
    auto bad = SchemaParser::ParseString(kInvalid);
    CHECK(!bad.has_value());

    // Empty input
    auto empty = SchemaParser::ParseString("");
    CHECK(!empty.has_value());

    // ParseFile non-existent should return error
    auto fromfile = SchemaParser::ParseFile("nonexistent_file_for_tests_hopefully.xsd");
    CHECK(!fromfile.has_value());
}

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

TEST_CASE("SchemaParser - exclusive facets", "[schema_parser][facets]") {
    SECTION("minExclusive parsed") {
        constexpr auto kMinExclusiveXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="PositiveDecimal">
    <xs:restriction base="xs:decimal">
      <xs:minExclusive value="0"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="val" type="PositiveDecimal"/>
</xs:schema>)";

        auto res = SchemaParser::ParseString(kMinExclusiveXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto ti = parser.GetTypeInfo("PositiveDecimal");
        REQUIRE(ti.has_value());
        CHECK(ti->is_simple == true);
        REQUIRE(ti->restrictions.min_exclusive.has_value());
        CHECK(ti->restrictions.min_exclusive.value() == "0");
        CHECK_FALSE(ti->restrictions.max_exclusive.has_value());
    }

    SECTION("maxExclusive parsed") {
        constexpr auto kMaxExclusiveXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="SubHundred">
    <xs:restriction base="xs:integer">
      <xs:maxExclusive value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="val" type="SubHundred"/>
</xs:schema>)";

        auto res = SchemaParser::ParseString(kMaxExclusiveXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto ti = parser.GetTypeInfo("SubHundred");
        REQUIRE(ti.has_value());
        CHECK(ti->is_simple == true);
        REQUIRE(ti->restrictions.max_exclusive.has_value());
        CHECK(ti->restrictions.max_exclusive.value() == "100");
        CHECK_FALSE(ti->restrictions.min_exclusive.has_value());
    }

    SECTION("combined exclusive and inclusive facets") {
        constexpr auto kCombinedXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="BoundedDecimal">
    <xs:restriction base="xs:decimal">
      <xs:minExclusive value="-1.5"/>
      <xs:maxInclusive value="99.9"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="val" type="BoundedDecimal"/>
</xs:schema>)";

        auto res = SchemaParser::ParseString(kCombinedXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto ti = parser.GetTypeInfo("BoundedDecimal");
        REQUIRE(ti.has_value());
        CHECK(ti->is_simple == true);
        REQUIRE(ti->restrictions.min_exclusive.has_value());
        CHECK(ti->restrictions.min_exclusive.value() == "-1.5");
        REQUIRE(ti->restrictions.max_inclusive.has_value());
        CHECK(ti->restrictions.max_inclusive.value() == "99.9");
        CHECK_FALSE(ti->restrictions.max_exclusive.has_value());
        CHECK_FALSE(ti->restrictions.min_inclusive.has_value());
    }
}

TEST_CASE("SchemaParser - appinfo extraction", "[schema_parser][appinfo]") {
    SECTION("element with appinfo") {
        constexpr auto kElementAppinfoXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="test" type="string">
    <annotation>
      <appinfo>some app info</appinfo>
    </annotation>
  </element>
</schema>)";

        auto res = SchemaParser::ParseString(kElementAppinfoXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto info = parser.GetElementInfo("test");
        REQUIRE(info.has_value());
        CHECK(info->appinfo == "some app info");
    }

    SECTION("type with appinfo") {
        constexpr auto kTypeAppinfoXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <complexType name="MyType">
    <annotation>
      <appinfo>type metadata</appinfo>
    </annotation>
    <sequence>
      <element name="child" type="string"/>
    </sequence>
  </complexType>
  <element name="root" type="MyType"/>
</schema>)";

        auto res = SchemaParser::ParseString(kTypeAppinfoXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto ti = parser.GetTypeInfo("MyType");
        REQUIRE(ti.has_value());
        CHECK(ti->appinfo == "type metadata");
    }

    SECTION("element with both documentation and appinfo") {
        constexpr auto kBothXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="test" type="string">
    <annotation>
      <documentation>element docs</documentation>
      <appinfo>element appinfo</appinfo>
    </annotation>
  </element>
</schema>)";

        auto res = SchemaParser::ParseString(kBothXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto info = parser.GetElementInfo("test");
        REQUIRE(info.has_value());
        CHECK(info->documentation == "element docs");
        CHECK(info->appinfo == "element appinfo");
    }

    SECTION("element with no annotation has empty appinfo") {
        constexpr auto kNoAnnotationXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="plain" type="string"/>
</schema>)";

        auto res = SchemaParser::ParseString(kNoAnnotationXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto info = parser.GetElementInfo("plain");
        REQUIRE(info.has_value());
        CHECK(info->appinfo.empty());
    }
}

TEST_CASE("SchemaParser - anyAttribute wildcard", "[schema_parser][anyAttribute]") {
    SECTION("anyAttribute parsed from complexType") {
        constexpr auto kAnyAttrXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="root">
    <complexType>
      <sequence>
        <element name="child" type="string"/>
      </sequence>
      <anyAttribute namespace="http://example.com" processContents="skip"/>
    </complexType>
  </element>
</schema>)";

        auto res = SchemaParser::ParseString(kAnyAttrXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto attrs = parser.GetAllowedAttributes("root");
        REQUIRE(attrs.contains("*"));
        const auto& wildcard = attrs.at("*");
        CHECK(wildcard.is_wildcard == true);
        CHECK(wildcard.type_name == "anyAttribute");
        CHECK(wildcard.namespace_constraint == "http://example.com");
        CHECK(wildcard.process_contents == "skip");
    }

    SECTION("anyAttribute alongside normal attributes") {
        constexpr auto kMixedAttrXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="root">
    <complexType>
      <sequence>
        <element name="child" type="string"/>
      </sequence>
      <attribute name="id" type="string" use="required"/>
      <anyAttribute namespace="##any" processContents="lax"/>
    </complexType>
  </element>
</schema>)";

        auto res = SchemaParser::ParseString(kMixedAttrXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto attrs = parser.GetAllowedAttributes("root");
        REQUIRE(attrs.contains("id"));
        CHECK(attrs.at("id").required == true);
        CHECK(attrs.at("id").is_wildcard == false);

        REQUIRE(attrs.contains("*"));
        CHECK(attrs.at("*").is_wildcard == true);
        CHECK(attrs.at("*").namespace_constraint == "##any");
        CHECK(attrs.at("*").process_contents == "lax");
    }

    SECTION("no anyAttribute — no wildcard entry") {
        constexpr auto kNoWildcardXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="root">
    <complexType>
      <sequence>
        <element name="child" type="string"/>
      </sequence>
      <attribute name="id" type="string"/>
      <attribute name="name" type="string"/>
    </complexType>
  </element>
</schema>)";

        auto res = SchemaParser::ParseString(kNoWildcardXsd);
        REQUIRE(res.has_value());
        const auto parser = std::move(res).value();

        auto attrs = parser.GetAllowedAttributes("root");
        CHECK(attrs.contains("id"));
        CHECK(attrs.contains("name"));
        CHECK_FALSE(attrs.contains("*"));
    }
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
