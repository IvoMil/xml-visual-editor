#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>
#include <nlohmann/json.hpp>

using namespace xve;

namespace {

// Mirror of the pre-B.4 nlohmann::json-based serialiser. Kept local to this
// test file so we can assert the B.4 direct-to-string writer emits the SAME
// shape (field names, order, types) for a variety of node constructs.
auto ReferenceToJson(const GridTreeNode& node) -> nlohmann::json {
    nlohmann::json j;
    j["nodeId"] = node.node_id;
    j["name"] = node.name;
    j["type"] = node.node_type;
    j["value"] = node.value;
    j["line"] = node.line;
    j["column"] = node.column;
    j["childCount"] = node.child_count;
    j["isHybridTableCandidate"] = node.is_hybrid_table_candidate;
    j["isTableCandidate"] = node.is_table_candidate;
    j["siblingIndex"] = node.sibling_index;
    j["siblingCount"] = node.sibling_count;
    auto attrs = nlohmann::json::array();
    for (const auto& a : node.attributes) attrs.push_back({{"name", a.name}, {"value", a.value}});
    j["attributes"] = attrs;
    auto children = nlohmann::json::array();
    for (const auto& c : node.children) children.push_back(ReferenceToJson(c));
    j["children"] = children;
    auto pre = nlohmann::json::array();
    for (const auto& c : node.pre_root_comments) pre.push_back(ReferenceToJson(c));
    j["preRootComments"] = pre;
    auto post = nlohmann::json::array();
    for (const auto& c : node.post_root_comments) post.push_back(ReferenceToJson(c));
    j["postRootComments"] = post;
    auto runs = nlohmann::json::array();
    for (const auto& r : node.table_runs) {
        nlohmann::json rj;
        rj["tag"] = r.tag;
        rj["attrUnion"] = r.attr_union;
        rj["childUnion"] = r.child_union;
        runs.push_back(rj);
    }
    j["tableRuns"] = runs;
    return j;
}

void CheckWriterMatchesReference(IGridViewService* grid_service, const std::string& doc_id) {
    auto tree = grid_service->GetTreeData(doc_id);
    REQUIRE(tree.has_value());
    auto expected = ReferenceToJson(*tree);

    std::string actual_str;
    WriteGridTreeJson(actual_str, *tree);
    auto actual = nlohmann::json::parse(actual_str);

    // Byte-for-byte dump match (same key order, same escapes).
    CHECK(actual_str == expected.dump());
    CHECK(actual == expected);
}

}  // namespace

TEST_CASE("GridViewService direct JSON writer matches nlohmann reference",
          "[grid_view][json_writer]") {
    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();

    SECTION("element with attributes") {
        auto id = doc_service->OpenDocumentFromString(
            R"(<root id="r1" type="t"><child a="1"/></root>)");
        CheckWriterMatchesReference(grid_service, id);
    }
    SECTION("element with children and repeated names") {
        auto id = doc_service->OpenDocumentFromString(
            "<root><item>a</item><item>b</item><item>c</item></root>");
        CheckWriterMatchesReference(grid_service, id);
    }
    SECTION("element with text value and special chars") {
        auto id = doc_service->OpenDocumentFromString(
            "<root><name>line1\nline2\t\"quoted\"</name></root>");
        CheckWriterMatchesReference(grid_service, id);
    }
    SECTION("table-candidate run with attribute-only leaves") {
        auto id = doc_service->OpenDocumentFromString(
            R"(<root><i n="1"/><i n="2"/><i n="3"/></root>)");
        CheckWriterMatchesReference(grid_service, id);
    }
    SECTION("comment node and pre/post-root comment arrays") {
        auto id = doc_service->OpenDocumentFromString(
            "<?xml version=\"1.0\"?><!--pre--><root><a/><!--mid--><b/></root><!--post-->");
        CheckWriterMatchesReference(grid_service, id);
    }
}
