// Hybrid-table-candidacy tests.
//
// Rule: ANY same-tag run of >=2 sibling elements is a hybrid candidate.
// The parent exposes a per-run union descriptor (attr_union + child_union)
// via GridTreeNode::table_runs.

#include "test_fixture_helpers.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <cstddef>
#include <string>

using namespace xve;

namespace {

auto FindChildByName(const GridTreeNode& parent, const std::string& name) -> const GridTreeNode* {
    for (const auto& c : parent.children) {
        if (c.node_type == "element" && c.name == name) return &c;
    }
    return nullptr;
}

}  // namespace

TEST_CASE("GridViewService hybrid table candidacy - basic shape rules",
          "[grid_view][hybrid_candidacy]") {
    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();

    SECTION("pure scalar run is both pure and hybrid") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><row><x>1</x><y>2</y></row><row><x>3</x><y>4</y></row></root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_table_candidate == true);
        CHECK(tree->is_hybrid_table_candidate == true);
        REQUIRE(tree->children.size() == 2);
        for (const auto& c : tree->children) {
            CHECK(c.is_hybrid_table_candidate == true);
            CHECK(c.sibling_count == 2);
        }
    }

    SECTION("hybrid run with chevron-bearing cell (same shape)") {
        // Each <item> has the same attribute set {} and same element-child set
        // {meta}. <meta> carries its own sub-element, making each row
        // chevron-bearing — disqualifying pure but allowing hybrid.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<item><meta owner=\"a\"><sub/></meta></item>"
            "<item><meta owner=\"b\"><sub/></meta></item>"
            "<item><meta owner=\"c\"><sub/></meta></item>"
            "</root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_table_candidate == false);
        CHECK(tree->is_hybrid_table_candidate == true);
        REQUIRE(tree->children.size() == 3);
        for (std::size_t i = 0; i < tree->children.size(); ++i) {
            CHECK(tree->children[i].is_hybrid_table_candidate == true);
            CHECK(tree->children[i].is_table_candidate == false);
            CHECK(tree->children[i].sibling_index == static_cast<int>(i) + 1);
            CHECK(tree->children[i].sibling_count == 3);
        }
    }

    SECTION("differing attribute sets qualify as a union-shape hybrid") {
        // Any same-tag run of >=2 qualifies as hybrid; differing
        // attribute sets across members are permitted because the column
        // set is the union across the run. The parent exposes a union
        // descriptor covering {id, flag} across the two members in
        // first-seen order.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<item id=\"1\"><meta><sub/></meta></item>"
            "<item id=\"2\" flag=\"x\"><meta><sub/></meta></item>"
            "</root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_table_candidate == false);
        CHECK(tree->is_hybrid_table_candidate == true);
        REQUIRE(tree->children.size() == 2);
        CHECK(tree->children[0].is_hybrid_table_candidate == true);
        CHECK(tree->children[1].is_hybrid_table_candidate == true);
        REQUIRE(tree->table_runs.size() == 1);
        CHECK(tree->table_runs[0].tag == "item");
        CHECK(tree->table_runs[0].attr_union == std::vector<std::string>{"id", "flag"});
        CHECK(tree->table_runs[0].child_union == std::vector<std::string>{"meta"});
    }

    SECTION("differing child-element sets qualify as a union-shape hybrid") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<item><a/><b><inner/></b></item>"
            "<item><a/><b><inner/></b><c/></item>"
            "</root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_table_candidate == false);
        CHECK(tree->is_hybrid_table_candidate == true);
        REQUIRE(tree->table_runs.size() == 1);
        CHECK(tree->table_runs[0].tag == "item");
        CHECK(tree->table_runs[0].attr_union.empty());
        CHECK(tree->table_runs[0].child_union == std::vector<std::string>{"a", "b", "c"});
    }

    SECTION("single-child run does not qualify") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><item><a/></item></root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_table_candidate == false);
        CHECK(tree->is_hybrid_table_candidate == false);
        REQUIRE(tree->children.size() == 1);
        CHECK(tree->children[0].is_hybrid_table_candidate == false);
        CHECK(tree->children[0].sibling_count == 1);
        CHECK(tree->table_runs.empty());
    }

    SECTION("nested hybrid runs flag both levels independently") {
        // Outer <item> run: each has {meta}. Inner groupHn/<item> run: each
        // inner item has same shape. Both levels must be hybrid.
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root>"
            "<item><meta><inner>"
            "<sub id=\"1\"><k/></sub><sub id=\"2\"><k/></sub>"
            "</inner></meta></item>"
            "<item><meta><inner>"
            "<sub id=\"3\"><k/></sub><sub id=\"4\"><k/></sub>"
            "</inner></meta></item>"
            "</root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        CHECK(tree->is_hybrid_table_candidate == true);
        REQUIRE(tree->children.size() == 2);
        for (const auto& outer : tree->children) {
            CHECK(outer.is_hybrid_table_candidate == true);
            const auto* meta = FindChildByName(outer, "meta");
            REQUIRE(meta != nullptr);
            const auto* inner = FindChildByName(*meta, "inner");
            REQUIRE(inner != nullptr);
            // Inner <sub> run is also hybrid (and pure — scalar-only-ish:
            // each has <k/> as a leaf child).
            CHECK(inner->is_hybrid_table_candidate == true);
            REQUIRE(inner->children.size() == 2);
            for (const auto& s : inner->children) {
                CHECK(s.is_hybrid_table_candidate == true);
            }
        }
    }

    SECTION("parent node propagates hybrid flag") {
        auto doc_id = doc_service->OpenDocumentFromString(
            "<root><group>"
            "<item><meta><x/></meta></item>"
            "<item><meta><x/></meta></item>"
            "</group></root>");
        auto tree = grid_service->GetTreeData(doc_id);
        REQUIRE(tree.has_value());
        // root has a single element child "group" — root itself is NOT hybrid.
        CHECK(tree->is_hybrid_table_candidate == false);
        REQUIRE(tree->children.size() == 1);
        const auto& group = tree->children[0];
        CHECK(group.is_hybrid_table_candidate == true);
        CHECK(group.is_table_candidate == false);
    }
}

TEST_CASE("GridViewService hybrid table candidacy - fixture integration",
          "[grid_view][hybrid_candidacy][fixture]") {
    auto fixture = xve::test::FindFixture("resources/sample_files/grid_expand_collaps_select.xml");
    if (fixture.empty()) {
        WARN("grid_expand_collaps_select.xml fixture not found — skipping "
             "(private-only fixture, excluded from public repo by .publicignore)");
        return;
    }

    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();

    auto xml = xve::test::ReadFileToString(fixture);
    REQUIRE_FALSE(xml.empty());
    auto doc_id = doc_service->OpenDocumentFromString(xml);
    REQUIRE_FALSE(doc_id.empty());

    auto tree = grid_service->GetTreeData(doc_id);
    REQUIRE(tree.has_value());
    REQUIRE(tree->name == "root");

    const auto* groupA = FindChildByName(*tree, "groupA");
    const auto* groupB = FindChildByName(*tree, "groupB");
    const auto* groupC = FindChildByName(*tree, "groupC");
    const auto* groupD = FindChildByName(*tree, "groupD");
    const auto* groupE = FindChildByName(*tree, "groupE");
    const auto* groupF = FindChildByName(*tree, "groupF");
    const auto* groupG = FindChildByName(*tree, "groupG");
    const auto* groupH = FindChildByName(*tree, "groupH");
    REQUIRE(groupA != nullptr);
    REQUIRE(groupB != nullptr);
    REQUIRE(groupC != nullptr);
    REQUIRE(groupD != nullptr);
    REQUIRE(groupE != nullptr);
    REQUIRE(groupF != nullptr);
    REQUIRE(groupG != nullptr);
    REQUIRE(groupH != nullptr);

    // groupA: three <item> siblings with same attrs {id, kind} and same children
    // {name, value, meta}. Chevron-bearing via <meta> (but <meta> has no
    // children here — still non-scalar because? Actually <meta> has only attrs,
    // no element children, so each item IS a simple leaf. This makes groupA
    // BOTH pure and hybrid.)
    CHECK(groupA->is_hybrid_table_candidate == true);

    // groupB: pure scalar table.
    CHECK(groupB->is_table_candidate == true);
    CHECK(groupB->is_hybrid_table_candidate == true);

    // groupC: <series> repeats with chevron-bearing <timeStep> sibling? No,
    // timeStep has only attributes. All cells scalar → pure+hybrid.
    CHECK(groupC->is_hybrid_table_candidate == true);

    // groupD: run split by comments → two singleton runs → not hybrid.
    CHECK(groupD->is_table_candidate == false);
    CHECK(groupD->is_hybrid_table_candidate == false);

    // groupE: single child chain → no run.
    CHECK(groupE->is_hybrid_table_candidate == false);

    // groupF: mixed sibling names → no run.
    CHECK(groupF->is_hybrid_table_candidate == false);

    // groupG: 5 rows each with element-child set {x,y,z,row} (row appearing in
    // different positions) — same shape set. Hybrid, not pure.
    CHECK(groupG->is_hybrid_table_candidate == true);
    CHECK(groupG->is_table_candidate == false);

    // groupH: 3 outer <item> with same shape (chevron-bearing via <meta>).
    CHECK(groupH->is_hybrid_table_candidate == true);

    // Each outer item's <meta> has a groupH1/groupH2/groupH3 child — DIFFERENT
    // names per row. That is fine: the shape check was on the ITEM level
    // (children = {name, value, meta}), not on meta's children. The inner
    // groupHn each contain an item-run which is itself hybrid.
    REQUIRE(groupH->children.size() == 3);
    const char* inner_group_names[] = {"groupH1", "groupH2", "groupH3"};
    for (std::size_t i = 0; i < 3; ++i) {
        const auto& outer_item = groupH->children[i];
        CHECK(outer_item.is_hybrid_table_candidate == true);
        const auto* meta = FindChildByName(outer_item, "meta");
        REQUIRE(meta != nullptr);
        const auto* inner_group = FindChildByName(*meta, inner_group_names[i]);
        REQUIRE(inner_group != nullptr);
        CHECK(inner_group->is_hybrid_table_candidate == true);
        REQUIRE(inner_group->children.size() == 3);
        for (const auto& inner_item : inner_group->children) {
            CHECK(inner_item.is_hybrid_table_candidate == true);
        }
    }
}
