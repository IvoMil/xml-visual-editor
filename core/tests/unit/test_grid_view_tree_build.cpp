#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>
#include <nlohmann/json.hpp>

using namespace xve;

TEST_CASE("GridViewService - GetTreeData", "[grid_view]") {
    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();
    REQUIRE(doc_service != nullptr);
    REQUIRE(grid_service != nullptr);

    SECTION("returns nullopt for non-existent document") {
        auto result = grid_service->GetTreeData("nonexistent");
        CHECK_FALSE(result.has_value());
    }

    SECTION("simple root element") {
        auto doc_id = doc_service->OpenDocumentFromString("<root/>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
        CHECK(result->node_type == "element");
        CHECK(result->child_count == 0);
        CHECK(result->children.empty());
        CHECK(result->attributes.empty());
        CHECK(result->value.empty());
    }

    SECTION("root with attributes") {
        auto doc_id = doc_service->OpenDocumentFromString(
            R"(<root xmlns="http://example.com" version="1.0"/>)");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
        CHECK(result->attributes.size() == 2);

        // Verify attribute names and values are captured
        bool found_xmlns = false;
        bool found_version = false;
        for (const auto& attr : result->attributes) {
            if (attr.name == "xmlns") {
                CHECK(attr.value == "http://example.com");
                found_xmlns = true;
            }
            if (attr.name == "version") {
                CHECK(attr.value == "1.0");
                found_version = true;
            }
        }
        CHECK(found_xmlns);
        CHECK(found_version);
    }

    SECTION("nested elements with hierarchy") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><child1/><child2><grandchild/></child2></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
        CHECK(result->child_count == 2);
        REQUIRE(result->children.size() == 2);

        // child1: leaf node
        CHECK(result->children[0].name == "child1");
        CHECK(result->children[0].child_count == 0);
        CHECK(result->children[0].children.empty());

        // child2: has one grandchild
        CHECK(result->children[1].name == "child2");
        CHECK(result->children[1].child_count == 1);
        REQUIRE(result->children[1].children.size() == 1);
        CHECK(result->children[1].children[0].name == "grandchild");
        CHECK(result->children[1].children[0].child_count == 0);
    }

    SECTION("text content on leaf element") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><name>John</name></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].name == "name");
        CHECK(result->children[0].value == "John");
    }

    SECTION("mixed content captures only direct text") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>Hello<child>World</child></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        // Root should capture only its own direct text "Hello"
        CHECK(result->value == "Hello");
        CHECK(result->child_count == 1);
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].name == "child");
        CHECK(result->children[0].value == "World");
    }

    SECTION("repeated elements have indexed node_ids") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><item>a</item><item>b</item><item>c</item></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->child_count == 3);
        REQUIRE(result->children.size() == 3);

        // GetPath adds indices only when same-name siblings exist
        CHECK(result->children[0].node_id == "/root/item[1]");
        CHECK(result->children[1].node_id == "/root/item[2]");
        CHECK(result->children[2].node_id == "/root/item[3]");

        CHECK(result->children[0].value == "a");
        CHECK(result->children[1].value == "b");
        CHECK(result->children[2].value == "c");
    }

    SECTION("attributes on nested elements") {
        auto doc_id = doc_service->OpenDocumentFromString(
            R"(<root id="r1"><child id="c1" type="test"><grandchild id="g1"/></child></root>)");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());

        // Root attributes
        REQUIRE(result->attributes.size() == 1);
        CHECK(result->attributes[0].name == "id");
        CHECK(result->attributes[0].value == "r1");

        // Child attributes
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].attributes.size() == 2);
        bool found_id = false, found_type = false;
        for (const auto& attr : result->children[0].attributes) {
            if (attr.name == "id") {
                CHECK(attr.value == "c1");
                found_id = true;
            }
            if (attr.name == "type") {
                CHECK(attr.value == "test");
                found_type = true;
            }
        }
        CHECK(found_id);
        CHECK(found_type);

        // Grandchild attributes
        REQUIRE(result->children[0].children.size() == 1);
        REQUIRE(result->children[0].children[0].attributes.size() == 1);
        CHECK(result->children[0].children[0].attributes[0].name == "id");
        CHECK(result->children[0].children[0].attributes[0].value == "g1");
    }

    SECTION("node_id path without indices for unique siblings") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><alpha><beta/></alpha></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        // No indices needed when siblings have unique names
        CHECK(result->node_id == "/root");
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].node_id == "/root/alpha");
        REQUIRE(result->children[0].children.size() == 1);
        CHECK(result->children[0].children[0].node_id == "/root/alpha/beta");
    }

    SECTION("table candidate detected for repeated children") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><item>A</item><item>B</item><item>C</item></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == true);
        REQUIRE(result->children.size() == 3);
        CHECK(result->children[0].sibling_count == 3);
        CHECK(result->children[1].sibling_count == 3);
        CHECK(result->children[2].sibling_count == 3);
        CHECK(result->children[0].sibling_index == 1);
        CHECK(result->children[1].sibling_index == 2);
        CHECK(result->children[2].sibling_index == 3);
    }

    SECTION("no table candidate when children have unique names") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><alpha/><beta/><gamma/></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        REQUIRE(result->children.size() == 3);
        for (const auto& child : result->children) {
            CHECK(child.sibling_count == 1);
            CHECK(child.sibling_index == 1);
        }
    }

    SECTION("mixed repeated and unique children") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><config/><item>A</item><item>B</item></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == true);
        REQUIRE(result->children.size() == 3);

        // config is unique
        CHECK(result->children[0].name == "config");
        CHECK(result->children[0].sibling_count == 1);
        CHECK(result->children[0].sibling_index == 1);

        // items are repeated
        CHECK(result->children[1].name == "item");
        CHECK(result->children[1].sibling_index == 1);
        CHECK(result->children[1].sibling_count == 2);
        CHECK(result->children[2].name == "item");
        CHECK(result->children[2].sibling_index == 2);
        CHECK(result->children[2].sibling_count == 2);
    }

    SECTION("nested table candidates") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><group><row>1</row><row>2</row></group></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        REQUIRE(result->children.size() == 1);

        const auto& group = result->children[0];
        CHECK(group.name == "group");
        CHECK(group.is_table_candidate == true);
        REQUIRE(group.children.size() == 2);
        CHECK(group.children[0].sibling_index == 1);
        CHECK(group.children[0].sibling_count == 2);
        CHECK(group.children[1].sibling_index == 2);
        CHECK(group.children[1].sibling_count == 2);
    }

    SECTION("single child is not table candidate") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><item>only</item></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].sibling_count == 1);
        CHECK(result->children[0].sibling_index == 1);
    }

    SECTION("repeated children whose grandchildren are leaves still qualify") {
        // Issue F — case that DOES qualify: <row><x>v</x><y>v</y></row> (x, y are leaves).
        // XMLSpy renders this as a 2-column table (x, y). Our grid must do the same.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<row><x>x1</x><y>y1</y></row>"
            "<row><x>x2</x><y>y2</y></row>"
            "</root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == true);
        REQUIRE(result->children.size() == 2);
        CHECK(result->children[0].sibling_count == 2);
        CHECK(result->children[0].sibling_index == 1);
        CHECK(result->children[1].sibling_index == 2);
    }

    SECTION("repeated children with element great-grandchildren disqualify table candidacy") {
        // Issue F — case that does NOT qualify as a PURE table: a repeated child
        // contains an element child that itself has element children, so
        // is_table_candidate stays false. Under Phase 5b3 B.1.a the run still
        // qualifies as HYBRID (same shape), so is_hybrid_table_candidate flips
        // to true and sibling_index/sibling_count are assigned so the renderer
        // can group the region.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<entry><name>a</name><details><kind>x</kind></details></entry>"
            "<entry><name>b</name><details><kind>y</kind></details></entry>"
            "</root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        CHECK(result->is_hybrid_table_candidate == true);
        REQUIRE(result->children.size() == 2);
        CHECK(result->children[0].sibling_index == 1);
        CHECK(result->children[0].sibling_count == 2);
        CHECK(result->children[1].sibling_index == 2);
        CHECK(result->children[1].sibling_count == 2);
        CHECK(result->children[0].is_hybrid_table_candidate == true);
        CHECK(result->children[1].is_hybrid_table_candidate == true);
    }

    SECTION("repeated children with only attributes still qualify as table") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<item id=\"1\" kind=\"a\"/>"
            "<item id=\"2\" kind=\"b\"/>"
            "</root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == true);
    }
}
