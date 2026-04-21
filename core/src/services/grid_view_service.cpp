#include "xmlvisualeditor/services/grid_view_service_impl.h"

#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>
#include <algorithm>

namespace xve {

// --- Phase B.4 diagnostic instrumentation (temporary) ---------------------
// Set env var XVE_GRID_PROFILE=1 to enable per-call timing output on stderr.
namespace {
bool ProfilingEnabled() {
    static const bool v = [] {
        const char* e = std::getenv("XVE_GRID_PROFILE");
        return e && *e && *e != '0';
    }();
    return v;
}
thread_local std::size_t g_getpath_calls = 0;
thread_local std::size_t g_nodes_built = 0;
}  // namespace
// -------------------------------------------------------------------------

GridViewServiceImpl::GridViewServiceImpl(IDocumentService* document_service)
    : document_service_(document_service) {}

namespace {

// Build a "comment" GridTreeNode for a pugixml comment node. parent_path is the
// node_id prefix (e.g. parent's node_id); index is the 1-based ordinal of this
// comment among its sibling comments under that parent (used to keep node_ids
// unique).
auto BuildCommentNode(pugi::xml_node comment, const std::string& parent_path, int index) -> GridTreeNode {
    GridTreeNode c;
    c.node_type = "comment";
    c.value = comment.value();
    c.node_id = parent_path + "/#comment[" + std::to_string(index) + "]";
    c.line = static_cast<int>(comment.offset_debug());
    c.column = 0;
    c.child_count = 0;
    return c;
}

// Returns true if `child` (an element GridTreeNode that already has its
// .children populated) qualifies as a "simple leaf" under the Issue F rule:
// none of its element children have element grandchildren of their own.
auto IsSimpleLeafForTableRow(const GridTreeNode& child) -> bool {
    for (const auto& grand : child.children) {
        if (grand.node_type != "element") continue;
        for (const auto& gg : grand.children) {
            if (gg.node_type == "element") return false;
        }
    }
    return true;
}

// Walk a contiguous run of element children [start, end) in `out_children` and
// decide whether the run qualifies as either a pure (scalar-only) or a hybrid
// (any same-tag run of size >= 2) table region. Pure implies hybrid. If the
// run qualifies as hybrid, set sibling_index / sibling_count on each member
// and mark is_hybrid_table_candidate on each member; additionally, if the run
// is pure, mark is_table_candidate on each member. When the run qualifies,
// populate `out_union` with the union of attribute names and element-child
// names observed across the run (first-seen order, deduped). Returns a pair
// {pure_qualified, hybrid_qualified} for the parent.
struct RunClassification {
    bool pure = false;
    bool hybrid = false;
};
auto AssignRunIfTable(std::vector<GridTreeNode>& out_children, std::size_t start, std::size_t end,
                      GridTableRunUnion& out_union) -> RunClassification {
    RunClassification cls;
    const std::size_t size = end - start;
    if (size < 2) return cls;

    // ANY same-tag run of size >= 2 is a hybrid candidate. Shape-equality
    // is not required.
    cls.hybrid = true;

    // Pure: every member is a simple leaf (no attributes, scalar
    // children only). Attributes disqualify pure; element-grandchildren
    // disqualify pure. Pure implies hybrid.
    bool pure = true;
    for (std::size_t i = start; i < end; ++i) {
        if (!IsSimpleLeafForTableRow(out_children[i])) {
            pure = false;
            break;
        }
    }
    cls.pure = pure;

    // Compute first-seen-ordered union of attribute names and element-child
    // names across all members of the run. Linear scan with a small nested
    // de-dup check is fine for realistic column counts.
    out_union.tag = out_children[start].name;
    out_union.attr_union.clear();
    out_union.child_union.clear();
    auto contains = [](const std::vector<std::string>& v, const std::string& s) {
        for (const auto& e : v) {
            if (e == s) return true;
        }
        return false;
    };
    for (std::size_t i = start; i < end; ++i) {
        const auto& member = out_children[i];
        for (const auto& a : member.attributes) {
            if (!contains(out_union.attr_union, a.name)) out_union.attr_union.push_back(a.name);
        }
        for (const auto& c : member.children) {
            if (c.node_type != "element") continue;
            if (!contains(out_union.child_union, c.name)) out_union.child_union.push_back(c.name);
        }
    }

    int run_count = static_cast<int>(size);
    int run_index = 0;
    for (std::size_t i = start; i < end; ++i) {
        out_children[i].sibling_index = ++run_index;
        out_children[i].sibling_count = run_count;
        out_children[i].is_hybrid_table_candidate = true;
    }
    return cls;
}

// Phase B.4: BuildNode no longer calls Element::GetPath() (O(N^2) across the
// tree). Instead, the caller passes the already-resolved node_id for this
// element. Inside, we do a single O(N) pass over children to count element
// name frequencies, then a second pass to build each child's node_id from the
// parent's node_id + name + 1-based index (only when that name has >1
// occurrence, matching Element::GetPath() semantics). The overall cost drops
// from O(depth * siblings^2) to O(total_nodes).
auto BuildNode(pugi::xml_node pugi_node, std::string node_id) -> GridTreeNode {
    GridTreeNode node;
    ++g_nodes_built;
    node.node_id = std::move(node_id);
    node.name = pugi_node.name();
    node.node_type = "element";
    node.line = static_cast<int>(pugi_node.offset_debug());
    node.column = 0;

    for (auto attr = pugi_node.first_attribute(); attr; attr = attr.next_attribute()) {
        node.attributes.push_back({attr.name(), attr.value()});
    }

    // First pass: count element children by name.
    std::unordered_map<std::string_view, int> name_counts;
    for (auto child = pugi_node.first_child(); child; child = child.next_sibling()) {
        if (child.type() == pugi::node_element) {
            ++name_counts[std::string_view(child.name())];
        }
    }

    // Second pass: build children in document order, tracking per-name running
    // 1-based index so we can emit node_id = "<parent>/<name>[<idx>]" only when
    // the name has >1 occurrence (matches Element::GetPath()).
    std::unordered_map<std::string_view, int> name_running;
    bool value_set = false;
    int comment_index = 0;
    int element_child_count = 0;
    for (auto child = pugi_node.first_child(); child; child = child.next_sibling()) {
        switch (child.type()) {
            case pugi::node_pcdata:
                if (!value_set) {
                    node.value = child.value();
                    value_set = true;
                }
                break;
            case pugi::node_element: {
                const char* cname = child.name();
                std::string_view cname_sv(cname);
                int total = name_counts[cname_sv];
                int idx = ++name_running[cname_sv];
                std::string child_node_id;
                child_node_id.reserve(node.node_id.size() + cname_sv.size() + 8);
                child_node_id.append(node.node_id);
                child_node_id.push_back('/');
                child_node_id.append(cname_sv);
                if (total > 1) {
                    child_node_id.push_back('[');
                    child_node_id.append(std::to_string(idx));
                    child_node_id.push_back(']');
                }
                node.children.push_back(BuildNode(child, std::move(child_node_id)));
                ++element_child_count;
                break;
            }
            case pugi::node_comment: {
                ++comment_index;
                node.children.push_back(BuildCommentNode(child, node.node_id, comment_index));
                break;
            }
            default:
                break;
        }
    }
    node.child_count = element_child_count;

    // Group consecutive element children with the same name into runs. A run is
    // broken by ANY non-matching sibling (different element tag, comment, or —
    // since comments are now children — a comment node). For each run of size
    // >= 2 that satisfies the Issue F rule, mark it as a table region by
    // assigning per-member sibling_index / sibling_count. Singleton runs and
    // disqualified runs keep the default (1, 1) so the renderer treats them as
    // ordinary tree rows.
    bool any_table_run = false;
    bool any_hybrid_run = false;
    std::size_t i = 0;
    const std::size_t n = node.children.size();
    while (i < n) {
        if (node.children[i].node_type != "element") {
            ++i;
            continue;
        }
        std::size_t j = i + 1;
        while (j < n && node.children[j].node_type == "element" && node.children[j].name == node.children[i].name) {
            ++j;
        }
        GridTableRunUnion run_union;
        auto cls = AssignRunIfTable(node.children, i, j, run_union);
        if (cls.pure) any_table_run = true;
        if (cls.hybrid) {
            any_hybrid_run = true;
            node.table_runs.push_back(std::move(run_union));
        }
        i = j;
    }
    node.is_table_candidate = any_table_run;
    node.is_hybrid_table_candidate = any_hybrid_run;

    return node;
}

// --- Phase B.4: direct-to-string JSON writer ------------------------------
// Avoids constructing intermediate nlohmann::json objects. Emits exactly the
// same shape and field order as GridTreeNodeToJson in grid_view_handlers.cpp.
void AppendEscapedJsonString(std::string& out, std::string_view s) {
    out.push_back('"');
    for (char ch : s) {
        unsigned char c = static_cast<unsigned char>(ch);
        switch (c) {
            case '"':  out.append("\\\""); break;
            case '\\': out.append("\\\\"); break;
            case '\b': out.append("\\b"); break;
            case '\f': out.append("\\f"); break;
            case '\n': out.append("\\n"); break;
            case '\r': out.append("\\r"); break;
            case '\t': out.append("\\t"); break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out.append(buf);
                } else {
                    // UTF-8 bytes pass through verbatim.
                    out.push_back(static_cast<char>(c));
                }
        }
    }
    out.push_back('"');
}

void AppendInt(std::string& out, int v) {
    char buf[16];
    int n = std::snprintf(buf, sizeof(buf), "%d", v);
    if (n > 0) out.append(buf, static_cast<std::size_t>(n));
}

void WriteAttribute(std::string& out, const GridNodeAttribute& a) {
    out.append("{\"name\":");
    AppendEscapedJsonString(out, a.name);
    out.append(",\"value\":");
    AppendEscapedJsonString(out, a.value);
    out.push_back('}');
}

void WriteNode(std::string& out, const GridTreeNode& n) {
    // Fields are emitted in alphabetical order to match nlohmann::json's
    // default std::map-backed key ordering. This keeps the wire output
    // byte-identical to the previous GridTreeNodeToJson path (which relied on
    // nlohmann's .dump() to sort keys).
    out.append("{\"attributes\":[");
    for (std::size_t i = 0; i < n.attributes.size(); ++i) {
        if (i) out.push_back(',');
        WriteAttribute(out, n.attributes[i]);
    }
    out.append("],\"childCount\":");
    AppendInt(out, n.child_count);
    out.append(",\"children\":[");
    for (std::size_t i = 0; i < n.children.size(); ++i) {
        if (i) out.push_back(',');
        WriteNode(out, n.children[i]);
    }
    out.append("],\"column\":");
    AppendInt(out, n.column);
    out.append(",\"isHybridTableCandidate\":");
    out.append(n.is_hybrid_table_candidate ? "true" : "false");
    out.append(",\"isTableCandidate\":");
    out.append(n.is_table_candidate ? "true" : "false");
    out.append(",\"line\":");
    AppendInt(out, n.line);
    out.append(",\"name\":");
    AppendEscapedJsonString(out, n.name);
    out.append(",\"nodeId\":");
    AppendEscapedJsonString(out, n.node_id);
    out.append(",\"postRootComments\":[");
    for (std::size_t i = 0; i < n.post_root_comments.size(); ++i) {
        if (i) out.push_back(',');
        WriteNode(out, n.post_root_comments[i]);
    }
    out.append("],\"preRootComments\":[");
    for (std::size_t i = 0; i < n.pre_root_comments.size(); ++i) {
        if (i) out.push_back(',');
        WriteNode(out, n.pre_root_comments[i]);
    }
    out.append("],\"siblingCount\":");
    AppendInt(out, n.sibling_count);
    out.append(",\"siblingIndex\":");
    AppendInt(out, n.sibling_index);
    out.append(",\"tableRuns\":[");
    for (std::size_t i = 0; i < n.table_runs.size(); ++i) {
        if (i) out.push_back(',');
        const auto& r = n.table_runs[i];
        out.append("{\"attrUnion\":[");
        for (std::size_t k = 0; k < r.attr_union.size(); ++k) {
            if (k) out.push_back(',');
            AppendEscapedJsonString(out, r.attr_union[k]);
        }
        out.append("],\"childUnion\":[");
        for (std::size_t k = 0; k < r.child_union.size(); ++k) {
            if (k) out.push_back(',');
            AppendEscapedJsonString(out, r.child_union[k]);
        }
        out.append("],\"tag\":");
        AppendEscapedJsonString(out, r.tag);
        out.push_back('}');
    }
    out.append("],\"type\":");
    AppendEscapedJsonString(out, n.node_type);
    out.append(",\"value\":");
    AppendEscapedJsonString(out, n.value);
    out.push_back('}');
}

}  // namespace

void WriteGridTreeJson(std::string& out, const GridTreeNode& node) {
    WriteNode(out, node);
}

auto GridViewServiceImpl::GetTreeData(const std::string& doc_id) -> std::optional<GridTreeNode> {
    const bool prof = ProfilingEnabled();
    auto t0 = std::chrono::steady_clock::now();
    g_getpath_calls = 0;
    g_nodes_built = 0;

    auto* doc = document_service_->GetDocument(doc_id);
    if (!doc) return std::nullopt;

    auto root = doc->Root();
    if (!root) return std::nullopt;

    auto t_lookup = std::chrono::steady_clock::now();
    auto root_pugi = root.PugiNode();
    std::string root_node_id;
    root_node_id.push_back('/');
    root_node_id.append(root_pugi.name());
    auto result = BuildNode(root_pugi, std::move(root_node_id));
    auto t_build = std::chrono::steady_clock::now();

    // Bug 1 — pre/post-root document-scope comments. Walk the pugixml document
    // node's children: anything that is a comment and is NOT inside the root
    // element is a sibling of the root. Split into "before" and "after" buckets
    // by document order relative to the root element. These are returned on the
    // top-level node only; the renderer interleaves them around the root row.
    auto pugi_doc = root_pugi.parent();
    if (pugi_doc) {
        bool seen_root = false;
        int pre_idx = 0;
        int post_idx = 0;
        for (auto child = pugi_doc.first_child(); child; child = child.next_sibling()) {
            if (child == root_pugi) {
                seen_root = true;
                continue;
            }
            if (child.type() != pugi::node_comment) continue;
            if (!seen_root) {
                ++pre_idx;
                result.pre_root_comments.push_back(BuildCommentNode(child, "", pre_idx));
            } else {
                ++post_idx;
                result.post_root_comments.push_back(BuildCommentNode(child, "", post_idx));
            }
        }
    }

    if (prof) {
        auto t_end = std::chrono::steady_clock::now();
        using ms = std::chrono::duration<double, std::milli>;
        std::cerr << "[grid-profile] GetTreeData lookup="
                  << ms(t_lookup - t0).count() << "ms build="
                  << ms(t_build - t_lookup).count() << "ms post="
                  << ms(t_end - t_build).count() << "ms total="
                  << ms(t_end - t0).count() << "ms nodes=" << g_nodes_built
                  << " getpath-calls=" << g_getpath_calls << "\n";
    }

    return result;
}

auto GridViewServiceImpl::GetTreeDataJson(const std::string& doc_id) -> std::optional<std::string> {
    const bool prof = ProfilingEnabled();
    auto t0 = std::chrono::steady_clock::now();

    auto tree = GetTreeData(doc_id);
    auto t_built = std::chrono::steady_clock::now();
    if (!tree) return std::nullopt;

    std::string out;
    out.reserve(1024 * 1024);  // ~1 MiB starting budget; grows as needed.
    WriteGridTreeJson(out, *tree);

    if (prof) {
        auto t_end = std::chrono::steady_clock::now();
        using ms = std::chrono::duration<double, std::milli>;
        std::cerr << "[grid-profile] GetTreeDataJson build="
                  << ms(t_built - t0).count() << "ms serialize="
                  << ms(t_end - t_built).count() << "ms total="
                  << ms(t_end - t0).count() << "ms json-bytes="
                  << out.size() << "\n";
    }

    return out;
}

}  // namespace xve

