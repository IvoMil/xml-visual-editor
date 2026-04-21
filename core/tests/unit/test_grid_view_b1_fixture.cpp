// Engine integration tests against resources/sample_files/grid_b1_hybrid_tables.xml.
//
// Validates is_hybrid_table_candidate and is_table_candidate on every
// section in the fixture: pure scalar, one-chevron, all-chevron, nested
// hybrid, differing attrs (reject), differing children (reject), single
// child (reject), and multi-run (per-run candidacy).

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

TEST_CASE("GridViewService hybrid candidacy on multi-section fixture file",
          "[grid_view][hybrid_candidacy][fixture]") {
    auto fixture = xve::test::FindFixture("resources/sample_files/grid_b1_hybrid_tables.xml");
    if (fixture.empty()) {
        WARN("grid_b1_hybrid_tables.xml fixture not found — skipping "
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

    const auto* pureScalar = FindChildByName(*tree, "pureScalar");
    const auto* oneChevron = FindChildByName(*tree, "oneChevron");
    const auto* allChevron = FindChildByName(*tree, "allChevron");
    const auto* nestedHybrid = FindChildByName(*tree, "nestedHybrid");
    const auto* diffAttrs = FindChildByName(*tree, "diffAttrs");
    const auto* diffChildren = FindChildByName(*tree, "diffChildren");
    const auto* singleChild = FindChildByName(*tree, "singleChild");
    const auto* multiRun = FindChildByName(*tree, "multiRun");
    REQUIRE(pureScalar != nullptr);
    REQUIRE(oneChevron != nullptr);
    REQUIRE(allChevron != nullptr);
    REQUIRE(nestedHybrid != nullptr);
    REQUIRE(diffAttrs != nullptr);
    REQUIRE(diffChildren != nullptr);
    REQUIRE(singleChild != nullptr);
    REQUIRE(multiRun != nullptr);

    SECTION("pure scalar run is both table and hybrid candidate") {
        CHECK(pureScalar->is_table_candidate == true);
        CHECK(pureScalar->is_hybrid_table_candidate == true);
        REQUIRE(pureScalar->children.size() == 3);
        for (const auto& row : pureScalar->children) {
            CHECK(row.is_hybrid_table_candidate == true);
            CHECK(row.sibling_count == 3);
        }
    }

    SECTION("one chevron-bearing column qualifies as hybrid but not pure") {
        CHECK(oneChevron->is_table_candidate == false);
        CHECK(oneChevron->is_hybrid_table_candidate == true);
        REQUIRE(oneChevron->children.size() == 3);
        for (const auto& item : oneChevron->children) {
            CHECK(item.is_hybrid_table_candidate == true);
            CHECK(item.is_table_candidate == false);
            CHECK(item.sibling_count == 3);
        }
    }

    SECTION("all chevron-bearing columns qualify as hybrid but not pure") {
        CHECK(allChevron->is_table_candidate == false);
        CHECK(allChevron->is_hybrid_table_candidate == true);
        REQUIRE(allChevron->children.size() == 3);
        for (const auto& entry : allChevron->children) {
            CHECK(entry.is_hybrid_table_candidate == true);
            CHECK(entry.is_table_candidate == false);
        }
    }

    SECTION("nested hybrid flags both outer and inner runs independently") {
        CHECK(nestedHybrid->is_hybrid_table_candidate == true);
        REQUIRE(nestedHybrid->children.size() == 3);
        // Outer <item> run union: attrs {id, kind}, children {name, meta}.
        REQUIRE(nestedHybrid->table_runs.size() == 1);
        CHECK(nestedHybrid->table_runs[0].tag == "item");
        CHECK(nestedHybrid->table_runs[0].attr_union == std::vector<std::string>{"id", "kind"});
        CHECK(nestedHybrid->table_runs[0].child_union == std::vector<std::string>{"name", "meta"});
        for (const auto& outer : nestedHybrid->children) {
            CHECK(outer.is_hybrid_table_candidate == true);
            const auto* meta = FindChildByName(outer, "meta");
            REQUIRE(meta != nullptr);
            // Inner <sub> run inside meta qualifies independently.
            CHECK(meta->is_hybrid_table_candidate == true);
            REQUIRE(meta->children.size() == 2);
            for (const auto& sub : meta->children) {
                CHECK(sub.is_hybrid_table_candidate == true);
            }
        }
    }

    SECTION("differing attribute sets qualify as a union-shape hybrid candidate") {
        CHECK(diffAttrs->is_table_candidate == false);
        CHECK(diffAttrs->is_hybrid_table_candidate == true);
        for (const auto& item : diffAttrs->children) {
            if (item.node_type == "element") {
                CHECK(item.is_hybrid_table_candidate == true);
            }
        }
        REQUIRE(diffAttrs->table_runs.size() == 1);
        CHECK(diffAttrs->table_runs[0].tag == "item");
        // Items 1-3 carry {id, kind}; item 2 also carries `priority`. First-seen
        // order: id, kind (from item 1), priority (from item 2).
        CHECK(diffAttrs->table_runs[0].attr_union == std::vector<std::string>{"id", "kind", "priority"});
        CHECK(diffAttrs->table_runs[0].child_union == std::vector<std::string>{"name", "nested"});
    }

    SECTION("differing element-child sets qualify as a union-shape hybrid candidate") {
        CHECK(diffChildren->is_table_candidate == false);
        CHECK(diffChildren->is_hybrid_table_candidate == true);
        for (const auto& item : diffChildren->children) {
            if (item.node_type == "element") {
                CHECK(item.is_hybrid_table_candidate == true);
            }
        }
        REQUIRE(diffChildren->table_runs.size() == 1);
        CHECK(diffChildren->table_runs[0].tag == "item");
        CHECK(diffChildren->table_runs[0].attr_union == std::vector<std::string>{"id"});
        // First-seen child order: name, nested (items 1-3), extra (item 3 only).
        CHECK(diffChildren->table_runs[0].child_union == std::vector<std::string>{"name", "nested", "extra"});
    }

    SECTION("single child does not form a run") {
        CHECK(singleChild->is_table_candidate == false);
        CHECK(singleChild->is_hybrid_table_candidate == false);
        CHECK(singleChild->table_runs.empty());
        REQUIRE(singleChild->children.size() == 1);
        CHECK(singleChild->children[0].is_hybrid_table_candidate == false);
        CHECK(singleChild->children[0].sibling_count == 1);
    }

    SECTION("multiple runs of different tags qualify per-run independently") {
        // multiRun has 2 alpha + 2 beta children. Each pair forms its own run.
        CHECK(multiRun->is_hybrid_table_candidate == true);
        std::size_t alpha_count = 0;
        std::size_t beta_count = 0;
        for (const auto& child : multiRun->children) {
            if (child.name == "alpha") {
                CHECK(child.is_hybrid_table_candidate == true);
                CHECK(child.sibling_count == 2);
                ++alpha_count;
            } else if (child.name == "beta") {
                CHECK(child.is_hybrid_table_candidate == true);
                CHECK(child.sibling_count == 2);
                ++beta_count;
            }
        }
        CHECK(alpha_count == 2);
        CHECK(beta_count == 2);
        // Two run entries: alpha run first (document order), then beta run.
        REQUIRE(multiRun->table_runs.size() == 2);
        CHECK(multiRun->table_runs[0].tag == "alpha");
        CHECK(multiRun->table_runs[0].attr_union == std::vector<std::string>{"id", "color"});
        CHECK(multiRun->table_runs[0].child_union == std::vector<std::string>{"data"});
        CHECK(multiRun->table_runs[1].tag == "beta");
        CHECK(multiRun->table_runs[1].attr_union == std::vector<std::string>{"id", "size"});
        CHECK(multiRun->table_runs[1].child_union == std::vector<std::string>{"info"});
    }
}
