#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/helper_data_service_impl.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <map>
#include <string>
#include <vector>

#include "helper_data_navigation.h"

namespace xve {
namespace {

using helper_nav::NavigateToElement;

// Compute 0-based line/column for a byte offset in a string.
void ComputeLineColumn(const std::string& text, size_t offset, int& line, int& col) {
    line = 0;
    col = 0;
    for (size_t i = 0; i < offset && i < text.size(); ++i) {
        if (text[i] == '\n') {
            ++line;
            col = 0;
        } else {
            ++col;
        }
    }
}

constexpr const char* kMarkerAttr = "__xve_ins_marker__";
constexpr const char* kMarkerVal = "1";

// Find the inserted element's position using the marker attribute, strip it, and populate result.
void FindInsertedPosition(InsertElementResult& result) {
    const std::string marker = std::string(" ") + kMarkerAttr + "=\"" + kMarkerVal + "\"";
    size_t marker_pos = result.new_content.find(marker);
    if (marker_pos == std::string::npos)
        return;

    // Remove marker from serialized output.
    result.new_content.erase(marker_pos, marker.size());

    // Find the '<' that starts this element's tag (scan backwards).
    size_t tag_start = result.new_content.rfind('<', marker_pos);
    if (tag_start != std::string::npos) {
        ComputeLineColumn(result.new_content, tag_start, result.inserted_line, result.inserted_column);
    }
}

}  // namespace

auto HelperDataServiceImpl::InsertElement(const std::string& doc_id,
                                          const std::string& schema_id,
                                          const std::vector<std::string>& parent_path,
                                          const std::string& element_name,
                                          int cursor_line) -> InsertElementResult {
    if (doc_id.empty() || parent_path.empty()) {
        return {};
    }

    auto* doc = document_service_->GetDocument(doc_id);
    if (!doc) {
        return {};
    }

    auto parent = NavigateToElement(doc, parent_path);
    if (!parent) {
        return {};
    }

    Element new_node;

    std::optional<ContentModelInfo> model;
    if (!parent_path.empty()) {
        std::string resolved_type = schema_service_->ResolveElementTypeByPath(schema_id, parent_path);
        if (!resolved_type.empty()) {
            model = schema_service_->GetContentModelByType(schema_id, resolved_type);
        }
    }
    if (!model) {
        model = schema_service_->GetContentModel(schema_id, parent.Name());
    }
    if (!model || model->elements.empty()) {
        new_node = parent.AppendChild(element_name);
    } else {
        // Build schema order map: element name -> position index.
        std::map<std::string, int> schema_order;
        for (int i = 0; i < static_cast<int>(model->elements.size()); ++i) {
            if (schema_order.find(model->elements[i].name) == schema_order.end()) {
                schema_order[model->elements[i].name] = i;
            }
        }

        auto order_it = schema_order.find(element_name);
        if (order_it == schema_order.end()) {
            new_node = parent.AppendChild(element_name);
        } else {
            // Collect same-name siblings for cursor-aware positioning.
            std::vector<Element> same_name_siblings;
            for (const auto& child : parent.Children()) {
                if (child.Name() == element_name) {
                    same_name_siblings.push_back(child);
                }
            }

            if (cursor_line >= 0 && !same_name_siblings.empty()) {
                // Cursor-aware insertion among same-name siblings.
                // Use marker technique to find line numbers of existing siblings.
                std::vector<int> sibling_lines;
                for (auto& sib : same_name_siblings) {
                    sib.PugiNode().append_attribute(kMarkerAttr) = kMarkerVal;
                    std::string marked = doc->ToString(true);
                    std::string marker_str = std::string(kMarkerAttr) + "=\"" + kMarkerVal + "\"";
                    auto pos = marked.find(marker_str);
                    int line = 0;
                    for (size_t i = 0; i < pos && i < marked.size(); ++i) {
                        if (marked[i] == '\n') line++;
                    }
                    sibling_lines.push_back(line);
                    sib.PugiNode().remove_attribute(kMarkerAttr);
                }

                Element insert_ref;
                bool insert_before_ref = false;

                if (cursor_line <= sibling_lines.front()) {
                    insert_ref = same_name_siblings.front();
                    insert_before_ref = true;
                } else if (cursor_line >= sibling_lines.back()) {
                    insert_ref = same_name_siblings.back();
                    insert_before_ref = false;
                } else {
                    for (size_t i = 0; i + 1 < sibling_lines.size(); ++i) {
                        if (cursor_line >= sibling_lines[i] && cursor_line < sibling_lines[i + 1]) {
                            insert_ref = same_name_siblings[i];
                            insert_before_ref = false;
                            break;
                        }
                    }
                }

                if (insert_ref) {
                    if (insert_before_ref) {
                        new_node = parent.InsertChildBefore(element_name, insert_ref);
                    } else {
                        new_node = parent.InsertChildAfter(element_name, insert_ref);
                    }
                } else {
                    new_node = parent.AppendChild(element_name);
                }
            } else {
                // Default schema-order insertion.
                int new_idx = order_it->second;
                Element insert_after;
                for (const auto& child : parent.Children()) {
                    auto child_it = schema_order.find(child.Name());
                    if (child_it != schema_order.end() && child_it->second <= new_idx) {
                        insert_after = child;
                    }
                }

                if (insert_after) {
                    new_node = parent.InsertChildAfter(element_name, insert_after);
                } else {
                    auto first = parent.FirstChild();
                    if (first) {
                        new_node = parent.InsertChildBefore(element_name, first);
                    } else {
                        new_node = parent.AppendChild(element_name);
                    }
                }
            }
        }
    }

    if (!new_node) {
        return {};
    }

    // Add temporary marker attribute to locate the element after serialization.
    new_node.SetAttribute(kMarkerAttr, kMarkerVal);

    InsertElementResult result;
    result.success = true;
    result.new_content = doc->ToString(true, "    ", true);

    FindInsertedPosition(result);

    // Remove marker from the live DOM (clean up).
    new_node.RemoveAttribute(kMarkerAttr);

    return result;
}

}  // namespace xve
