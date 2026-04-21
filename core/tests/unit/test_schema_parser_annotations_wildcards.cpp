#include "xmlvisualeditor/schema/schema_parser.h"
#include "xmlvisualeditor/schema/schema_types.h"

#include <catch2/catch_test_macros.hpp>

using namespace xve;

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
