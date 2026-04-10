#include "xmlvisualeditor/services/schema_service_impl.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

using namespace xve;

TEST_CASE("SchemaServiceImpl - load/unload and queries", "[schema_service]") {
    SchemaServiceImpl svc;
    const std::string id = "test_schema";

    constexpr auto kSimpleXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="child" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

    SECTION("Load schema from string") {
        bool ok = svc.LoadSchemaFromString(id, kSimpleXsd);
        REQUIRE(ok);
        CHECK(svc.IsSchemaLoaded(id));
        auto ids = svc.GetLoadedSchemaIds();
        REQUIRE(!ids.empty());
        CHECK(std::find(ids.begin(), ids.end(), id) != ids.end());

        auto roots = svc.GetRootElements(id);
        REQUIRE(roots.size() == 1);
        CHECK(roots[0] == "root");

        auto info = svc.GetElementInfo(id, "root");
        REQUIRE(info.has_value());

        auto children = svc.GetAllowedChildren(id, "root");
        REQUIRE(children.size() == 1);
        CHECK(children[0] == "child");

        // Unload
        CHECK(svc.UnloadSchema(id));
        CHECK(!svc.IsSchemaLoaded(id));
    }

    SECTION("Query non-existent schema") {
        auto roots = svc.GetRootElements("nope");
        CHECK(roots.empty());
        auto info = svc.GetElementInfo("nope", "x");
        CHECK(!info.has_value());
    }

    SECTION("LoadSchemaFromFile with missing file returns false") {
        bool ok = svc.LoadSchemaFromFile("f1", "this_file_should_not_exist_12345.xsd");
        CHECK(!ok);
    }

    SECTION("DetectSchemaFromXml") {
        const std::string xml_with_schema = R"(<?xml version="1.0"?>
<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="my-schema.xsd">
</root>)";

        auto detected = svc.DetectSchemaFromXml(xml_with_schema);
        REQUIRE(detected.has_value());
        CHECK(detected.value() == "my-schema.xsd");

        const std::string xml_without = "<root></root>";
        auto none = svc.DetectSchemaFromXml(xml_without);
        CHECK(!none.has_value());
    }
}
