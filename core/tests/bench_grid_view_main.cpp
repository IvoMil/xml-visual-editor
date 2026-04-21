// Diagnostic benchmark for gridView.getTreeData performance.
// Usage: xve-bench-grid <path-to-xml>
//
// Measures, for a single file:
//   parse-ms        : Document::ParseFile
//   build-ms        : GridViewService::GetTreeData (pugixml walk + GridTreeNode build)
//   serialize-ms    : GridTreeNodeToJson + dump() (what the handler does before writing stdout)
//   total-ms        : sum
// Also prints node count and serialized JSON size.
//
// Not a Catch2 test. Linked to xve-core. Added in CMakeLists.txt as xve-bench-grid.
// Diagnostic-only; safe to remove once perf is no longer being tracked.

#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <cstddef>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {

using Clock = std::chrono::steady_clock;

auto MillisSince(Clock::time_point t0) -> double {
    auto d = Clock::now() - t0;
    return std::chrono::duration<double, std::milli>(d).count();
}

std::size_t CountNodes(const xve::GridTreeNode& n) {
    std::size_t total = 1;
    for (const auto& c : n.children) total += CountNodes(c);
    for (const auto& c : n.pre_root_comments) total += CountNodes(c);
    for (const auto& c : n.post_root_comments) total += CountNodes(c);
    return total;
}

// Mirror of the serialisation in grid_view_handlers.cpp so we measure the same cost.
nlohmann::json ToJson(const xve::GridTreeNode& node) {
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
    for (const auto& c : node.children) children.push_back(ToJson(c));
    j["children"] = children;

    auto pre = nlohmann::json::array();
    for (const auto& c : node.pre_root_comments) pre.push_back(ToJson(c));
    j["preRootComments"] = pre;

    auto post = nlohmann::json::array();
    for (const auto& c : node.post_root_comments) post.push_back(ToJson(c));
    j["postRootComments"] = post;
    return j;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <path-to-xml> [iterations=1]\n";
        return 2;
    }
    std::string path = argv[1];
    int iterations = argc >= 3 ? std::atoi(argv[2]) : 1;
    if (iterations < 1) iterations = 1;

    // Read file into memory first (so parse-time excludes disk I/O).
    std::ifstream f(path, std::ios::binary);
    if (!f) {
        std::cerr << "ERROR: cannot open " << path << "\n";
        return 1;
    }
    std::ostringstream oss;
    oss << f.rdbuf();
    std::string xml = oss.str();
    std::cerr << "[bench] file=" << path << " bytes=" << xml.size() << "\n";

    xve::ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();

    for (int i = 0; i < iterations; ++i) {
        auto t0 = Clock::now();
        auto doc_id = doc_service->OpenDocumentFromString(xml);
        auto t_parsed = Clock::now();

        auto tree = grid_service->GetTreeData(doc_id);
        auto t_built = Clock::now();

        if (!tree) {
            std::cerr << "ERROR: empty tree\n";
            return 1;
        }

        auto j = ToJson(*tree);
        auto t_jsonified = Clock::now();

        std::string dumped = j.dump();
        auto t_dumped = Clock::now();

        // Direct-to-string writer (replaces ToJson + dump on the hot path).
        // Measured separately so we can compare old vs new cost.
        std::string direct_out;
        direct_out.reserve(dumped.size() + 1024);
        xve::WriteGridTreeJson(direct_out, *tree);
        auto t_direct = Clock::now();

        std::size_t nodes = CountNodes(*tree);
        double parse_ms = std::chrono::duration<double, std::milli>(t_parsed - t0).count();
        double build_ms = std::chrono::duration<double, std::milli>(t_built - t_parsed).count();
        double json_ms = std::chrono::duration<double, std::milli>(t_jsonified - t_built).count();
        double dump_ms = std::chrono::duration<double, std::milli>(t_dumped - t_jsonified).count();
        double direct_ms = std::chrono::duration<double, std::milli>(t_direct - t_dumped).count();
        double total_ms = std::chrono::duration<double, std::milli>(t_direct - t0).count();
        std::cerr << "[bench iter=" << i << "]"
                  << " parse=" << parse_ms << "ms"
                  << " build=" << build_ms << "ms"
                  << " json=" << json_ms << "ms"
                  << " dump=" << dump_ms << "ms"
                  << " direct=" << direct_ms << "ms"
                  << " total=" << total_ms << "ms"
                  << " nodes=" << nodes
                  << " json-bytes=" << dumped.size()
                  << " direct-bytes=" << direct_out.size() << "\n";

        doc_service->CloseDocument(doc_id);
    }
    return 0;
}
