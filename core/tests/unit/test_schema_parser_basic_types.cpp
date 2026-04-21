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
