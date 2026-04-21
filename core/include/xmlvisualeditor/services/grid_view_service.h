#pragma once

#include <optional>
#include <string>
#include <vector>

namespace xve {

struct GridNodeAttribute {
    std::string name;
    std::string value;
};

// Per-run union-shape descriptor. Present on the PARENT of a hybrid-qualified
// run; one entry per distinct-tag run under that parent, ordered by the
// document order in which each run is first encountered.
struct GridTableRunUnion {
    std::string tag;                        // element name shared by the run
    std::vector<std::string> attr_union;    // attribute names, first-seen order, deduped
    std::vector<std::string> child_union;   // element-child names, first-seen order, deduped
};

struct GridTreeNode {
    std::string node_id;    // XPath-like path, e.g. "/root/child[1]"
    std::string name;       // element name (empty for comment nodes)
    std::string node_type;  // "element" or "comment"
    std::string value;      // text content (direct text), or comment body
    int line = 0;           // 0-based line number
    int column = 0;         // 0-based column number
    int child_count = 0;    // number of direct child elements (excludes comments)
    // True if this node has at least one CONTIGUOUS run of >=2 same-name element
    // children that qualifies as a (pure, scalar-only) table region. With
    // table-region splitting on comments / interleaved tags, a parent may
    // contain multiple independent runs.
    bool is_table_candidate = false;
    // True if this node has at least one CONTIGUOUS run of >=2 same-name
    // element children that qualifies as a hybrid-table candidate. ANY
    // same-tag run of size >=2 qualifies; shape equality is not required.
    // Pure table runs imply hybrid (is_table_candidate true =>
    // is_hybrid_table_candidate true).
    bool is_hybrid_table_candidate = false;
    // Position within this child's CONTIGUOUS same-name run (run = consecutive
    // siblings with the same element name, with no comment / different-tag /
    // text node between them). Singletons get index=1, count=1.
    int sibling_index = 1;
    int sibling_count = 1;
    std::vector<GridNodeAttribute> attributes;
    std::vector<GridTreeNode> children;
    // One entry per hybrid-qualified same-tag run under THIS node. Empty
    // when this node has no qualifying run. Order mirrors the document
    // order in which each run is first encountered among this node's
    // children.
    std::vector<GridTableRunUnion> table_runs;
    // Document-scope sibling comments of the root element. Populated only on the
    // top-level GridTreeNode returned by IGridViewService::GetTreeData; empty on
    // every nested node. Each entry is a node with node_type=="comment".
    // See docs/designs/DESIGN_GRID_ALIGNMENT.md (Document-level comments).
    std::vector<GridTreeNode> pre_root_comments;
    std::vector<GridTreeNode> post_root_comments;
};

class IGridViewService {
public:
    virtual ~IGridViewService() = default;
    virtual auto GetTreeData(const std::string& doc_id) -> std::optional<GridTreeNode> = 0;
    // Direct-to-string serialisation. Returns the pre-serialised JSON body
    // (the "result" field content for gridView.getTreeData). Shape is
    // byte-identical to GridTreeNodeToJson(*GetTreeData(doc_id)).dump().
    virtual auto GetTreeDataJson(const std::string& doc_id) -> std::optional<std::string> = 0;
};

// Free-function helper (testable in isolation): write a GridTreeNode into `out`
// as JSON using the same shape as the JSON-RPC gridView.getTreeData response.
void WriteGridTreeJson(std::string& out, const GridTreeNode& node);

}  // namespace xve
