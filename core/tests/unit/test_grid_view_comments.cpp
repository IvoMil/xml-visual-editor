#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>
#include <nlohmann/json.hpp>

using namespace xve;

TEST_CASE("GridViewService - Comments", "[grid_view][comments]") {
    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();
    REQUIRE(doc_service != nullptr);
    REQUIRE(grid_service != nullptr);

    SECTION("BuildTree emits comment nodes in document order") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><a/><!-- hi --><b/></root>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->children.size() == 3);

        CHECK(result->children[0].node_type == "element");
        CHECK(result->children[0].name == "a");

        CHECK(result->children[1].node_type == "comment");
        CHECK(result->children[1].value == " hi ");
        CHECK(result->children[1].children.empty());
        CHECK(result->children[1].attributes.empty());
        CHECK(result->children[1].child_count == 0);

        CHECK(result->children[2].node_type == "element");
        CHECK(result->children[2].name == "b");

        // child_count counts element children only (2), not the comment.
        CHECK(result->child_count == 2);
    }

    SECTION("Comment between same-tag siblings splits the run into two regions") {
        // Bug 2 — a comment must break a contiguous same-tag run, so the two
        // <item/> children no longer form a single 2-row table; each becomes a
        // singleton (sibling_count == 1) and is_table_candidate is false.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<p><item/><!-- c --><item/></p>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        CHECK(result->child_count == 2);
        REQUIRE(result->children.size() == 3);

        CHECK(result->children[0].node_type == "element");
        CHECK(result->children[0].name == "item");
        CHECK(result->children[0].sibling_index == 1);
        CHECK(result->children[0].sibling_count == 1);

        CHECK(result->children[1].node_type == "comment");

        CHECK(result->children[2].node_type == "element");
        CHECK(result->children[2].name == "item");
        CHECK(result->children[2].sibling_index == 1);
        CHECK(result->children[2].sibling_count == 1);
    }

    SECTION("Comment preserves whitespace inside value") {
        const char* xml =
            "<root><!--   line1\n"
            "  line2   --></root>";
        auto doc_id = doc_service->OpenDocumentFromString(xml);
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->children.size() == 1);
        CHECK(result->children[0].node_type == "comment");
        CHECK(result->children[0].value == "   line1\n  line2   ");
    }
}

TEST_CASE("GridViewService - Document-level comments and table splits",
          "[grid_view][comments][bug1][bug2]") {
    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();
    REQUIRE(doc_service != nullptr);
    REQUIRE(grid_service != nullptr);

    SECTION("Pre-root comment is preserved on the top-level node") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<?xml version=\"1.0\"?><!--hello--><root/>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
        REQUIRE(result->pre_root_comments.size() == 1);
        CHECK(result->pre_root_comments[0].node_type == "comment");
        CHECK(result->pre_root_comments[0].value == "hello");
        CHECK(result->post_root_comments.empty());
    }

    SECTION("Post-root comment is preserved on the top-level node") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<?xml version=\"1.0\"?><root/><!--bye-->");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
        CHECK(result->pre_root_comments.empty());
        REQUIRE(result->post_root_comments.size() == 1);
        CHECK(result->post_root_comments[0].node_type == "comment");
        CHECK(result->post_root_comments[0].value == "bye");
    }

    SECTION("Comment splits same-tag attribute-only run into two table regions") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<p>"
            "<a c=\"1\"/><a c=\"2\"/><a c=\"3\"/>"
            "<!-- mid -->"
            "<a c=\"4\"/><a c=\"5\"/>"
            "</p>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == true);
        REQUIRE(result->children.size() == 6);

        // First run: a[1..3] with sibling_count == 3.
        for (int i = 0; i < 3; ++i) {
            CHECK(result->children[i].node_type == "element");
            CHECK(result->children[i].name == "a");
            CHECK(result->children[i].sibling_index == i + 1);
            CHECK(result->children[i].sibling_count == 3);
        }

        // Comment row in document-order position.
        CHECK(result->children[3].node_type == "comment");
        CHECK(result->children[3].value == " mid ");

        // Second run: a[1..2] with sibling_count == 2 (FRESH run; not 4/5 of 5).
        for (int i = 0; i < 2; ++i) {
            const auto& c = result->children[4 + i];
            CHECK(c.node_type == "element");
            CHECK(c.name == "a");
            CHECK(c.sibling_index == i + 1);
            CHECK(c.sibling_count == 2);
        }
    }

    SECTION("Comment between different-tag siblings is just a sibling (sanity)") {
        // No same-tag run is interrupted; comment sits between <a/> and <b/>.
        // Neither side is a table run (sizes are 1 each), and no run-splitting
        // logic should fire spuriously.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<p><a/><!-- c --><b/></p>");
        REQUIRE(!doc_id.empty());

        auto result = grid_service->GetTreeData(doc_id);
        REQUIRE(result.has_value());
        CHECK(result->is_table_candidate == false);
        CHECK(result->child_count == 2);
        REQUIRE(result->children.size() == 3);
        CHECK(result->children[0].node_type == "element");
        CHECK(result->children[0].name == "a");
        CHECK(result->children[0].sibling_index == 1);
        CHECK(result->children[0].sibling_count == 1);
        CHECK(result->children[1].node_type == "comment");
        CHECK(result->children[2].node_type == "element");
        CHECK(result->children[2].name == "b");
        CHECK(result->children[2].sibling_index == 1);
        CHECK(result->children[2].sibling_count == 1);
    }
}
