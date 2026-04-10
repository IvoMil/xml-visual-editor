#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/schema/schema_types.h"
#include "xmlvisualeditor/services/helper_data_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <stdexcept>
#include <string>
#include <vector>

namespace xve {
namespace {

// ── JSON serialization helpers ────────────────────────────────────────────

auto ContentModelNodeToJson(const ContentModelNode& node) -> nlohmann::json {
    nlohmann::json j;
    j["name"] = node.name.empty() ? nlohmann::json(nullptr) : nlohmann::json(node.name);
    j["node_type"] = node.node_type;
    j["min_occurs"] = node.min_occurs;
    j["max_occurs"] = (node.max_occurs == kUnbounded) ? nlohmann::json("unbounded") : nlohmann::json(node.max_occurs);
    j["current_count"] = node.current_count;
    j["is_satisfied"] = node.is_satisfied;
    j["is_exhausted"] = node.is_exhausted;
    j["can_insert"] = node.can_insert;
    if (!node.active_branch.empty())
        j["active_branch"] = node.active_branch;
    j["type_name"] = node.type_name;
    j["documentation"] = node.documentation;
    j["is_wildcard"] = node.is_wildcard;
    if (!node.namespace_constraint.empty()) {
        j["namespace_constraint"] = node.namespace_constraint;
    }
    auto children_json = nlohmann::json::array();
    for (const auto& child : node.children) {
        children_json.push_back(ContentModelNodeToJson(child));
    }
    j["children"] = children_json;
    return j;
}

auto AttributeInstanceInfoToJson(const AttributeInstanceInfo& attr) -> nlohmann::json {
    return {{"name", attr.name},
            {"type_name", attr.type_name},
            {"use", attr.use},
            {"is_set", attr.is_set},
            {"current_value", attr.current_value},
            {"default_value", attr.default_value},
            {"fixed_value", attr.fixed_value},
            {"enum_values", attr.enum_values},
            {"documentation", attr.documentation},
            {"is_wildcard", attr.is_wildcard},
            {"namespace_constraint", attr.namespace_constraint},
            {"process_contents", attr.process_contents}};
}

auto CompositorContextToJson(const CompositorContext& ctx) -> nlohmann::json {
    return {{"parent_compositor", ctx.parent_compositor},
            {"parent_element", ctx.parent_element},
            {"preceding_siblings", ctx.preceding_siblings},
            {"following_siblings", ctx.following_siblings},
            {"choice_alternatives", ctx.choice_alternatives}};
}

auto InstanceStateToJson(const InstanceState& state) -> nlohmann::json {
    return {{"current_count", state.current_count},
            {"is_satisfied", state.is_satisfied},
            {"is_exhausted", state.is_exhausted},
            {"can_insert", state.can_insert},
            {"content_complete", state.content_complete},
            {"missing_required", state.missing_required}};
}

// ── Common parameter parsing ──────────────────────────────────────────────

struct HelperParams {
    std::string schema_id;
    std::string element_name;
    std::vector<std::string> element_path;
    std::string doc_id;
};

auto ParseHelperParams(const nlohmann::json& params) -> HelperParams {
    if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
        throw std::invalid_argument("Missing required parameter: schema_id");
    }
    if (!params.contains("element_name") || !params["element_name"].is_string()) {
        throw std::invalid_argument("Missing required parameter: element_name");
    }
    HelperParams p;
    p.schema_id = params["schema_id"].get<std::string>();
    p.element_name = params["element_name"].get<std::string>();
    if (params.contains("element_path") && params["element_path"].is_array()) {
        for (const auto& seg : params["element_path"]) {
            if (seg.is_string())
                p.element_path.push_back(seg.get<std::string>());
        }
    }
    if (params.contains("doc_id") && params["doc_id"].is_string()) {
        p.doc_id = params["doc_id"].get<std::string>();
    }
    return p;
}

}  // namespace

// ── RegisterHelperHandlers ────────────────────────────────────────────────

void RegisterHelperHandlers(JsonRpcServer& server) {
    server.RegisterMethod(
        "helper.getElementsPanelData", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            auto p = ParseHelperParams(params);
            auto result = container.GetHelperDataService()->ComputeElementsPanelData(
                p.schema_id, p.element_name, p.element_path, p.doc_id);
            if (!result) {
                throw std::runtime_error("Failed to compute elements panel data for: " + p.element_name);
            }
            auto content_model_json = nlohmann::json::array();
            for (const auto& node : result->content_model) {
                content_model_json.push_back(ContentModelNodeToJson(node));
            }
            return {{"anchor_element", result->anchor_element},
                    {"anchor_path", result->anchor_path},
                    {"content_model", content_model_json},
                    {"content_complete", result->content_complete},
                    {"missing_required", result->missing_required}};
        });

    server.RegisterMethod(
        "helper.getAttributesPanelData",
        [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            auto p = ParseHelperParams(params);
            auto result = container.GetHelperDataService()->ComputeAttributesPanelData(
                p.schema_id, p.element_name, p.element_path, p.doc_id);
            if (!result) {
                throw std::runtime_error("Failed to compute attributes panel data for: " + p.element_name);
            }
            auto attrs_json = nlohmann::json::array();
            for (const auto& attr : result->attributes) {
                attrs_json.push_back(AttributeInstanceInfoToJson(attr));
            }
            return {{"element_name", result->element_name}, {"attributes", attrs_json}, {"min_occurs", result->min_occurs}};
        });

    server.RegisterMethod(
        "helper.getNodeDetails", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            auto p = ParseHelperParams(params);
            auto result = container.GetHelperDataService()->ComputeNodeDetails(
                p.schema_id, p.element_name, p.element_path, p.doc_id);
            if (!result) {
                throw std::runtime_error("Element not found: " + p.element_name);
            }
            nlohmann::json j = {
                {"name", result->name},
                {"type_name", result->type_name},
                {"documentation", result->documentation},
                {"xpath", result->xpath},
                {"min_occurs", result->min_occurs},
                {"max_occurs",
                 (result->max_occurs == kUnbounded) ? nlohmann::json("unbounded") : nlohmann::json(result->max_occurs)},
            };
            j["enum_values"] = result->enum_values;
            // Restriction facets
            {
                nlohmann::json r;
                if (result->restrictions.min_inclusive) r["min_inclusive"] = *result->restrictions.min_inclusive;
                if (result->restrictions.max_inclusive) r["max_inclusive"] = *result->restrictions.max_inclusive;
                if (result->restrictions.min_exclusive) r["min_exclusive"] = *result->restrictions.min_exclusive;
                if (result->restrictions.max_exclusive) r["max_exclusive"] = *result->restrictions.max_exclusive;
                if (result->restrictions.min_length) r["min_length"] = *result->restrictions.min_length;
                if (result->restrictions.max_length) r["max_length"] = *result->restrictions.max_length;
                if (result->restrictions.pattern) r["pattern"] = *result->restrictions.pattern;
                if (!r.empty()) j["restrictions"] = r;
            }
            if (!result->appinfo.empty()) {
                j["appinfo"] = result->appinfo;
            }
            if (result->compositor_context) {
                j["compositor_context"] = CompositorContextToJson(*result->compositor_context);
            }
            if (result->instance_state) {
                j["instance_state"] = InstanceStateToJson(*result->instance_state);
            }
            return j;
        });

    server.RegisterMethod(
        "helper.insertElement", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: doc_id");
            }
            if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: schema_id");
            }
            if (!params.contains("parent_path") || !params["parent_path"].is_array()) {
                throw std::invalid_argument("Missing required parameter: parent_path");
            }
            if (!params.contains("element_name") || !params["element_name"].is_string()) {
                throw std::invalid_argument("Missing required parameter: element_name");
            }
            std::vector<std::string> parent_path;
            for (const auto& seg : params["parent_path"]) {
                if (seg.is_string())
                    parent_path.push_back(seg.get<std::string>());
            }
            int cursor_line = -1;
            if (params.contains("cursor_line") && params["cursor_line"].is_number_integer()) {
                cursor_line = params["cursor_line"].get<int>();
            }
            auto result = container.GetHelperDataService()->InsertElement(params["doc_id"].get<std::string>(),
                                                                          params["schema_id"].get<std::string>(),
                                                                          parent_path,
                                                                          params["element_name"].get<std::string>(),
                                                                          cursor_line);
            if (!result.success) {
                throw std::runtime_error("Failed to insert element: " + params["element_name"].get<std::string>());
            }
            return {{"success", true},
                    {"content", result.new_content},
                    {"inserted_line", result.inserted_line},
                    {"inserted_column", result.inserted_column}};
        });

    server.RegisterMethod(
        "helper.insertRequiredChildren",
        [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: doc_id");
            }
            if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: schema_id");
            }
            if (!params.contains("element_path") || !params["element_path"].is_array()) {
                throw std::invalid_argument("Missing required parameter: element_path");
            }
            std::vector<std::string> element_path;
            for (const auto& seg : params["element_path"]) {
                if (seg.is_string())
                    element_path.push_back(seg.get<std::string>());
            }
            auto result = container.GetHelperDataService()->InsertRequiredChildren(
                params["doc_id"].get<std::string>(), params["schema_id"].get<std::string>(), element_path);

            nlohmann::json inserted_arr = nlohmann::json::array();
            for (const auto& ins : result.inserted) {
                inserted_arr.push_back({{"name", ins.name}, {"path", ins.path}, {"depth", ins.depth}});
            }
            return {{"success", result.success},
                    {"new_content", result.new_content},
                    {"inserted", inserted_arr},
                    {"total_inserted", result.total_inserted}};
        });
}

}  // namespace xve
